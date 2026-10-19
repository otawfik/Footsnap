import { describe, expect, it } from 'vitest';
import { backtest, brier, fit, predict } from '../lib/model';
import { season } from './simulate';

const attack = [1.8, 1.5, 1.3, 1.1, 1.0, 1.0, 0.9, 0.85, 0.8, 0.7];
const defence = [0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4];

describe('fit', () => {
  it('needs a handful of results', () => {
    expect(fit(season(attack, defence).slice(0, 5))).toBeNull();
  });

  it('recovers the order of attack and defence strengths', () => {
    const many = [1, 2, 3].flatMap((s) => season(attack, defence, { seed: s }).map((m) => ({ ...m, id: m.id + s * 1000 })));
    const r = fit(many)!;
    const fittedAttack = attack.map((_, i) => r.attack.get(i + 1)!);
    const fittedDefence = defence.map((_, i) => r.defence.get(i + 1)!);
    expect(fittedAttack[0]).toBeGreaterThan(fittedAttack[4]);
    expect(fittedAttack[4]).toBeGreaterThan(fittedAttack[9]);
    expect(fittedDefence[0]).toBeLessThan(fittedDefence[4]);
    expect(fittedDefence[4]).toBeLessThan(fittedDefence[9]);
  });

  it('learns home advantage from the results', () => {
    const r = fit(season(attack, defence, { seed: 4 }))!;
    expect(r.muHome).toBeGreaterThan(r.muAway);
  });

  it('shrinks early-season strengths toward average', () => {
    const early = fit(season(attack, defence, { seed: 5 }).slice(0, 12))!;
    for (const v of early.attack.values()) expect(Math.abs(Math.log(v))).toBeLessThan(0.6);
  });
});

describe('predict', () => {
  const r = fit(season(attack, defence, { seed: 6 }))!;

  it('gives probabilities that sum to one', () => {
    const p = predict(r, 1, 10);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
  });

  it('favours the stronger side, home or away', () => {
    expect(predict(r, 1, 10).home).toBeGreaterThan(0.6);
    expect(predict(r, 10, 1).away).toBeGreaterThan(predict(r, 10, 1).home);
  });

  it('treats unknown teams as average', () => {
    const p = predict(r, 999, 998);
    expect(p.xgHome).toBeCloseTo(r.muHome, 9);
    expect(p.xgAway).toBeCloseTo(r.muAway, 9);
  });
});

describe('brier', () => {
  it('is 0 for a certain correct forecast and 2 for a certain wrong one', () => {
    const certainHome = { home: 1, draw: 0, away: 0, xgHome: 0, xgAway: 0, score: [0, 0] as [number, number] };
    expect(brier(certainHome, 'H')).toBe(0);
    expect(brier(certainHome, 'A')).toBe(2);
  });
});

describe('backtest', () => {
  it('beats always-home and base rates when strengths really differ', () => {
    const b = backtest(season(attack, defence, { seed: 7 }))!;
    expect(b.n).toBeGreaterThan(40);
    expect(b.accuracy).toBeGreaterThan(b.homeBaselineAccuracy);
    expect(b.brier).toBeLessThan(b.rateBaselineBrier);
  });

  it('only uses results from before each match', () => {
    // with identical teams there is nothing to learn: the model can't beat base rates by much
    const flat = backtest(season(Array(10).fill(1), Array(10).fill(1), { seed: 8 }))!;
    expect(flat.brier).toBeGreaterThan(flat.rateBaselineBrier - 0.03);
  });

  it('returns null without enough history', () => {
    expect(backtest(season(attack, defence).slice(0, 20))).toBeNull();
  });
});
