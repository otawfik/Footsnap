import { describe, expect, it } from 'vitest';
import { backtestCalls, seasonPrior } from '../lib/model';
import { blend, CURRENT, eloDiffs, fitOrderedLogit, lowScoreFactor, orderedLogit, poissonForecasts, poissonRates, probsFromRates, scoredMatches, type PoissonSpec } from '../lib/variants';
import { rng } from '../lib/rng';
import { season } from './simulate';
import type { Outcome } from '../lib/model';

const ATTACK = [1.7, 1.4, 1.2, 1.0, 1.0, 0.9, 0.8, 0.7];
const DEFENCE = [0.6, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.4];
const last = season(ATTACK, DEFENCE, { seed: 21, start: Date.UTC(2024, 7, 1) }).map((m) => ({ ...m, id: m.id + 10_000 }));
const now = season(ATTACK, DEFENCE, { seed: 22 });
const withSpec = (over: Partial<PoissonSpec>): PoissonSpec => ({ ...CURRENT, ...over });

describe('the generalised fitter', () => {
  it("reproduces the app's model exactly at CURRENT, with and without last season", () => {
    for (const prev of [last, null]) {
      const calls = backtestCalls(now, 30, seasonPrior(prev, now));
      const mine = poissonForecasts(prev, now, CURRENT);
      expect(mine.length).toBe(calls.length);
      expect(scoredMatches(now).map((m) => m.id)).toEqual(calls.map((c) => c.match.id));
      calls.forEach((c, i) => {
        expect(mine[i].home).toBeCloseTo(c.p.home, 10);
        expect(mine[i].draw).toBeCloseTo(c.p.draw, 10);
        expect(mine[i].away).toBeCloseTo(c.p.away, 10);
      });
    }
  });

  it('scores nothing until a season has enough results', () => {
    expect(scoredMatches(now.slice(0, 30))).toHaveLength(0);
    expect(scoredMatches(now, 10).length).toBeGreaterThan(scoredMatches(now, 30).length);
  });

  it('every knob moves the forecasts, and none of them breaks the probabilities', () => {
    const base = poissonRates(last, now, CURRENT);
    for (const over of [{ halfLife: 60 }, { halfLife: 60, fadePrior: true }, { pool: true, halfLife: 200 }, { rateGames: 200 }, { homeGames: 10 }, { priorGames: 4 }, { carry: 0.5 }] as Partial<PoissonSpec>[]) {
      const r = poissonRates(last, now, withSpec(over));
      expect(r.home.length).toBe(base.home.length);
      expect(r.home.some((v, i) => Math.abs(v - base.home[i]) > 1e-6)).toBe(true);
      expect([...r.home, ...r.away].every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
  });

  it('time decay follows a club whose form changes mid-season', () => {
    // team 8 is the weakest side for the first half of the fixtures and the strongest for the second
    const first = season(ATTACK, DEFENCE, { seed: 30 });
    const flipped = season([...ATTACK.slice(0, 7), 2.2], [...DEFENCE.slice(0, 7), 0.5], { seed: 31 });
    const mixed = first.map((m, i) => (i < first.length / 2 ? m : flipped[i]));
    const lastHome = scoredMatches(mixed).map((m, i) => [m, i] as const).filter(([m]) => m.homeTeam.id === 8).pop()![1];
    const flat = poissonRates(null, mixed, CURRENT);
    const decayed = poissonRates(null, mixed, withSpec({ halfLife: 5, fadePrior: true }));
    expect(decayed.home[lastHome]).toBeGreaterThan(flat.home[lastHome]);
  });

  it('pooling last season in stands in for the prior', () => {
    // with no prior games at all, a pooled fit still knows who was good last season
    const pooled = poissonRates(last, now, withSpec({ pool: true, priorGames: 0 }));
    const blank = poissonRates(null, now, withSpec({ priorGames: 0 }));
    // the weakest side's first scored home match (the simulated second leg is where it hosts)
    const weakHome = scoredMatches(now).findIndex((m) => m.homeTeam.id === 8);
    expect(weakHome).toBeGreaterThanOrEqual(0);
    expect(pooled.home[weakHome]).toBeGreaterThan(0);
    expect(pooled.home[weakHome]).not.toBeCloseTo(blank.home[weakHome], 3);
  });
});

describe('scoreline corrections', () => {
  it('rho = 0 and no boost is the plain Poisson grid', () => {
    const p = probsFromRates(1.6, 1.1);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 12);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("Dixon-Coles' factors move mass between the four low scores and leave the total alone", () => {
    const [h, a, rho] = [1.4, 1.1, -0.1];
    const cell = (i: number, j: number) => Math.exp(-h - a) * h ** i * a ** j;
    let shift = 0;
    for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]]) shift += cell(i, j) * (lowScoreFactor(i, j, h, a, rho) - 1);
    expect(shift).toBeCloseTo(0, 12);
    expect(lowScoreFactor(2, 1, h, a, rho)).toBe(1);
    // negative rho: more 0-0 and 1-1, so more draws
    expect(probsFromRates(h, a, rho).draw).toBeGreaterThan(probsFromRates(h, a).draw);
    expect(probsFromRates(h, a, 0.1).draw).toBeLessThan(probsFromRates(h, a).draw);
  });

  it('draw inflation raises the draw and keeps the home / away ratio', () => {
    const plain = probsFromRates(1.5, 1.2);
    const boosted = probsFromRates(1.5, 1.2, 0, 0.1);
    expect(boosted.draw).toBeGreaterThan(plain.draw);
    expect(boosted.home / boosted.away).toBeCloseTo(plain.home / plain.away, 10);
    expect(boosted.home + boosted.draw + boosted.away).toBeCloseTo(1, 12);
  });
});

describe('Elo and the ordered logit', () => {
  const spec = { k: 20, home: 60, carry: 0.8, margin: true };

  it('rates the stronger side higher using earlier days only', () => {
    const d = eloDiffs([last, now], spec);
    const first = now.slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    // late in the second season team 1 at home to team 8 is rated well ahead
    const late = first.filter((m) => m.homeTeam.id === 1 && m.awayTeam.id === 8).pop()!;
    expect(d.get(late.id)!).toBeGreaterThan(40);
    // the very first match of the first season is level: nothing has happened yet
    const opening = last.slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate))[0];
    expect(d.get(opening.id)).toBe(0);
    // changing a result changes no rating difference on that day or before
    const edited = now.map((m) => (m.id === late.id ? { ...m, score: { ...m.score, fullTime: { home: 0, away: 9 } } } : m));
    const d2 = eloDiffs([last, edited], spec);
    for (const m of first) if (m.utcDate.slice(0, 10) <= late.utcDate.slice(0, 10)) expect(d2.get(m.id)).toBe(d.get(m.id));
  });

  it('carries ratings over the summer and seats a new club where the departed ones were', () => {
    // team 8 (weakest) is replaced by team 9
    const next = now.map((m) => ({ ...m, homeTeam: m.homeTeam.id === 8 ? { id: 9, name: 'Team 9' } : m.homeTeam, awayTeam: m.awayTeam.id === 8 ? { id: 9, name: 'Team 9' } : m.awayTeam }));
    const d = eloDiffs([last, next], spec);
    const opening = next.slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate)).find((m) => m.awayTeam.id === 9 && m.homeTeam.id === 1)!;
    expect(d.get(opening.id)!).toBeGreaterThan(50);
  });

  it('recovers an ordered logit from simulated results', () => {
    const truth = { b: 1.3, c1: -0.6, gap: 1.1 };
    const r = rng(4);
    const x: number[] = [];
    const o: Outcome[] = [];
    for (let i = 0; i < 20000; i++) {
      const xi = (r() - 0.5) * 2;
      const p = orderedLogit(truth, xi);
      const u = r();
      x.push(xi);
      o.push(u < p.home ? 'H' : u < p.home + p.draw ? 'D' : 'A');
    }
    const m = fitOrderedLogit(x, o);
    expect(m.b).toBeCloseTo(truth.b, 0);
    expect(Math.abs(m.b - truth.b)).toBeLessThan(0.1);
    expect(Math.abs(m.c1 - truth.c1)).toBeLessThan(0.06);
    expect(Math.abs(m.gap - truth.gap)).toBeLessThan(0.06);
    const p = orderedLogit(m, 0.3);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 12);
    expect(orderedLogit(m, 1).home).toBeGreaterThan(orderedLogit(m, -1).home);
  });

  it('a blend is a weighted average', () => {
    const a = { home: 0.6, draw: 0.3, away: 0.1 };
    const b = { home: 0.2, draw: 0.3, away: 0.5 };
    const c = blend(a, b, 0.75);
    expect(c.home).toBeCloseTo(0.5, 12);
    expect(c.draw).toBeCloseTo(0.3, 12);
    expect(c.away).toBeCloseTo(0.2, 12);
  });
});
