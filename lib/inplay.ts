/**
 * In-play win probability, on top of the pre-match Poisson model (lib/model.ts).
 *
 * Before kick-off the model expects xgHome and xgAway goals over the 90 minutes. Part-way through,
 * the goals still to come are Poisson with those rates scaled by the share of the match's goals
 * that is still to come, and the final score is the current score plus those goals. At 0' that is
 * exactly the pre-match forecast; at full time nothing is left and the result is certain.
 *
 * Time: the match minute runs 0-90, with each half's added time spread over its 45 minutes (so
 * 45 is half-time, all of the first half's added time played, and 90 is the final whistle). Goals
 * aren't spread evenly across the halves: in 5,404 top-five-league matches from 2021-22 to 2023-24
 * (football-data.co.uk), 45.1% of goals came before half-time, so the second half carries 54.9%.
 * Within a half the rate is flat: the data has goals per half, nothing finer.
 *
 * Score state: a side that's behind attacks and a side that's ahead sits back. In 2022-23 and
 * 2023-24, against the model's own walk-forward forecasts, sides behind at half-time scored 10.9%
 * more second-half goals than expected and sides ahead 3.5% fewer, so the rest of the match's rate
 * is scaled by those factors (level: unchanged, so 0' at 0-0 is still the pre-match forecast).
 * They were measured from half-time on and are applied from any minute, an approximation. On
 * 3,536 held-out matches (2024-25 to 2026-27) it cut the half-time Brier score from 0.4834 to
 * 0.4818, and the half-time leader's win chance went from 3.5 (home side ahead) and 5.3 (away
 * side ahead) points too confident to 1.0 and 2.3 (scripts/inplay-backtest.ts).
 *
 * The forecast is the 90-minute result, like the pre-match one: extra time and penalties are not
 * part of it.
 *
 * The free football-data.org tier gives the score at half-time and full time and, while a match
 * is on, the current score, but no goal minutes and no match clock. So a curve is known exactly
 * only between checkpoints where the score didn't change; where it did, the goals came at minutes
 * the data doesn't say, and the curve there is left open (see `winCurve`).
 */
import type { Match, Score } from './types';

export interface InPlayParams {
  /** share of a match's goals scored in the first half */
  firstHalfShare: number;
  /** multipliers on the rest of the match's goal rate for the side ahead and the side behind */
  ahead: number;
  behind: number;
}

/** Fitted on 2021-22 to 2023-24 in the top five leagues (scripts/inplay-backtest.ts); see the header. */
export const IN_PLAY: InPlayParams = { firstHalfShare: 0.451, ahead: 0.965, behind: 1.109 };
const MAX_GOALS = 10;

export interface Expectation {
  xgHome: number;
  xgAway: number;
}

export interface Chances {
  home: number;
  draw: number;
  away: number;
}

export interface Goals {
  home: number;
  away: number;
}

/** The share of the match's expected goals still to come at a match minute (0 = kick-off, 90 = full time). */
export function goalsLeft(minute: number, firstHalfShare = IN_PLAY.firstHalfShare): number {
  const m = Math.min(90, Math.max(0, minute));
  return m <= 45 ? firstHalfShare * (45 - m) / 45 + (1 - firstHalfShare) : (1 - firstHalfShare) * (90 - m) / 45;
}

function poisson(lambda: number): number[] {
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= MAX_GOALS; k++) p.push(p[k - 1] * lambda / k);
  return p;
}

/**
 * Home / draw / away at the final whistle, given the pre-match expected goals, the minute and the
 * score now. Sums the grid of goals still to come (truncated and renormalised exactly as
 * lib/model.ts predict does, so 0' at 0-0 matches it).
 */
export function inPlay(pre: Expectation, minute: number, score: Goals, params: InPlayParams = IN_PLAY): Chances {
  const left = goalsLeft(minute, params.firstHalfShare);
  const lead = score.home - score.away;
  const state = (d: number) => (d > 0 ? params.ahead : d < 0 ? params.behind : 1);
  const ph = poisson(pre.xgHome * left * state(lead));
  const pa = poisson(pre.xgAway * left * state(-lead));
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      const d = lead + i - j;
      if (d > 0) home += p; else if (d === 0) draw += p; else away += p;
    }
  }
  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total };
}

/** A point in the match where the score is known: kick-off, half-time, full time, or now. */
export interface Checkpoint extends Goals {
  minute: number;
  /** now, in a live match: the minute is estimated from the kick-off time */
  estimated?: boolean;
}

export interface CurvePoint extends Chances {
  minute: number;
}

/**
 * The stretch between two checkpoints. With no goals in it (`goals` 0-0) the score was the same
 * throughout, so `points` traces the curve minute by minute. With goals in it, the data doesn't
 * say when they came, so `points` holds only the two ends.
 */
export interface Stretch {
  from: Checkpoint;
  to: Checkpoint;
  goals: Goals;
  known: boolean;
  points: CurvePoint[];
}

/** The win-probability curve through a match's checkpoints (in order, scores never going down). */
export function winCurve(pre: Expectation, checkpoints: Checkpoint[], step = 1, params: InPlayParams = IN_PLAY): Stretch[] {
  const at = (minute: number, s: Goals): CurvePoint => ({ minute, ...inPlay(pre, minute, s, params) });
  const out: Stretch[] = [];
  for (let k = 1; k < checkpoints.length; k++) {
    const from = checkpoints[k - 1];
    const to = checkpoints[k];
    const goals = { home: to.home - from.home, away: to.away - from.away };
    const known = goals.home === 0 && goals.away === 0;
    const points: CurvePoint[] = [at(from.minute, from)];
    if (known) {
      for (let x = Math.floor(from.minute / step) * step + step; x < to.minute; x += step) points.push(at(x, from));
    }
    points.push(at(to.minute, to));
    out.push({ from, to, goals, known, points });
  }
  return out;
}

/**
 * The live match minute, estimated from the kick-off time (the free data has no match clock).
 * First half: minutes since kick-off, held at 44 until the feed says half-time. Second half:
 * minutes since kick-off less about 18 (a 15-minute break and the first half's added time),
 * held at 89 until the feed says full time. Null when the match isn't in normal time.
 */
export function liveMinute(m: Pick<Match, 'status' | 'utcDate'>, now: number): number | null {
  if (m.status === 'PAUSED') return 45;
  if (m.status !== 'IN_PLAY') return null;
  const e = (now - new Date(m.utcDate).getTime()) / 60_000;
  if (e < 50) return Math.max(0, Math.min(44, Math.floor(e)));
  // between about 50 and 63 minutes after kick-off it's the end of the first half or the break
  if (e < 63) return 45;
  return Math.max(46, Math.min(89, Math.floor(e - 18)));
}

const valid = (s?: Score | null): s is { home: number; away: number } => !!s && s.home !== null && s.away !== null;

/** The score after 90 minutes: the full-time score, or the regular-time one when there was extra time. */
export function regulationScore(m: Match): Goals | null {
  const s = m.score;
  if (s.duration && s.duration !== 'REGULAR') return valid(s.regularTime) ? s.regularTime : null;
  return valid(s.fullTime) ? s.fullTime : null;
}

/**
 * Every point of a match where the data gives the score: kick-off (0-0), half-time (once the second
 * half has started), full time, and, while it's live, now (at the estimated minute). Checkpoints whose
 * scores would go backwards are dropped, so a feed glitch can't draw an impossible curve.
 */
export function checkpoints(m: Match, now: number): Checkpoint[] {
  const out: Checkpoint[] = [{ minute: 0, home: 0, away: 0 }];
  const add = (c: Checkpoint) => {
    const last = out[out.length - 1];
    if (c.minute > last.minute && c.home >= last.home && c.away >= last.away) out.push(c);
  };
  const finished = m.status === 'FINISHED';
  const extra = m.status === 'EXTRA_TIME' || m.status === 'PENALTY_SHOOTOUT';
  if (finished || extra) {
    if (valid(m.score.halfTime)) add({ minute: 45, ...m.score.halfTime });
    const ft = finished ? regulationScore(m) : valid(m.score.regularTime) ? m.score.regularTime : null;
    if (ft) add({ minute: 90, home: ft.home, away: ft.away });
    return out;
  }
  const minute = liveMinute(m, now);
  if (minute === null || !valid(m.score.fullTime)) return out;
  if (minute > 45 && valid(m.score.halfTime)) add({ minute: 45, ...m.score.halfTime });
  if (minute > 0) add({ minute, home: m.score.fullTime.home, away: m.score.fullTime.away, estimated: m.status === 'IN_PLAY' || undefined });
  return out;
}
