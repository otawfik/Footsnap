import { describe, expect, it } from 'vitest';
import { fit, predict } from '../lib/model';
import { checkpoints, goalsLeft, inPlay, liveMinute, regulationScore, winCurve, IN_PLAY } from '../lib/inplay';
import type { Match } from '../lib/types';
import { season } from './simulate';

const pre = { xgHome: 1.6, xgAway: 1.1 };
const sum = (c: { home: number; draw: number; away: number }) => c.home + c.draw + c.away;
const KO = Date.UTC(2026, 10, 8, 15, 0);
const at = (min: number) => KO + min * 60_000;
const match = (status: Match['status'], fullTime: [number, number] | null, halfTime?: [number, number] | null, extra: Partial<Match['score']> = {}): Match => ({
  id: 1,
  utcDate: new Date(KO).toISOString(),
  status,
  homeTeam: { id: 1, name: 'Home' },
  awayTeam: { id: 2, name: 'Away' },
  score: {
    fullTime: { home: fullTime?.[0] ?? null, away: fullTime?.[1] ?? null },
    halfTime: halfTime ? { home: halfTime[0], away: halfTime[1] } : { home: null, away: null },
    ...extra,
  },
});

describe('goalsLeft', () => {
  it('runs from all of the match to none of it, with the first half carrying its measured share', () => {
    expect(goalsLeft(0)).toBe(1);
    expect(goalsLeft(45)).toBeCloseTo(1 - IN_PLAY.firstHalfShare, 12);
    expect(goalsLeft(90)).toBe(0);
    expect(goalsLeft(-5)).toBe(1);
    expect(goalsLeft(120)).toBe(0);
    for (let m = 1; m <= 90; m++) expect(goalsLeft(m)).toBeLessThan(goalsLeft(m - 1));
  });
});

describe('inPlay', () => {
  it('gives probabilities that sum to one at every minute and score', () => {
    for (const m of [0, 10, 45, 60, 89, 90])
      for (const s of [{ home: 0, away: 0 }, { home: 2, away: 1 }, { home: 0, away: 3 }]) expect(sum(inPlay(pre, m, s))).toBeCloseTo(1, 12);
  });

  it("at 0' and 0-0 is exactly the pre-match forecast", () => {
    const r = fit(season([1.8, 1.3, 1.0, 0.8], [0.7, 0.9, 1.1, 1.3], { seed: 3 }))!;
    for (const [h, a] of [[1, 4], [4, 1], [2, 3]]) {
      const p = predict(r, h, a);
      const q = inPlay(p, 0, { home: 0, away: 0 });
      expect(q.home).toBeCloseTo(p.home, 12);
      expect(q.draw).toBeCloseTo(p.draw, 12);
      expect(q.away).toBeCloseTo(p.away, 12);
    }
  });

  it('is certain at full time', () => {
    expect(inPlay(pre, 90, { home: 2, away: 1 })).toEqual({ home: 1, draw: 0, away: 0 });
    expect(inPlay(pre, 90, { home: 1, away: 1 })).toEqual({ home: 0, draw: 1, away: 0 });
    expect(inPlay(pre, 90, { home: 0, away: 3 })).toEqual({ home: 0, draw: 0, away: 1 });
  });

  it('moves toward the side that scores', () => {
    for (const m of [5, 30, 60, 85]) {
      const level = inPlay(pre, m, { home: 0, away: 0 });
      const homeGoal = inPlay(pre, m, { home: 1, away: 0 });
      const awayGoal = inPlay(pre, m, { home: 0, away: 1 });
      expect(homeGoal.home).toBeGreaterThan(level.home);
      expect(homeGoal.away).toBeLessThan(level.away);
      expect(awayGoal.away).toBeGreaterThan(level.away);
      expect(awayGoal.home).toBeLessThan(level.home);
    }
  });

  it('makes a lead safer as the clock runs down', () => {
    let last = 0;
    for (const m of [0, 20, 45, 70, 85, 90]) {
      const p = inPlay(pre, m, { home: 1, away: 0 }).home;
      expect(p).toBeGreaterThan(last);
      last = p;
    }
  });

  it('is symmetric: swapping the sides and the score swaps home and away', () => {
    const swapped = { xgHome: pre.xgAway, xgAway: pre.xgHome };
    for (const m of [0, 30, 45, 75])
      for (const [h, a] of [[0, 0], [1, 0], [2, 3]]) {
        const p = inPlay(pre, m, { home: h, away: a });
        const q = inPlay(swapped, m, { home: a, away: h });
        expect(q.home).toBeCloseTo(p.away, 12);
        expect(q.away).toBeCloseTo(p.home, 12);
        expect(q.draw).toBeCloseTo(p.draw, 12);
      }
    // evenly matched and level: home and away are equal
    const even = inPlay({ xgHome: 1.3, xgAway: 1.3 }, 60, { home: 1, away: 1 });
    expect(even.home).toBeCloseTo(even.away, 12);
  });

  it('gives the side behind a little more of the remaining goals than the flat model', () => {
    const flat = { ...IN_PLAY, ahead: 1, behind: 1 };
    const s = { home: 1, away: 0 };
    expect(inPlay(pre, 45, s).home).toBeLessThan(inPlay(pre, 45, s, flat).home);
    // and changes nothing while it's level
    expect(inPlay(pre, 45, { home: 1, away: 1 })).toEqual(inPlay(pre, 45, { home: 1, away: 1 }, flat));
  });
});

describe('liveMinute', () => {
  it('estimates the minute from the kick-off time and the status', () => {
    expect(liveMinute(match('IN_PLAY', [0, 0]), at(0))).toBe(0);
    expect(liveMinute(match('IN_PLAY', [0, 0]), at(23.5))).toBe(23);
    expect(liveMinute(match('IN_PLAY', [0, 0]), at(48))).toBe(44); // added time: not over until the feed says so
    expect(liveMinute(match('PAUSED', [0, 0]), at(55))).toBe(45);
    expect(liveMinute(match('IN_PLAY', [0, 0]), at(56))).toBe(45);
    expect(liveMinute(match('IN_PLAY', [0, 0]), at(80))).toBe(62);
    expect(liveMinute(match('IN_PLAY', [0, 0]), at(115))).toBe(89);
    expect(liveMinute(match('FINISHED', [0, 0]), at(115))).toBeNull();
    expect(liveMinute(match('TIMED', null), at(-30))).toBeNull();
  });
});

describe('checkpoints', () => {
  it('a finished match: kick-off, half-time and full time', () => {
    expect(checkpoints(match('FINISHED', [2, 1], [1, 0]), at(200))).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 45, home: 1, away: 0 },
      { minute: 90, home: 2, away: 1 },
    ]);
  });

  it('after extra time, full time is the 90-minute score', () => {
    const m = match('FINISHED', [2, 1], [0, 0], { duration: 'EXTRA_TIME', regularTime: { home: 1, away: 1 } });
    expect(regulationScore(m)).toEqual({ home: 1, away: 1 });
    expect(checkpoints(m, at(200)).at(-1)).toEqual({ minute: 90, home: 1, away: 1 });
    // no 90-minute score: no full-time checkpoint rather than a wrong one
    expect(checkpoints(match('FINISHED', [2, 1], [0, 0], { duration: 'EXTRA_TIME' }), at(200)).at(-1)?.minute).toBe(45);
  });

  it('live: half-time once the second half is on, then now at the estimated minute', () => {
    expect(checkpoints(match('IN_PLAY', [1, 0], [1, 0]), at(30))).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 30, home: 1, away: 0, estimated: true },
    ]);
    expect(checkpoints(match('PAUSED', [1, 0], [1, 0]), at(52))).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 45, home: 1, away: 0 },
    ]);
    expect(checkpoints(match('IN_PLAY', [1, 2], [1, 0]), at(88))).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 45, home: 1, away: 0 },
      { minute: 70, home: 1, away: 2, estimated: true },
    ]);
  });

  it('drops a checkpoint whose score would go backwards', () => {
    expect(checkpoints(match('FINISHED', [1, 0], [2, 0]), at(200))).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 45, home: 2, away: 0 },
    ]);
  });

  it('nothing but kick-off before it starts', () => {
    expect(checkpoints(match('TIMED', null), at(-60))).toEqual([{ minute: 0, home: 0, away: 0 }]);
  });
});

describe('winCurve', () => {
  it('traces a goalless stretch minute by minute and leaves one with goals open', () => {
    const [first, second] = winCurve(pre, checkpoints(match('FINISHED', [1, 0], [0, 0]), at(200)));
    expect(first.known).toBe(true);
    expect(first.points.map((p) => p.minute)).toEqual(Array.from({ length: 46 }, (_, i) => i));
    expect(first.points[0].home).toBeCloseTo(inPlay(pre, 0, { home: 0, away: 0 }).home, 12);
    expect(second.known).toBe(false);
    expect(second.goals).toEqual({ home: 1, away: 0 });
    expect(second.points.map((p) => p.minute)).toEqual([45, 90]);
    expect(second.points[1]).toEqual({ minute: 90, home: 1, draw: 0, away: 0 });
  });

  it('every point sums to one, and the ends join up', () => {
    const curve = winCurve(pre, checkpoints(match('FINISHED', [3, 3], [2, 2]), at(200)));
    for (const s of curve) for (const p of s.points) expect(sum(p)).toBeCloseTo(1, 12);
    expect(curve[0].points.at(-1)).toEqual(curve[1].points[0]);
  });
});
