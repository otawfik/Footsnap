import { describe, expect, it } from 'vitest';
import { calibration, chanceOf, COIN_BRIER, upsets, brier, type Call, type Outcome } from '../lib/model';
import type { Match } from '../lib/types';

const call = (id: number, home: number, draw: number, away: number, o: Outcome): Call => ({
  match: { id } as Match,
  p: { home, draw, away, xgHome: 0, xgAway: 0, score: [0, 0] },
  rates: { home: 0.45, draw: 0.25, away: 0.3, xgHome: 0, xgAway: 0, score: [0, 0] },
  o,
});

describe('calibration', () => {
  it('bins all three forecasts of every call and counts what happened', () => {
    const calls = [call(1, 0.7, 0.2, 0.1, 'H'), call(2, 0.7, 0.2, 0.1, 'A'), call(3, 0.5, 0.3, 0.2, 'D')];
    const bins = calibration(calls, 5);
    expect(bins.reduce((t, b) => t + b.n, 0)).toBe(9);
    const top = bins.find((b) => b.lo === 0.6)!;
    // two 70% home calls, one came true
    expect(top).toMatchObject({ n: 2, happened: 0.5 });
    expect(top.said).toBeCloseTo(0.7);
    // 10% and 20% forecasts: the 10% away call came true once
    const low = bins.find((b) => b.lo === 0)!;
    expect(low).toMatchObject({ n: 2, happened: 0.5 });
    expect(bins.every((b) => b.n > 0)).toBe(true);
  });

  it('a 100% forecast lands in the top bin, not past it', () => {
    expect(calibration([call(1, 1, 0, 0, 'H')], 5).map((b) => b.lo)).toEqual([0, 0.8]);
  });
});

describe('upsets and baselines', () => {
  it('orders by the chance given to what happened, lowest first', () => {
    const calls = [call(1, 0.6, 0.25, 0.15, 'H'), call(2, 0.6, 0.25, 0.15, 'A'), call(3, 0.5, 0.3, 0.2, 'D')];
    expect(upsets(calls, 2).map((c) => c.match.id)).toEqual([2, 3]);
    expect(chanceOf(calls[1])).toBe(0.15);
  });

  it("the coin-toss line is the Brier score of saying a third for everything", () => {
    expect(brier({ home: 1 / 3, draw: 1 / 3, away: 1 / 3, xgHome: 0, xgAway: 0, score: [0, 0] }, 'H')).toBeCloseTo(COIN_BRIER);
  });
});
