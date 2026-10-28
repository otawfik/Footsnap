import { describe, expect, it } from 'vitest';
import { applyPick, applyPress, pressedIn, type UserPick } from '../lib/picks';
import type { Match } from '../lib/types';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const fx = (id: number, iso: string, status: Match['status'] = 'TIMED'): Match => ({
  id,
  utcDate: iso,
  status,
  matchday: 9,
  homeTeam: { id: id * 10, name: `H${id}` },
  awayTeam: { id: id * 10 + 1, name: `A${id}` },
  score: { fullTime: { home: null, away: null } },
});
const later = fx(1, '2026-10-31T15:00:00Z');
const other = fx(2, '2026-11-01T16:30:00Z');
const started = fx(3, '2026-10-28T11:00:00Z', 'IN_PLAY');
const md = [later, other, started];

describe('applyPick', () => {
  it('sets, changes and clears a pick', () => {
    let all: Record<string, UserPick> = {};
    all = applyPick(all, 1, 'H');
    expect(all['1']).toEqual({ matchId: 1, outcome: 'H', snapped: false });
    all = applyPick(all, 1, 'A');
    expect(all['1'].outcome).toBe('A');
    all = applyPick(all, 1, 'A');
    expect(all['1']).toBeUndefined();
  });
});

describe('applyPress', () => {
  it('needs a pick, and moves the one Press between open fixtures of the matchday', () => {
    let all: Record<string, UserPick> = {};
    expect(applyPress(all, later, md, NOW)).toBe(all);
    all = applyPick(applyPick(all, 1, 'H'), 2, 'D');
    all = applyPress(all, later, md, NOW);
    expect(pressedIn(all, md)?.id).toBe(1);
    all = applyPress(all, other, md, NOW);
    expect(all['1'].snapped).toBe(false);
    expect(all['2'].snapped).toBe(true);
    all = applyPress(all, other, md, NOW);
    expect(pressedIn(all, md)).toBeNull();
  });

  it("can't move a Press off a match that has kicked off", () => {
    const all: Record<string, UserPick> = { '3': { matchId: 3, outcome: 'H', snapped: true }, '1': { matchId: 1, outcome: 'A', snapped: false } };
    expect(applyPress(all, later, md, NOW)).toBe(all);
    expect(applyPress(all, started, md, NOW)).toBe(all);
  });
});
