/**
 * Beat the model: your forecasts against the model's, scored the way the model is scored on the
 * "How good is the model?" page. You call home / draw / away and say how sure you are (Lean 50%,
 * Confident 70%, Sure 90%); the rest is split evenly between the other two outcomes. Each finished
 * match gets the same multi-class Brier score (lib/model.ts brier) for you and for the model's
 * forecast from the results before that match's day (forecastBefore), so both are judged on the
 * same fixtures with the same information cut-off. Forecasts lock at kick-off.
 */
import type { Match } from './types';
import { isFinished } from './football';
import { brier, COIN_BRIER, forecastBefore, outcome, type Call, type Outcome, type Prediction, type Prior, type Probs, type Ratings } from './model';
import { locked } from './picks';

/** How sure you are: the chance you give the outcome you call. */
export const LEVELS = [
  { label: 'Lean', p: 0.5 },
  { label: 'Confident', p: 0.7 },
  { label: 'Sure', p: 0.9 },
] as const;

export interface Forecast {
  matchId: number;
  competitionId: number;
  outcome: Outcome;
  /** the chance given to `outcome` (one of LEVELS) */
  confidence: number;
  /** when it was last changed (ms); a forecast changed at or after kick-off is never scored */
  at: number;
}

/** Your call as a forecast: `confidence` on the outcome, the rest split evenly between the other two. */
export function probs(o: Outcome, confidence: number): Probs {
  const rest = (1 - confidence) / 2;
  return { home: o === 'H' ? confidence : rest, draw: o === 'D' ? confidence : rest, away: o === 'A' ? confidence : rest };
}

/** Call an outcome (keeping how sure you were), or clear the forecast by calling the same one again. No change once locked. */
export function applyOutcome(all: Record<string, Forecast>, m: Match, competitionId: number, o: Outcome, now = Date.now()): Record<string, Forecast> {
  if (locked(m, now)) return all;
  const key = String(m.id);
  const cur = all[key];
  if (cur?.outcome === o) {
    const { [key]: _, ...rest } = all;
    return rest;
  }
  return { ...all, [key]: { matchId: m.id, competitionId, outcome: o, confidence: cur?.confidence ?? LEVELS[0].p, at: now } };
}

/** Change how sure you are about a call already made. No change once locked. */
export function applyConfidence(all: Record<string, Forecast>, m: Match, confidence: number, now = Date.now()): Record<string, Forecast> {
  const cur = all[String(m.id)];
  if (!cur || locked(m, now) || cur.confidence === confidence) return all;
  return { ...all, [String(m.id)]: { ...cur, confidence, at: now } };
}

export interface ScoredMatch {
  match: Match;
  o: Outcome;
  you: Probs;
  model: Prediction;
  youBrier: number;
  modelBrier: number;
}

export interface BeatRecord {
  /** finished matches with your forecast and the model's: the only ones scored */
  rows: ScoredMatch[];
  n: number;
  /** mean Brier score over `rows` (lower is better); null when nothing is scored */
  you: number | null;
  model: number | null;
  /** matches where your Brier was lower, higher, or the same */
  youCloser: number;
  modelCloser: number;
  level: number;
  /** forecasts on matches not finished yet */
  waiting: number;
  /** finished, but the model had no forecast yet (too few results before that day) */
  noModel: number;
  /** changed at or after kick-off, so not scored */
  late: number;
}

const EPS = 1e-9;

/**
 * Score your forecasts on `matches` (one competition's season): every forecast whose match has
 * finished, made before kick-off, and that the model also forecast. Forecasts for other
 * competitions' matches are ignored. Newest match first.
 */
export function scoreForecasts(forecasts: Forecast[], matches: Match[], prior?: Prior | null): BeatRecord {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const cache = new Map<string, Ratings | null>();
  const rows: ScoredMatch[] = [];
  let waiting = 0, noModel = 0, late = 0;
  for (const f of forecasts) {
    const m = byId.get(f.matchId);
    if (!m) continue;
    if (!isFinished(m) || m.score.fullTime.home === null || m.score.fullTime.away === null) {
      waiting++;
      continue;
    }
    if (f.at >= new Date(m.utcDate).getTime()) {
      late++;
      continue;
    }
    const model = forecastBefore(matches, m, prior, cache);
    if (!model) {
      noModel++;
      continue;
    }
    const o = outcome(m);
    const you = probs(f.outcome, f.confidence);
    rows.push({ match: m, o, you, model, youBrier: brier(you, o), modelBrier: brier(model, o) });
  }
  rows.sort((a, b) => b.match.utcDate.localeCompare(a.match.utcDate) || b.match.id - a.match.id);
  const n = rows.length;
  const mean = (k: 'youBrier' | 'modelBrier') => (n ? rows.reduce((s, r) => s + r[k], 0) / n : null);
  return {
    rows,
    n,
    you: mean('youBrier'),
    model: mean('modelBrier'),
    youCloser: rows.filter((r) => r.youBrier < r.modelBrier - EPS).length,
    modelCloser: rows.filter((r) => r.modelBrier < r.youBrier - EPS).length,
    level: rows.filter((r) => Math.abs(r.youBrier - r.modelBrier) <= EPS).length,
    waiting,
    noModel,
    late,
  };
}

/** Who's ahead on the record: the lower mean Brier. */
export function leader(r: Pick<BeatRecord, 'you' | 'model'>): 'you' | 'model' | 'level' | null {
  if (r.you === null || r.model === null) return null;
  return Math.abs(r.you - r.model) <= EPS ? 'level' : r.you < r.model ? 'you' : 'model';
}

export interface Strategy {
  label: string;
  brier: number;
  model?: boolean;
}

/**
 * Simple ways to fill in this page, scored on walk-forward calls (lib/model.ts backtestCalls):
 * the model, the league's H/D/A rates so far, the home side at Lean and at Sure every game, and
 * a third each. Best (lowest Brier) first.
 */
export function strategies(calls: Pick<Call, 'p' | 'rates' | 'o'>[]): Strategy[] {
  const n = calls.length;
  if (!n) return [];
  const mean = (f: (c: Pick<Call, 'p' | 'rates' | 'o'>) => number) => calls.reduce((s, c) => s + f(c), 0) / n;
  const [lean, , sure] = LEVELS;
  return [
    { label: 'FootSnap model', brier: mean((c) => brier(c.p, c.o)), model: true },
    { label: 'League H/D/A rates so far', brier: mean((c) => brier(c.rates, c.o)) },
    { label: `Home win, ${lean.label} (${lean.p * 100}%), every game`, brier: mean((c) => brier(probs('H', lean.p), c.o)) },
    { label: `Home win, ${sure.label} (${sure.p * 100}%), every game`, brier: mean((c) => brier(probs('H', sure.p), c.o)) },
    { label: 'A third each', brier: COIN_BRIER },
  ].sort((a, b) => a.brier - b.brier);
}
