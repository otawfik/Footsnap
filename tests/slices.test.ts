import { describe, expect, it } from 'vitest';
import { runInSlices } from '../lib/slices';
import { backtestCalls, backtestSteps, fitSeason, predict, seasonPrior } from '../lib/model';
import { season } from './simulate';

/** a clock that moves `stepMs` every time it's read after a step, and a queue standing in for the event loop */
function harness(stepMs: number) {
  let t = 0;
  const queue: (() => void)[] = [];
  return {
    now: () => (t += stepMs / 2), // read twice per step: once at the slice start or loop check
    later: (fn: () => void) => {
      queue.push(fn);
      return () => {
        const i = queue.indexOf(fn);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    /** run one queued slice; false when nothing is waiting */
    turn: () => {
      const fn = queue.shift();
      fn?.();
      return !!fn;
    },
  };
}

function* count(n: number) {
  for (let i = 0; i < n; i++) yield i;
}

describe('work in slices', () => {
  it('does nothing until the thread is free, then every step in order, then done once', () => {
    const h = harness(1);
    const seen: number[] = [];
    let done = 0;
    runInSlices(count(50), (v) => seen.push(v), () => done++, { budgetMs: 8, now: h.now, later: h.later });
    expect(seen).toEqual([]);
    let slices = 0;
    while (h.turn()) slices++;
    expect(seen).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(done).toBe(1);
    expect(slices).toBeGreaterThan(3);
  });

  it('gives the thread back once the budget is spent: a slow step is a slice of its own', () => {
    const h = harness(20);
    const perSlice: number[] = [];
    let seen = 0;
    runInSlices(count(5), () => seen++, () => {}, { budgetMs: 8, now: h.now, later: h.later });
    let before = 0;
    while (h.turn()) {
      perSlice.push(seen - before);
      before = seen;
    }
    expect(perSlice).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it('stops when cancelled, between slices', () => {
    const h = harness(20);
    let seen = 0;
    let done = 0;
    const cancel = runInSlices(count(5), () => seen++, () => done++, { budgetMs: 8, now: h.now, later: h.later });
    h.turn();
    h.turn();
    cancel();
    expect(h.turn()).toBe(false);
    expect(seen).toBe(2);
    expect(done).toBe(0);
  });

  it('finishes an empty job', () => {
    const h = harness(1);
    let done = 0;
    runInSlices(count(0), () => {}, () => done++, { now: h.now, later: h.later });
    h.turn();
    expect(done).toBe(1);
  });
});

describe('the backtest a day at a time', () => {
  const last = season([1.6, 1.3, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6], [0.7, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3], { seed: 3, start: Date.UTC(2024, 7, 1) });
  const games = season([1.7, 1.5, 1.3, 1.1, 1.0, 0.9, 0.85, 0.8], [0.7, 0.75, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2], { seed: 9 });
  const prior = seasonPrior(last, games);

  it('each step is one day, forecast from the days before it only', () => {
    const steps = [...backtestSteps(games, 30, prior)];
    expect(steps.length).toBeGreaterThan(5);
    for (const day of steps) {
      const d = day[0].match.utcDate.slice(0, 10);
      expect(day.every((c) => c.match.utcDate.slice(0, 10) === d)).toBe(true);
      const earlier = games.filter((g) => g.utcDate.slice(0, 10) < d);
      expect(earlier.length).toBeGreaterThanOrEqual(30);
      const r = fitSeason(earlier, prior)!;
      expect(day[0].p).toEqual(predict(r, day[0].match.homeTeam.id, day[0].match.awayTeam.id));
      expect(day[0].rates.home).toBeCloseTo(earlier.filter((g) => g.score.fullTime.home! > g.score.fullTime.away!).length / earlier.length);
    }
    expect(steps.flat().map((c) => c.match.utcDate)).toEqual([...steps.flat().map((c) => c.match.utcDate)].sort());
  });

  it('run in slices, it gives exactly the calls of the one-go backtest', () => {
    const h = harness(3);
    const out: ReturnType<typeof backtestCalls> = [];
    let done = false;
    runInSlices(backtestSteps(games, 30, prior), (day) => out.push(...day), () => (done = true), { now: h.now, later: h.later });
    while (h.turn());
    expect(done).toBe(true);
    expect(out).toEqual(backtestCalls(games, 30, prior));
    expect(out.length).toBe(games.length - games.filter((g) => games.filter((x) => x.utcDate.slice(0, 10) < g.utcDate.slice(0, 10)).length < 30).length);
  });
});
