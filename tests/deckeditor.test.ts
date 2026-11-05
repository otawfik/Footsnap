import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));

import {
  autoIds, buildDeck, DECK_SAVE_VERSION, deckSummary, migrateDeckSaves, nextDuelSeed, resolveDeck, toggleInDeck, usedDuelSeed, validateDeck,
} from '../lib/decks';
import { cardStats } from '../lib/game';
import { loadDeckSaves } from '../lib/storage';
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
const owned = pool.slice(0, 30);
const ids = (cs: PlayerCard[]) => cs.map((c) => c.id);

describe('editing: add and remove', () => {
  it('adds a card that is out, removes one that is in, and refuses a 13th', () => {
    let r = toggleInDeck([1, 2], 3);
    expect(r).toEqual({ ids: [1, 2, 3], error: null });
    r = toggleInDeck(r.ids, 2);
    expect(r).toEqual({ ids: [1, 3], error: null });
    const full = Array.from({ length: 12 }, (_, i) => i + 1);
    r = toggleInDeck(full, 99);
    expect(r.ids).toBe(full);
    expect(r.error).toMatch(/full/);
    expect(toggleInDeck(full, 5).ids).toHaveLength(11); // a full deck can still lose a card
  });

  it('never adds the same card twice', () => {
    expect(toggleInDeck([7], 7).ids).toEqual([]);
  });
});

describe('your deck: picks first, loans only in the empty slots', () => {
  it('keeps every card you picked, in order, and fills the rest with cheap loans', () => {
    const picked = [1, 2, 3, 4, 5]; // three icons and two elites: no curve applied to your own picks
    const d = resolveDeck(picked, owned, pool, 7);
    expect(ids(d.cards).slice(0, 5)).toEqual(picked);
    expect(d.cards).toHaveLength(12);
    expect(d.loans.size).toBe(7);
    for (const id of d.loans) {
      expect(picked).not.toContain(id);
      expect(cardStats(pool.find((c) => c.id === id)!).cost).toBeLessThanOrEqual(2);
    }
    expect(validateDeck(d.cards)).toBeNull();
  });

  it('a full pick of 12 has no loans', () => {
    const picked = ids(owned.slice(0, 12));
    const d = resolveDeck(picked, owned, pool, 7);
    expect(d.loans.size).toBe(0);
    expect(ids(d.cards)).toEqual(picked);
  });

  it("drops ids you don't own (a card sold, a player transferred), repeats and anything past 12", () => {
    const d = resolveDeck([1, 1, 9999, 150, ...ids(owned.slice(1, 15))], owned, pool, 7);
    expect(ids(d.cards).slice(0, 12)).toEqual(ids(owned.slice(0, 12)));
    expect(d.loans.size).toBe(0);
    expect(ids(d.cards)).not.toContain(150); // in the pool but not owned: not yours to pick
  });

  it('nothing picked is a deck of loans, still 12', () => {
    const d = resolveDeck([], owned, pool, 7);
    expect(d.cards).toHaveLength(12);
    expect(d.loans.size).toBe(12);
  });

  it('is the same deck for the same picks and seed', () => {
    expect(ids(resolveDeck([1, 2], owned, pool, 3).cards)).toEqual(ids(resolveDeck([1, 2], owned, pool, 3).cards));
  });
});

describe('Auto-fill', () => {
  it("picks the automatic deck's own cards, and resolving them gives the automatic deck back", () => {
    for (const mine of [owned, pool.slice(0, 3), pool]) {
      const auto = buildDeck(mine, pool, 5);
      const picks = autoIds(mine, pool, 5);
      expect(picks).toEqual(ids(auto.cards.filter((c) => !auto.loans.has(c.id))));
      const d = resolveDeck(picks, mine, pool, 5);
      expect(validateDeck(d.cards)).toBeNull();
      expect(deckSummary(d.cards).curve).toEqual(deckSummary(auto.cards).curve);
    }
  });
});

describe('validateDeck', () => {
  it('wants exactly 12 different players', () => {
    expect(validateDeck(pool.slice(0, 12))).toBeNull();
    expect(validateDeck(pool.slice(0, 11))).toMatch(/12 cards; this one has 11/);
    expect(validateDeck(pool.slice(0, 13))).toMatch(/has 13/);
    expect(validateDeck([...pool.slice(0, 11), pool[0]])).toMatch(/P1 is in the deck twice/);
  });
});

describe('deckSummary', () => {
  it('counts cards per cost 1-6 and adds up Power', () => {
    const cs = [pool[0], pool[3], pool[10], pool[20], pool[21]];
    const s = deckSummary(cs);
    expect(s.curve.reduce((a, b) => a + b, 0)).toBe(5);
    for (const c of cs) expect(s.curve[cardStats(c).cost - 1]).toBeGreaterThan(0);
    expect(s.power).toBe(cs.reduce((t, c) => t + cardStats(c).power, 0));
  });
});

describe('saved decks: versions and migration', () => {
  it('reads the current version as it is, cleaning bad ids', () => {
    expect(migrateDeckSaves({ version: 2, decks: { 2021: { ids: [1, 2, 2, 'x', 3.5, 4] } } })).toEqual({ version: DECK_SAVE_VERSION, decks: { 2021: { ids: [1, 2, 4] } } });
  });

  it('migrates version 1 (a bare competition → ids record)', () => {
    expect(migrateDeckSaves({ 2021: [5, 6], 2014: [7] })).toEqual({ version: 2, decks: { 2021: { ids: [5, 6] }, 2014: { ids: [7] } } });
  });

  it('caps a save at 12 cards', () => {
    const many = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(migrateDeckSaves({ 2021: many }).decks[2021].ids).toHaveLength(12);
  });

  it('anything unreadable or from the future becomes "no saved decks", never an error', () => {
    for (const raw of [null, 'deck', 42, [1, 2], { version: 99, decks: { 2021: { ids: [1] } } }]) expect(migrateDeckSaves(raw)).toEqual({ version: 2, decks: {} });
  });

  describe('through storage', () => {
    beforeEach(() => store.clear());

    it('loads a version 1 save as version 2', async () => {
      store.set('fs.decks', JSON.stringify({ 2021: [9, 8, 7] }));
      expect(await loadDeckSaves()).toEqual({ version: 2, decks: { 2021: { ids: [9, 8, 7] } } });
    });

    it('nothing saved, or a corrupt save, loads as no saved decks', async () => {
      expect(await loadDeckSaves()).toEqual({ version: 2, decks: {} });
      store.set('fs.decks', '{not json');
      expect(await loadDeckSaves()).toEqual({ version: 2, decks: {} });
    });
  });
});

describe('the next duel', () => {
  it('keeps its seed until a duel uses it, per competition', () => {
    const a = nextDuelSeed(2021, 1000);
    expect(nextDuelSeed(2021, 2000)).toBe(a); // going back and forth doesn't redraw it
    expect(nextDuelSeed(2014, 1000)).not.toBe(a);
    usedDuelSeed(2021);
    expect(nextDuelSeed(2021, 3000)).not.toBe(a);
  });
});
