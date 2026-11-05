/**
 * Match predictions from a Poisson goals model (Maher, 1982; the base of Dixon & Coles, 1997).
 *
 * Each team gets an attack and a defence strength. Expected goals are
 *   home: mu_home * attack[home] * defence[away]
 *   away: mu_away * attack[away] * defence[home]
 * where mu_home / mu_away are the league's average home and away goals, so home
 * advantage is whatever this season's results say it is. Strengths are fitted by
 * iterative scaling, which converges to the maximum-likelihood fit while
 * accounting for who each team played. A prior keeps early-season strengths from
 * swinging on a handful of results: PRIOR_GAMES_LAST virtual games at each team's
 * last-season strength, pulled toward average by PRIOR_CARRY (promoted clubs start
 * where the relegated ones were). Without last season's results it falls back to
 * PRIOR_GAMES league-average games. Backtested on 2,105 matches in five leagues
 * (2025-26 and 2026-27, each predicted from games before its day), the last-season
 * prior cut the Brier score from 0.613 to 0.599, and from 0.628 to 0.597 in the
 * first ten rounds: with only an average prior, Brighton's +17 goal difference
 * after nine games made them a 43% title pick.
 *
 * Scorelines are independent Poissons, so P(home win), P(draw), P(away win)
 * and the most likely score come from summing the score grid.
 */
import type { Match } from './types';
import { isFinished } from './football';

export const PRIOR_GAMES = 8;
/** virtual games at last season's strength, and how much of that strength carries over (backtested) */
export const PRIOR_GAMES_LAST = 16;
export const PRIOR_CARRY = 0.85;
const MAX_GOALS = 10;

export interface Ratings {
  attack: Map<number, number>;
  defence: Map<number, number>;
  muHome: number;
  muAway: number;
  games: number;
}

export interface Prediction {
  home: number;
  draw: number;
  away: number;
  xgHome: number;
  xgAway: number;
  score: [number, number];
}

const played = (m: Match) =>
  isFinished(m) && m.score.fullTime.home !== null && m.score.fullTime.away !== null;

/** Where each team starts before this season's results: a strength per team (1 = league average). */
export interface Prior {
  attack: Map<number, number>;
  defence: Map<number, number>;
}

/**
 * A prior from last season's fitted ratings, pulled toward average by `carry` (0 = everyone average,
 * 1 = last season exactly; applied in log space, since strengths multiply). Clubs that weren't in the
 * league last season (promoted) start where the clubs that left it (relegated) were.
 */
export function priorFrom(last: Ratings, teams: Iterable<number>, carry = PRIOR_CARRY): Prior {
  const pull = (v: number) => Math.exp(carry * Math.log(v));
  const now = new Set(teams);
  const gone = [...last.attack.keys()].filter((t) => !now.has(t));
  const avg = (m: Map<number, number>, ids: number[]) =>
    ids.length ? Math.exp(ids.reduce((s, t) => s + Math.log(m.get(t)!), 0) / ids.length) : 1;
  const promotedAttack = avg(last.attack, gone);
  const promotedDefence = avg(last.defence, gone);
  const attack = new Map<number, number>();
  const defence = new Map<number, number>();
  for (const t of now) {
    attack.set(t, pull(last.attack.get(t) ?? promotedAttack));
    defence.set(t, pull(last.defence.get(t) ?? promotedDefence));
  }
  return { attack, defence };
}

export function fit(matches: Match[], iterations = 60, prior?: Prior, priorGames = PRIOR_GAMES): Ratings | null {
  const games = matches.filter(played);
  if (games.length < 6) return null;
  const hg = games.reduce((s, m) => s + (m.score.fullTime.home as number), 0);
  const ag = games.reduce((s, m) => s + (m.score.fullTime.away as number), 0);
  const muHome = Math.max(hg / games.length, 0.2);
  const muAway = Math.max(ag / games.length, 0.2);

  const teams = new Set<number>();
  for (const m of games) { teams.add(m.homeTeam.id); teams.add(m.awayTeam.id); }
  const attack = new Map<number, number>();
  const defence = new Map<number, number>();
  for (const t of teams) { attack.set(t, 1); defence.set(t, 1); }

  // the prior: priorGames virtual games against an average side, scoring (and conceding) at the
  // prior strength — league average without a prior, last season's (pulled toward average) with one
  const priorGoals = priorGames * (muHome + muAway) / 2;
  const pa = (t: number) => prior?.attack.get(t) ?? 1;
  const pd = (t: number) => prior?.defence.get(t) ?? 1;

  for (let it = 0; it < iterations; it++) {
    const scored = new Map<number, number>();
    const expScored = new Map<number, number>();
    const conceded = new Map<number, number>();
    const expConceded = new Map<number, number>();
    for (const t of teams) { scored.set(t, priorGoals * pa(t)); expScored.set(t, priorGoals); conceded.set(t, priorGoals * pd(t)); expConceded.set(t, priorGoals); }
    for (const m of games) {
      const h = m.homeTeam.id;
      const a = m.awayTeam.id;
      const gh = m.score.fullTime.home as number;
      const ga = m.score.fullTime.away as number;
      // goals each side would score with an attack of 1, given the opponent's defence
      scored.set(h, scored.get(h)! + gh);
      expScored.set(h, expScored.get(h)! + muHome * defence.get(a)!);
      scored.set(a, scored.get(a)! + ga);
      expScored.set(a, expScored.get(a)! + muAway * defence.get(h)!);
      // goals each side would concede with a defence of 1, given the opponent's attack
      conceded.set(h, conceded.get(h)! + ga);
      expConceded.set(h, expConceded.get(h)! + muAway * attack.get(a)!);
      conceded.set(a, conceded.get(a)! + gh);
      expConceded.set(a, expConceded.get(a)! + muHome * attack.get(h)!);
    }
    for (const t of teams) {
      attack.set(t, scored.get(t)! / expScored.get(t)!);
      defence.set(t, conceded.get(t)! / expConceded.get(t)!);
    }
    // identifiability: keep the average attack at 1
    const meanAttack = [...attack.values()].reduce((s, v) => s + v, 0) / teams.size;
    for (const t of teams) attack.set(t, attack.get(t)! / meanAttack);
  }
  return { attack, defence, muHome, muAway, games: games.length };
}

/** The prior for this season from last season's results; null when they aren't available. */
export function seasonPrior(lastSeason: Match[] | null | undefined, thisSeason: Match[]): Prior | null {
  if (!lastSeason?.length) return null;
  const last = fit(lastSeason, 120);
  if (!last) return null;
  const teams = new Set<number>();
  for (const m of thisSeason) { teams.add(m.homeTeam.id); teams.add(m.awayTeam.id); }
  return teams.size ? priorFrom(last, teams) : null;
}

/** Fit this season's results, starting from `prior` when there is one. */
export const fitSeason = (matches: Match[], prior?: Prior | null) =>
  prior ? fit(matches, 60, prior, PRIOR_GAMES_LAST) : fit(matches);

function poisson(lambda: number): number[] {
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= MAX_GOALS; k++) p.push(p[k - 1] * lambda / k);
  return p;
}

export function predict(r: Ratings, homeId: number, awayId: number): Prediction {
  const xgHome = r.muHome * (r.attack.get(homeId) ?? 1) * (r.defence.get(awayId) ?? 1);
  const xgAway = r.muAway * (r.attack.get(awayId) ?? 1) * (r.defence.get(homeId) ?? 1);
  const ph = poisson(xgHome);
  const pa = poisson(xgAway);
  let home = 0, draw = 0, away = 0, best = -1;
  let score: [number, number] = [0, 0];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      if (i > j) home += p; else if (i === j) draw += p; else away += p;
      if (p > best) { best = p; score = [i, j]; }
    }
  }
  const total = home + draw + away; // the grid truncates a sliver of mass past 10 goals
  return { home: home / total, draw: draw / total, away: away / total, xgHome, xgAway, score };
}

export type Outcome = 'H' | 'D' | 'A';

export const outcome = (m: Match): Outcome => {
  const h = m.score.fullTime.home as number;
  const a = m.score.fullTime.away as number;
  return h > a ? 'H' : h < a ? 'A' : 'D';
};

export const pick = (p: Prediction): Outcome =>
  p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D';

/** Multi-class Brier score for one match: 0 is perfect, 2 is maximally wrong. */
export function brier(p: Prediction, o: Outcome): number {
  const y = { H: o === 'H' ? 1 : 0, D: o === 'D' ? 1 : 0, A: o === 'A' ? 1 : 0 };
  return (p.home - y.H) ** 2 + (p.draw - y.D) ** 2 + (p.away - y.A) ** 2;
}

export interface Backtest {
  n: number;
  accuracy: number;
  brier: number;
  homeBaselineAccuracy: number;
  rateBaselineBrier: number;
}

/**
 * Walk-forward test on matches already played: each match is predicted from a
 * fit on matches strictly before its kick-off day, the way the app would have
 * predicted it at the time. Compared against always picking the home side, and
 * against forecasting every match with the season's H/D/A rates so far.
 */
export function backtest(matches: Match[], minPrior = 30, seasonStart?: Prior | null): Backtest | null {
  const games = matches.filter(played).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  let n = 0, correct = 0, brierSum = 0, homeCorrect = 0, rateBrier = 0;
  let cache: { day: string; r: Ratings | null } | null = null;
  for (let i = 0; i < games.length; i++) {
    const m = games[i];
    const day = m.utcDate.slice(0, 10);
    const prior = games.filter((g) => g.utcDate.slice(0, 10) < day);
    if (prior.length < minPrior) continue;
    if (!cache || cache.day !== day) cache = { day, r: fitSeason(prior, seasonStart) };
    if (!cache.r) continue;
    const p = predict(cache.r, m.homeTeam.id, m.awayTeam.id);
    const o = outcome(m);
    n++;
    if (pick(p) === o) correct++;
    if (o === 'H') homeCorrect++;
    brierSum += brier(p, o);
    const rates = { H: 0, D: 0, A: 0 };
    for (const g of prior) rates[outcome(g)]++;
    const base = { home: rates.H / prior.length, draw: rates.D / prior.length, away: rates.A / prior.length, xgHome: 0, xgAway: 0, score: [0, 0] as [number, number] };
    rateBrier += brier(base, o);
  }
  if (!n) return null;
  return { n, accuracy: correct / n, brier: brierSum / n, homeBaselineAccuracy: homeCorrect / n, rateBaselineBrier: rateBrier / n };
}

/** P(home scores i, away scores j) for i, j in 0..max (the corner cell holds "max or more"). */
export function scoreGrid(r: Ratings, homeId: number, awayId: number, max = 5): number[][] {
  const xgHome = r.muHome * (r.attack.get(homeId) ?? 1) * (r.defence.get(awayId) ?? 1);
  const xgAway = r.muAway * (r.attack.get(awayId) ?? 1) * (r.defence.get(homeId) ?? 1);
  const ph = poisson(xgHome);
  const pa = poisson(xgAway);
  // the last cell is everything else, so the grid sums to exactly one
  const fold = (p: number[]) => [...p.slice(0, max), Math.max(0, 1 - p.slice(0, max).reduce((s, x) => s + x, 0))];
  const h = fold(ph);
  const a = fold(pa);
  return h.map((x) => a.map((y) => x * y));
}
