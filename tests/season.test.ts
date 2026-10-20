import { describe, expect, it } from 'vitest';
import { lastMatchday, simulate, tableAfter } from '../lib/season';
import { fit } from '../lib/model';
import type { Match, StandingRow } from '../lib/types';
import { season } from './simulate';

const attack = [1.9, 1.3, 1.0, 1.0, 0.9, 0.7];
const defence = [0.6, 0.9, 1.0, 1.0, 1.1, 1.4];
const all = season(attack, defence, { seed: 3 }).map((m, i) => ({ ...m, matchday: Math.floor(i / 3) + 1 }));
const played = all.slice(0, 18);
const future: Match[] = all.slice(18).map((m) => ({ ...m, status: 'TIMED', score: { fullTime: { home: null, away: null } } }));
const matches = [...played, ...future];

function table(): StandingRow[] {
  return tableAfter(played, 99).map((r) => ({
    position: r.position, team: r.team, playedGames: r.played, won: 0, draw: 0, lost: 0,
    points: r.points, goalsFor: r.goalsFor, goalsAgainst: 0, goalDifference: r.goalDifference,
  }));
}

describe('tableAfter', () => {
  it('replays results matchday by matchday', () => {
    expect(lastMatchday(played)).toBe(6);
    const md1 = tableAfter(played, 1);
    expect(md1.reduce((s, r) => s + r.played, 0)).toBe(6);
    const full = tableAfter(played, 6);
    expect(full.reduce((s, r) => s + r.played, 0)).toBe(36);
    expect(full.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('simulate', () => {
  const ratings = fit(played)!;
  const proj = simulate(table(), matches, ratings, 2021, { runs: 1500 });

  it('produces position shares that sum to one, for every team and position', () => {
    for (const p of proj.values()) expect(p.positions.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
    for (let pos = 0; pos < 6; pos++) expect([...proj.values()].reduce((s, p) => s + p.positions[pos], 0)).toBeCloseTo(1, 9);
  });

  it('makes the strongest side the title favourite', () => {
    const best = [...proj.values()].sort((a, b) => b.title - a.title)[0];
    expect(best.teamId).toBe(1);
  });

  it('is reproducible with the same seed', () => {
    const again = simulate(table(), matches, ratings, 2021, { runs: 1500 });
    expect(again.get(1)!.title).toBe(proj.get(1)!.title);
  });

  it('leaves unrelated clubs alone when a result is pinned (common random numbers)', () => {
    const m = future[future.length - 1];
    const pinned = simulate(table(), matches, ratings, 2021, { runs: 1500, forced: new Map([[m.id, [3, 0] as [number, number]]]) });
    const unrelated = [...proj.keys()].filter((id) => id !== m.homeTeam.id && id !== m.awayTeam.id);
    for (const id of unrelated) expect(Math.abs(pinned.get(id)!.avgPoints - proj.get(id)!.avgPoints)).toBeLessThan(1e-9);
  });

  it('is less certain when strength estimates carry uncertainty', () => {
    const certain = simulate(table(), matches, ratings, 2021, { runs: 1500, uncertainty: false });
    const best = [...certain.values()].sort((a, b) => b.title - a.title)[0].teamId;
    expect(proj.get(best)!.title).toBeLessThan(certain.get(best)!.title);
  });

  it('moves the odds when a result is forced (the what-if machine)', () => {
    const forced = new Map(future.filter((m) => m.homeTeam.id === 6 || m.awayTeam.id === 6).map((m) => [m.id, (m.homeTeam.id === 6 ? [5, 0] : [0, 5]) as [number, number]]));
    const whatIf = simulate(table(), matches, ratings, 2021, { runs: 1500, forced });
    // every remaining game of team 6 is pinned to a win, so its final points are certain
    const now = table().find((r) => r.team.id === 6)!.points;
    expect(forced.size).toBeGreaterThan(0);
    expect(whatIf.get(6)!.avgPoints).toBe(now + 3 * forced.size);
    expect(whatIf.get(6)!.avgPoints).toBeGreaterThan(proj.get(6)!.avgPoints);
  });
});

import { trajectory } from '../lib/season';
import { scoreGrid, predict } from '../lib/model';
describe('trajectory and score grid', () => {
  it('tracks position and points every matchday', () => {
    const t = trajectory(played, 1);
    expect(t.map((p) => p.matchday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(t[t.length - 1].points).toBe(tableAfter(played, 6).find((r) => r.team.id === 1)!.points);
    for (let i = 1; i < t.length; i++) expect(t[i].points).toBeGreaterThanOrEqual(t[i - 1].points);
  });

  it('gives a scoreline grid that sums to one and agrees with the outcome odds', () => {
    const r = fit(played)!;
    const g = scoreGrid(r, 1, 6);
    expect(g.flat().reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    const homeWin = g.reduce((s, row, i) => s + row.reduce((t, x, j) => (i > j ? t + x : t), 0), 0);
    expect(homeWin).toBeGreaterThan(0.5);
    expect(Math.abs(homeWin - predict(r, 1, 6).home)).toBeLessThan(0.05);
  });
});
