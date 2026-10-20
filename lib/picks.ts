/**
 * Picks: call home / draw / away before kick-off, and Snap one pick per matchday
 * to double the stakes, Marvel Snap style. Correct: +2 (Snapped +4). Wrong: 0
 * (Snapped −2). The model plays too: it picks its likeliest outcome, predicted
 * only from results before that match's day, and Snaps its most confident call
 * of the matchday.
 */
import type { Match } from './types';
import { isFinished } from './football';
import { fit, outcome, pick as modelPick, predict, Outcome } from './model';

export interface UserPick {
  matchId: number;
  outcome: Outcome;
  snapped: boolean;
}

export const points = (correct: boolean, snapped: boolean) => (correct ? (snapped ? 4 : 2) : snapped ? -2 : 0);

export const locked = (m: Match, now = Date.now()) =>
  new Date(m.utcDate).getTime() <= now || (m.status !== 'SCHEDULED' && m.status !== 'TIMED');

export interface Tally {
  you: number;
  model: number;
  settled: number;
  youCorrect: number;
  modelCorrect: number;
}

/** The model's call for a match, from results before its day. */
export function modelCall(matches: Match[], m: Match): { outcome: Outcome; confidence: number } | null {
  const day = m.utcDate.slice(0, 10);
  const r = fit(matches.filter((g) => isFinished(g) && g.utcDate.slice(0, 10) < day));
  if (!r) return null;
  const p = predict(r, m.homeTeam.id, m.awayTeam.id);
  const o = modelPick(p);
  return { outcome: o, confidence: o === 'H' ? p.home : o === 'A' ? p.away : p.draw };
}

export function tally(picks: UserPick[], matches: Match[]): Tally {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const t: Tally = { you: 0, model: 0, settled: 0, youCorrect: 0, modelCorrect: 0 };
  const settled = picks.map((p) => ({ p, m: byId.get(p.matchId) })).filter((x): x is { p: UserPick; m: Match } => !!x.m && isFinished(x.m));

  // the model's Snap: its most confident call in each matchday you played
  const calls = new Map(settled.map(({ m }) => [m.id, modelCall(matches, m)]));
  const snapOf = new Map<number, number>();
  for (const { m } of settled) {
    const md = m.matchday ?? -1;
    const c = calls.get(m.id);
    const best = snapOf.get(md);
    if (c && (best === undefined || c.confidence > (calls.get(best)?.confidence ?? 0))) snapOf.set(md, m.id);
  }
  for (const { p, m } of settled) {
    const o = outcome(m);
    t.settled++;
    const youRight = p.outcome === o;
    t.you += points(youRight, p.snapped);
    if (youRight) t.youCorrect++;
    const c = calls.get(m.id);
    if (c) {
      const right = c.outcome === o;
      t.model += points(right, snapOf.get(m.matchday ?? -1) === m.id);
      if (right) t.modelCorrect++;
    }
  }
  return t;
}
