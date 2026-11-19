import { describe, expect, it } from 'vitest';
import { hasImpact, resultImpact, seasonAt, stakesFor, tableAt } from '../lib/impact';
import { fit } from '../lib/model';
import { simulate } from '../lib/season';
import type { Match } from '../lib/types';
import { season } from './simulate';

// a 10-team double round robin from known strengths: the first 50 games played, the other 40 to come
const attack = [1.8, 1.5, 1.3, 1.1, 1.0, 1.0, 0.9, 0.85, 0.8, 0.7];
const defence = [0.6, 0.75, 0.85, 0.95, 1.0, 1.0, 1.05, 1.1, 1.2, 1.35];
const all = season(attack, defence, { seed: 11 });
const PLAYED = 50;
const matches: Match[] = all.map((m, i) => (i < PLAYED ? m : { ...m, status: 'TIMED', score: { fullTime: { home: null, away: null } } }));
const ratings = fit(matches.slice(0, 40))!;
const RUNS = 800;
const sample = matches.slice(40, PLAYED);

const outcome = (m: Match) => Math.sign((m.score.fullTime.home ?? 0) - (m.score.fullTime.away ?? 0));

describe('the league at kick-off', () => {
  it('holds every result from before kick-off and nothing from it or after', () => {
    const m = matches[45];
    const t = tableAt(matches, m.utcDate, 2021);
    expect(t).toHaveLength(10);
    expect(t.reduce((s, r) => s + r.playedGames, 0)).toBe(2 * 45);
    expect(t.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const w = seasonAt(matches, m.utcDate, 2021);
    expect(w.filter((x) => x.status === 'FINISHED')).toHaveLength(45);
    expect(w.find((x) => x.id === m.id)!.status).toBe('SCHEDULED');
  });
});

describe('resultImpact', () => {
  const impacts = sample.map((m) => ({ m, r: resultImpact(m, matches, ratings, 2021, { runs: RUNS })! }));

  it('keeps every chance a probability and every count consistent', () => {
    for (const { m, r } of impacts) {
      expect(r.runs).toBe(RUNS);
      expect(r.fixtures).toBe(all.length - matches.findIndex((x) => x.id === m.id));
      for (const side of [r.home, r.away])
        for (const p of [side.before, side.after]) {
          for (const k of ['title', 'top', 'relegation'] as const) {
            expect(p[k]).toBeGreaterThanOrEqual(0);
            expect(p[k]).toBeLessThanOrEqual(1);
            // shares of RUNS simulated seasons
            expect(Math.abs(p[k] * RUNS - Math.round(p[k] * RUNS))).toBeLessThan(1e-6);
          }
          expect(p.title).toBeLessThanOrEqual(p.top);
          expect(p.positions.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
        }
    }
  });

  it('never lowers the winner\'s chances or raises the loser\'s', () => {
    let decided = 0;
    for (const { m, r } of impacts) {
      const o = outcome(m);
      if (!o) continue;
      decided++;
      const [win, lose] = o > 0 ? [r.home, r.away] : [r.away, r.home];
      expect(win.after.title).toBeGreaterThanOrEqual(win.before.title);
      expect(win.after.top).toBeGreaterThanOrEqual(win.before.top);
      expect(win.after.relegation).toBeLessThanOrEqual(win.before.relegation);
      expect(lose.after.title).toBeLessThanOrEqual(lose.before.title);
      expect(lose.after.relegation).toBeGreaterThanOrEqual(lose.before.relegation);
      expect(win.after.avgPoints).toBeGreaterThan(win.before.avgPoints);
      expect(lose.after.avgPoints).toBeLessThan(lose.before.avgPoints);
    }
    expect(decided).toBeGreaterThan(4);
  });

  it('moves only the two sides\' points: every other fixture plays out the same in both runs', () => {
    const { m, r } = impacts[0];
    expect(resultImpact(m, matches, ratings, 2021, { runs: RUNS })).toBe(r); // cached
    const table = tableAt(matches, m.utcDate, 2021);
    const world = seasonAt(matches, m.utcDate, 2021);
    const before = simulate(table, world, ratings, 2021, { runs: RUNS });
    const after = simulate(table, world, ratings, 2021, { runs: RUNS, forced: new Map([[m.id, [m.score.fullTime.home!, m.score.fullTime.away!] as [number, number]]]) });
    expect(before.get(m.homeTeam.id)!.title).toBe(r.home.before.title);
    expect(after.get(m.awayTeam.id)!.relegation).toBe(r.away.after.relegation);
    for (const row of table) {
      if (row.team.id === m.homeTeam.id || row.team.id === m.awayTeam.id) continue;
      expect(after.get(row.team.id)!.avgPoints).toBeCloseTo(before.get(row.team.id)!.avgPoints, 9);
    }
  });

  it('is reproducible with the same seed', () => {
    const { m, r } = impacts[3];
    const again = resultImpact(m, matches, ratings, 2021, { runs: RUNS, seed: 7 })!;
    expect(again.home.after.title).toBe(r.home.after.title);
  });

  it('skips games that are not finished, and Champions League knockouts', () => {
    expect(resultImpact(matches[60], matches, ratings, 2021)).toBeNull();
    expect(hasImpact({ ...matches[10], stage: 'LAST_16' }, 2001)).toBe(false);
    expect(hasImpact({ ...matches[10], stage: 'LEAGUE_STAGE' }, 2001)).toBe(true);
  });

  it('shows the stakes each competition has', () => {
    expect(stakesFor(2021).map((s) => s.key)).toEqual(['title', 'top', 'relegation']);
    expect(stakesFor(2001).map((s) => s.key)).toEqual(['top', 'relegation']);
  });
});
