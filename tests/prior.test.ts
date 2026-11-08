import { describe, expect, it } from 'vitest';
import { fit, fitSeason, priorFrom, seasonPrior, backtest, PRIOR_CARRY } from '../lib/model';
import { seasonStartYear } from '../lib/football';
import { resolve } from '../lib/proxy';
import { season } from './simulate';
import type { Match } from '../lib/types';

const ATTACK = [1.6, 1.2, 1, 1, 0.9, 0.8];
const DEFENCE = [0.7, 0.9, 1, 1, 1.1, 1.3];
const last = season(ATTACK, DEFENCE, { seed: 3 });

describe('last-season prior', () => {
  it('pulls last season toward average by PRIOR_CARRY', () => {
    const r = fit(last, 120)!;
    const p = priorFrom(r, [1, 2, 3, 4, 5, 6]);
    const a1 = r.attack.get(1)!;
    expect(p.attack.get(1)).toBeCloseTo(Math.exp(PRIOR_CARRY * Math.log(a1)), 6);
    expect(p.attack.get(1)!).toBeGreaterThan(1);
    expect(p.attack.get(1)!).toBeLessThan(a1);
  });

  it('starts a promoted club where the clubs that left were', () => {
    const r = fit(last, 120)!;
    // team 6 went down, team 7 came up
    const p = priorFrom(r, [1, 2, 3, 4, 5, 7], 1);
    expect(p.attack.get(7)).toBeCloseTo(r.attack.get(6)!, 6);
    expect(p.defence.get(7)).toBeCloseTo(r.defence.get(6)!, 6);
  });

  it('keeps a strong side ahead of a hot start (the early-season overreaction)', () => {
    // this season team 4 (average last year) starts like the best side; team 1 starts ordinarily
    const hot = season([1, 1.2, 1, 1.7, 0.9, 0.8], [1, 0.9, 1, 0.6, 1.1, 1.3], { seed: 9 }).slice(0, 15);
    const without = fit(hot)!;
    const withPrior = fitSeason(hot, seasonPrior(last, hot))!;
    const gap = (r: typeof without) => r.attack.get(1)! / r.defence.get(1)! - r.attack.get(4)! / r.defence.get(4)!;
    expect(gap(withPrior)).toBeGreaterThan(gap(without));
  });

  it('falls back to the league-average fit without last season', () => {
    const hot = season(ATTACK, DEFENCE, { seed: 5 }).slice(0, 20);
    expect(seasonPrior(null, hot)).toBeNull();
    expect(fitSeason(hot, null)!.attack.get(1)).toBeCloseTo(fit(hot)!.attack.get(1)!, 9);
  });

  it('backtests with a prior', () => {
    const now = season(ATTACK, DEFENCE, { seed: 11 });
    const bt = backtest(now, 6, seasonPrior(last, now));
    expect(bt?.n).toBeGreaterThan(0);
  });
});

describe('seasonStartYear', () => {
  const at = (d: string) => ({ utcDate: d }) as Match;
  it('reads the season from its earliest fixture', () => {
    expect(seasonStartYear([at('2027-03-01T15:00:00Z'), at('2026-08-15T14:00:00Z')])).toBe(2026);
    expect(seasonStartYear([at('2027-01-10T15:00:00Z')])).toBe(2026);
    expect(seasonStartYear([])).toBeNull();
  });
});

describe('proxy cache for past seasons', () => {
  it('caches a past season for half a day, the live season for 30 s', () => {
    const past = resolve('competitions/2021/matches', new URLSearchParams('season=2025&status=FINISHED'))!;
    const live = resolve('competitions/2021/matches', new URLSearchParams())!;
    expect(past.cacheControl).toContain('s-maxage=43200');
    expect(live.cacheControl).toContain('s-maxage=30');
  });
});
