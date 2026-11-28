import { describe, expect, it } from 'vitest';
import { bootstrapMean, excludesZero, hit, logLoss, pairedDifference, reliability, rps, score } from '../lib/evaluate';
import { brier, type Outcome, type Probs } from '../lib/model';
import { rng } from '../lib/rng';

const p = (home: number, draw: number, away: number): Probs => ({ home, draw, away });
const third = p(1 / 3, 1 / 3, 1 / 3);

describe('scoring rules', () => {
  it('log loss is ln 3 for a third each and 0 for a certain correct call', () => {
    expect(logLoss(third, 'D')).toBeCloseTo(Math.log(3), 12);
    expect(logLoss(p(1, 0, 0), 'H')).toBeCloseTo(0, 12);
    expect(Number.isFinite(logLoss(p(1, 0, 0), 'A'))).toBe(true);
  });

  it('RPS is 0 when right, 1 when certain of the opposite end, and kinder to a near miss', () => {
    expect(rps(p(1, 0, 0), 'H')).toBe(0);
    expect(rps(p(1, 0, 0), 'A')).toBe(1);
    expect(rps(p(1, 0, 0), 'D')).toBe(0.5);
    // worked by hand: cumulative forecast (0.5, 0.8) against a draw's (0, 1)
    expect(rps(p(0.5, 0.3, 0.2), 'D')).toBeCloseTo((0.25 + 0.04) / 2, 12);
    // Brier can't tell these two apart; RPS can: after a home win, mass on the draw is closer than mass on away
    expect(brier(p(0.6, 0.4, 0), 'H')).toBeCloseTo(brier(p(0.6, 0, 0.4), 'H'), 12);
    expect(rps(p(0.6, 0.4, 0), 'H')).toBeLessThan(rps(p(0.6, 0, 0.4), 'H'));
  });

  it('a hit is the most likely outcome coming true', () => {
    expect(hit(p(0.5, 0.3, 0.2), 'H')).toBe(1);
    expect(hit(p(0.5, 0.3, 0.2), 'D')).toBe(0);
    expect(score(third, 'H')).toMatchObject({ accuracy: 1 });
    expect(score(third, 'H').brier).toBeCloseTo(2 / 3, 12);
  });
});

describe('reliability', () => {
  it('is zero ECE when stated chances match frequencies, and the gap when they do not', () => {
    // ten matches at 70 / 20 / 10 with exactly 7 home wins, 2 draws, 1 away win
    const os: Outcome[] = [...Array(7).fill('H'), 'D', 'D', 'A'];
    const calibrated = reliability(os.map(() => p(0.7, 0.2, 0.1)), os);
    expect(calibrated.ece).toBeCloseTo(0, 12);
    expect(calibrated.bins.reduce((s, b) => s + b.n, 0)).toBe(30);
    // the same forecasts when the home side always wins: gaps of 0.3, 0.2 and 0.1, a third each
    const over = reliability(os.map(() => p(0.7, 0.2, 0.1)), os.map(() => 'H' as Outcome));
    expect(over.ece).toBeCloseTo(0.2, 12);
  });
});

describe('bootstrap', () => {
  const r = rng(7);
  const noise = Array.from({ length: 400 }, () => r());

  it('brackets the mean, narrows with more data, and repeats exactly for a seed', () => {
    const a = bootstrapMean(noise, { reps: 2000, seed: 3 });
    expect(a.lo).toBeLessThan(a.mean);
    expect(a.hi).toBeGreaterThan(a.mean);
    // uniform(0,1): sd 0.289, so the 95% interval at n = 400 is about +-0.028
    expect(a.hi - a.lo).toBeGreaterThan(0.04);
    expect(a.hi - a.lo).toBeLessThan(0.075);
    expect(bootstrapMean(noise, { reps: 2000, seed: 3 })).toEqual(a);
    const small = bootstrapMean(noise.slice(0, 50), { reps: 2000, seed: 3 });
    expect(small.hi - small.lo).toBeGreaterThan(a.hi - a.lo);
  });

  it('a paired difference sees a small consistent edge that two separate intervals would miss', () => {
    const better = noise.map((v) => v - 0.01);
    const d = pairedDifference(better, noise, { reps: 2000 });
    expect(d.mean).toBeCloseTo(-0.01, 9);
    expect(excludesZero(d)).toBe(true);
    // unpaired, the intervals overlap almost entirely
    expect(bootstrapMean(better, { reps: 2000 }).hi).toBeGreaterThan(bootstrapMean(noise, { reps: 2000 }).lo);
  });

  it('does not call noise a difference', () => {
    // the same values against themselves in reverse order: the mean difference is exactly zero
    const other = noise.slice().reverse();
    const d = pairedDifference(other, noise, { reps: 2000 });
    expect(d.mean).toBeCloseTo(0, 12);
    expect(excludesZero(d)).toBe(false);
    expect(() => pairedDifference([1], [1, 2])).toThrow();
  });

  it('resampling whole blocks widens the interval when values move together within a block', () => {
    // 40 blocks of 10 identical values: really 40 observations, not 400
    const r3 = rng(5);
    const values: number[] = [];
    const blocks: number[] = [];
    for (let b = 0; b < 40; b++) { const v = r3(); for (let k = 0; k < 10; k++) { values.push(v); blocks.push(b); } }
    const byMatch = bootstrapMean(values, { reps: 2000 });
    const byBlock = bootstrapMean(values, { reps: 2000, blocks });
    expect(byBlock.hi - byBlock.lo).toBeGreaterThan(2 * (byMatch.hi - byMatch.lo));
  });
});
