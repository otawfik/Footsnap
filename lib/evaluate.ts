/**
 * Scoring forecasts, and saying how sure we are about the score: the pieces of the model
 * evaluation (scripts/model-eval.ts, docs/model.md). Pure functions, no I/O.
 *
 * Every rule here is a proper scoring rule or a count, per match, so a mean over matches is the
 * headline number and a bootstrap over matches gives its interval. Two models scored on the same
 * matches are compared on the per-match differences (paired), which is far tighter than comparing
 * two intervals: most of a match's score is the match, not the model.
 */
import { brier, type Outcome, type Probs } from './model';
import { rng } from './rng';

const EPS = 1e-12;
const at = (p: Probs, o: Outcome) => (o === 'H' ? p.home : o === 'D' ? p.draw : p.away);

/** Negative log of the chance given to what happened (natural log; ln 3 = 1.0986 for a third each). */
export const logLoss = (p: Probs, o: Outcome) => -Math.log(Math.max(EPS, at(p, o)));

/**
 * Ranked probability score for the ordered outcomes home > draw > away (Epstein, 1969): the squared
 * distance between the cumulative forecast and the cumulative outcome, halved so it runs 0 to 1.
 * Unlike Brier it knows a draw is closer to a home win than an away win is.
 */
export function rps(p: Probs, o: Outcome): number {
  const c1 = p.home - (o === 'H' ? 1 : 0);
  const c2 = p.home + p.draw - (o === 'A' ? 0 : 1);
  return (c1 * c1 + c2 * c2) / 2;
}

/** 1 when the most likely outcome happened (ties go home, then away, as lib/model.ts pick does). */
export const hit = (p: Probs, o: Outcome) =>
  ((p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') === o ? 1 : 0);

export interface Scores { brier: number; logLoss: number; rps: number; accuracy: number }
export const METRICS = ['brier', 'logLoss', 'rps', 'accuracy'] as const;
export type Metric = (typeof METRICS)[number];

/** All four per-match scores for one forecast. */
export const score = (p: Probs, o: Outcome): Scores => ({ brier: brier(p, o), logLoss: logLoss(p, o), rps: rps(p, o), accuracy: hit(p, o) });

export interface ReliabilityBin { lo: number; hi: number; n: number; said: number; happened: number }

/**
 * Reliability table: each match gives three forecasts (home, draw, away); they're binned by the
 * probability stated and compared with how often they came true. ECE is the n-weighted mean gap
 * |said - happened| over the bins; 0 is perfectly calibrated at this resolution.
 */
export function reliability(ps: Probs[], os: Outcome[], bins = 10): { bins: ReliabilityBin[]; ece: number } {
  const acc = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sum: 0, hits: 0 }));
  ps.forEach((p, i) => {
    for (const [q, k] of [[p.home, 'H'], [p.draw, 'D'], [p.away, 'A']] as [number, Outcome][]) {
      const b = acc[Math.min(bins - 1, Math.floor(q * bins))];
      b.n++; b.sum += q; if (os[i] === k) b.hits++;
    }
  });
  const used = acc.filter((b) => b.n).map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, said: b.sum / b.n, happened: b.hits / b.n }));
  const total = used.reduce((s, b) => s + b.n, 0);
  return { bins: used, ece: total ? used.reduce((s, b) => s + b.n * Math.abs(b.said - b.happened), 0) / total : 0 };
}

export interface Interval { mean: number; lo: number; hi: number }

const mean = (v: ArrayLike<number>) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]; return v.length ? s / v.length : NaN; };
const quantile = (sorted: Float64Array, q: number) => {
  const x = q * (sorted.length - 1);
  const i = Math.floor(x);
  return i + 1 < sorted.length ? sorted[i] + (x - i) * (sorted[i + 1] - sorted[i]) : sorted[i];
};

/**
 * Percentile bootstrap interval for the mean of per-match values. With `blocks` (one label per
 * value) whole blocks are resampled instead of single matches: a sensitivity check for forecasts
 * that share a fit, such as one league's matches on one weekend. Seeded, so a run is reproducible.
 */
export function bootstrapMean(values: ArrayLike<number>, { reps = 10000, level = 0.95, seed = 1, blocks }: { reps?: number; level?: number; seed?: number; blocks?: ArrayLike<number | string> } = {}): Interval {
  const n = values.length;
  const rand = rng(seed);
  const out = new Float64Array(reps);
  if (blocks) {
    const sums = new Map<number | string, [number, number]>();
    for (let i = 0; i < n; i++) {
      const b = sums.get(blocks[i]) ?? [0, 0];
      b[0] += values[i]; b[1]++;
      sums.set(blocks[i], b);
    }
    const groups = [...sums.values()];
    for (let r = 0; r < reps; r++) {
      let s = 0, c = 0;
      for (let k = 0; k < groups.length; k++) { const g = groups[Math.floor(rand() * groups.length)]; s += g[0]; c += g[1]; }
      out[r] = s / c;
    }
  } else {
    for (let r = 0; r < reps; r++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += values[Math.floor(rand() * n)];
      out[r] = s / n;
    }
  }
  out.sort();
  return { mean: mean(values), lo: quantile(out, (1 - level) / 2), hi: quantile(out, 1 - (1 - level) / 2) };
}

/** Paired comparison: the interval on mean(a - b) over the same matches. Below zero, `a` scored lower. */
export function pairedDifference(a: ArrayLike<number>, b: ArrayLike<number>, opts?: Parameters<typeof bootstrapMean>[1]): Interval {
  if (a.length !== b.length) throw new Error('paired comparison needs the same matches for both models');
  const d = new Float64Array(a.length);
  for (let i = 0; i < d.length; i++) d[i] = a[i] - b[i];
  return bootstrapMean(d, opts);
}

/** True when the interval lies wholly on one side of zero. */
export const excludesZero = (i: Interval) => i.lo > 0 || i.hi < 0;
