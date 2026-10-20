import { describe, expect, it } from 'vitest';
import { drawPack, ODDS, PACK_SIZE, packSeed } from '../lib/packs';
import { locked, points, tally } from '../lib/picks';
import type { PlayerCard, Rarity } from '../lib/cards';
import type { Match } from '../lib/types';
import { season } from './simulate';

const card = (id: number, rarity: Rarity): PlayerCard => ({
  id, name: `P${id}`, banner: `P${id}`, line: 'FW', position: 'Forward', age: 25, dateOfBirth: null, nationality: 'X',
  team: { id: 1, name: 'T', shortName: 'T', colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } },
  rarity, rank: null, stats: null, power: null, abilities: [],
});
const pool = [
  ...[1, 2, 3].map((i) => card(i, 'icon')),
  ...[4, 5, 6, 7, 8, 9, 10].map((i) => card(i, 'elite')),
  ...Array.from({ length: 10 }, (_, i) => card(11 + i, 'rare')),
  ...Array.from({ length: 200 }, (_, i) => card(100 + i, 'common')),
];

describe('packs', () => {
  it('publishes odds that sum to one', () => {
    expect(ODDS.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1);
  });

  it('draws five distinct cards, best last, same pack for the same day', () => {
    const seed = packSeed('2026-10-20', 2021);
    const a = drawPack(pool, seed);
    expect(a.length).toBe(PACK_SIZE);
    expect(new Set(a.map((c) => c.id)).size).toBe(PACK_SIZE);
    expect(drawPack(pool, seed).map((c) => c.id)).toEqual(a.map((c) => c.id));
    const rank = { common: 0, rare: 1, elite: 2, icon: 3 };
    expect(a.map((c) => rank[c.rarity])).toEqual([...a.map((c) => rank[c.rarity])].sort((x, y) => x - y));
  });

  it('lands near the published odds over many packs', () => {
    const counts: Record<string, number> = {};
    for (let d = 0; d < 2000; d++) for (const c of drawPack(pool, packSeed(`day${d}`, 1))) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    const total = 2000 * PACK_SIZE;
    expect(counts.icon / total).toBeGreaterThan(0.025);
    expect(counts.icon / total).toBeLessThan(0.055);
    expect(counts.common / total).toBeGreaterThan(0.55);
  });

  it('copes with a tiny pool', () => {
    expect(drawPack(pool.slice(0, 2), 1).length).toBe(2);
  });
});

describe('picks', () => {
  it('scores like Snap: doubled stakes either way', () => {
    expect([points(true, false), points(true, true), points(false, false), points(false, true)]).toEqual([2, 4, 0, -2]);
  });

  it('locks at kick-off', () => {
    const m = { utcDate: '2026-10-20T15:00:00Z', status: 'TIMED' } as Match;
    expect(locked(m, Date.parse('2026-10-20T14:59:00Z'))).toBe(false);
    expect(locked(m, Date.parse('2026-10-20T15:00:00Z'))).toBe(true);
  });

  it('tallies you against the model on finished matches only', () => {
    const matches = season([1.6, 1.2, 1.0, 0.9, 0.8, 0.7], [0.7, 0.9, 1.0, 1.0, 1.2, 1.3], { seed: 9 }).map((m, i) => ({ ...m, matchday: Math.floor(i / 3) + 1 }));
    const late = matches.slice(-6);
    const picks = late.map((m, i) => ({ matchId: m.id, outcome: 'H' as const, snapped: i === 0 }));
    const t = tally([...picks, { matchId: 999999, outcome: 'A', snapped: false }], matches);
    expect(t.settled).toBe(6);
    expect(t.youCorrect).toBe(late.filter((m) => (m.score.fullTime.home as number) > (m.score.fullTime.away as number)).length);
    expect(t.modelCorrect).toBeGreaterThanOrEqual(0);
  });
});
