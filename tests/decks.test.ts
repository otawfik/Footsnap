import { describe, expect, it } from 'vitest';
import { buildDeck, CURVE, MIN_ONE_DROPS, opponentDeck, recordLine } from '../lib/decks';
import { cardStats } from '../lib/game';
import type { PlayerCard, Rarity } from '../lib/cards';

const mk = (id: number, rarity: Rarity, line: 'GK' | 'DF' | 'MF' | 'FW', rank: number | null = null): PlayerCard => ({
  id, name: `P${id}`, banner: `P${id}`, line, position: line, age: 25, dateOfBirth: null, nationality: 'X',
  team: { id: id % 5, name: 'T', shortName: 'T', colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } },
  rarity, rank, stats: rank ? { goals: 6, assists: 2, penalties: 0, played: 8 } : null, power: rank ? 14 : null, abilities: [],
});
const pool = [
  ...[1, 2, 3].map((i) => mk(i, 'icon', 'FW', i)),
  ...[4, 5, 6, 7, 8, 9, 10].map((i) => mk(i, 'elite', 'MF', i)),
  ...Array.from({ length: 10 }, (_, i) => mk(11 + i, 'rare', 'FW', 11 + i)),
  ...Array.from({ length: 60 }, (_, i) => mk(100 + i, 'common', (['GK', 'DF', 'MF', 'FW'] as const)[i % 4])),
];

describe('buildDeck', () => {
  it('fills a small collection with loans to exactly 12', () => {
    const d = buildDeck(pool.slice(0, 3), pool, 1);
    expect(d.cards).toHaveLength(12);
    expect(d.loans.size).toBe(9);
    expect(new Set(d.cards.map((c) => c.id)).size).toBe(12);
    for (const id of d.loans) expect(cardStats(d.cards.find((c) => c.id === id)!).cost).toBeLessThanOrEqual(2);
  });

  it('keeps cheap cards for the early turns in a big collection', () => {
    const d = buildDeck(pool, pool, 2);
    expect(d.loans.size).toBe(0);
    expect(d.cards.filter((c) => cardStats(c).cost <= 2).length).toBeGreaterThanOrEqual(4);
    expect(d.cards.some((c) => c.rarity === 'icon')).toBe(true);
  });

  it('keeps a collection of stars playable: the curve caps expensive cards and loans fill the cheap slots', () => {
    const stars = pool.filter((c) => c.rarity !== 'common'); // 20 cards, all cost 3+
    const d = buildDeck(stars, pool, 4);
    expect(d.cards).toHaveLength(12);
    for (const [min, most] of CURVE) expect(d.cards.filter((c) => cardStats(c).cost >= min).length).toBe(most);
    expect(d.loans.size).toBe(4);
    expect(d.cards.filter((c) => c.rarity === 'icon')).toHaveLength(3);
  });
});

describe('opponentDeck', () => {
  it('mirrors your cost curve with different players', () => {
    const yours = buildDeck(pool, pool, 3).cards;
    const theirs = opponentDeck(yours, pool, 3);
    expect(theirs).toHaveLength(12);
    expect(new Set(theirs.map((c) => c.id)).size).toBe(12);
    // a player may repeat only at a cost where your deck already holds everyone in the league at that cost
    const atCost = (cs: PlayerCard[], cost: number) => cs.filter((c) => cardStats(c).cost === cost).length;
    for (const c of theirs) {
      if (!yours.some((y) => y.id === c.id)) continue;
      const cost = cardStats(c).cost;
      expect(atCost(pool, cost)).toBeLessThanOrEqual(atCost(yours, cost));
    }
    const curve = (cs: PlayerCard[]) => cs.map((c) => cardStats(c).cost).sort().join();
    expect(curve(theirs)).toBe(curve(yours));
  });
});

describe('recordLine', () => {
  it('reads W · D · L, with the best prize once something has been won', () => {
    expect(recordLine({ played: 12, won: 7, drawn: 1, best: 8 })).toEqual([['W', '7'], ['D', '1'], ['L', '4'], ['Best', '×8']]);
    expect(recordLine({ played: 2, won: 0, drawn: 0, best: 0 })).toEqual([['W', '0'], ['D', '0'], ['L', '2']]);
  });
});

describe('one-drops', () => {
  const ones = (cs: PlayerCard[]) => cs.filter((c) => cardStats(c).cost === 1).length;
  it('a collection of stars and forwards still carries two cost-1 cards, owned ones first', () => {
    const fwOnly = pool.filter((c) => c.rarity !== 'common' || c.line === 'FW' || c.line === 'MF');
    const d = buildDeck(fwOnly, pool, 3);
    expect(d.cards).toHaveLength(12);
    expect(ones(d.cards)).toBe(MIN_ONE_DROPS);
    expect(new Set(d.cards.map((c) => c.id)).size).toBe(12);
    // the swapped-in one-drops aren't owned, so they're loans
    for (const c of d.cards.filter((c) => cardStats(c).cost === 1)) expect(d.loans.has(c.id)).toBe(true);
    const withDefs = buildDeck([...fwOnly, pool.find((c) => c.rarity === 'common' && c.line === 'DF')!], pool, 3);
    expect(ones(withDefs.cards)).toBe(MIN_ONE_DROPS);
    expect(withDefs.loans.size).toBe(1);
  });
  it('a small collection gets one-drops among its loans', () => {
    expect(ones(buildDeck(pool.slice(0, 3), pool, 5).cards)).toBeGreaterThanOrEqual(MIN_ONE_DROPS);
  });
});
