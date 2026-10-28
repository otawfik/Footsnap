/**
 * Picks: free points only. Call home / draw / away before kick-off, and Press one
 * pick per matchday to double it, Marvel Snap style (stored as `snapped`).
 * Right: +2 (Pressed +4). Wrong: 0 (Pressed −2). The model plays too: it picks its
 * likeliest outcome, predicted only from results before that match's day, and
 * Presses its most confident call of the matchday.
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

/** Set, change or clear (same outcome again) the pick for a match. A cleared pick drops its Press. */
export function applyPick(all: Record<string, UserPick>, matchId: number, o: Outcome): Record<string, UserPick> {
  const cur = all[String(matchId)];
  if (cur?.outcome === o) {
    const { [String(matchId)]: _, ...rest } = all;
    return rest;
  }
  return { ...all, [String(matchId)]: { matchId, outcome: o, snapped: cur?.snapped ?? false } };
}

/** The match whose pick is Pressed in this group of fixtures (one matchday), if any. */
export const pressedIn = (all: Record<string, UserPick>, fixtures: Match[]) => fixtures.find((m) => all[String(m.id)]?.snapped) ?? null;

/**
 * Press or un-press the pick on `m`. One Press per matchday: pressing moves it off any other
 * open fixture of the same matchday, and a Press can't move off a match that's already locked.
 */
export function applyPress(all: Record<string, UserPick>, m: Match, matchday: Match[], now = Date.now()): Record<string, UserPick> {
  const cur = all[String(m.id)];
  if (!cur || locked(m, now)) return all;
  if (cur.snapped) return { ...all, [String(m.id)]: { ...cur, snapped: false } };
  const other = pressedIn(all, matchday.filter((x) => x.id !== m.id));
  if (other && locked(other, now)) return all;
  const next = { ...all, [String(m.id)]: { ...cur, snapped: true } };
  if (other) next[String(other.id)] = { ...next[String(other.id)], snapped: false };
  return next;
}
