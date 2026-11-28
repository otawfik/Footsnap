/**
 * Candidate forecasting models for the evaluation in scripts/model-eval.ts (docs/model.md).
 *
 * The app's model lives in lib/model.ts. This file holds one generalised Poisson fitter that
 * reproduces it exactly at `CURRENT` (tests/variants.test.ts checks that) and adds one knob per
 * idea under test, so each idea is a one-line change from the model in the app:
 *
 *   priorGames, carry   how hard, and how far toward average, last season's strengths hold a club
 *   halfLife            exponential time decay: a result this many days old counts half
 *   fadePrior           whether the last-season prior ages at the same rate as results do
 *   pool                fit last season's matches too (the classic Dixon-Coles set-up), not just a prior
 *   rateGames           virtual league games at last season's home / away goal rates (league home advantage
 *                       is otherwise this season's alone, which is thirty games' worth early on)
 *   homeGames           a home advantage per team, shrunk toward the league's by this many virtual home games
 *   rho                 Dixon & Coles' (1997) low-score dependence between the two sides' goals
 *   drawBoost           draw inflation: every drawn scoreline multiplied by 1 + drawBoost
 *
 * and, for comparison, a model with no goals in it at all: Elo ratings turned into home / draw /
 * away chances by an ordered logit.
 *
 * Everything is walk-forward: a match is forecast from results on earlier days only.
 */
import type { Match } from './types';
import { isFinished } from './football';
import { fit as fitMaher, priorFrom, PRIOR_GAMES, type Outcome, type Probs } from './model';

export interface PoissonSpec {
  priorGames: number;
  carry: number;
  halfLife: number;
  fadePrior: boolean;
  pool: boolean;
  rateGames: number;
  homeGames: number;
  rho: number;
  drawBoost: number;
}

/** The model in the app (lib/model.ts): last-season prior of 16 games at 0.85 carry, nothing else. */
export const CURRENT: PoissonSpec = { priorGames: 16, carry: 0.85, halfLife: Infinity, fadePrior: false, pool: false, rateGames: 0, homeGames: 0, rho: 0, drawBoost: 0 };

const MAX_GOALS = 10;
const DAY = 86_400_000;
const played = (m: Match) => isFinished(m) && m.score.fullTime.home !== null && m.score.fullTime.away !== null;
const byDate = (a: Match, b: Match) => a.utcDate.localeCompare(b.utcDate);
const dayOf = (m: Match) => m.utcDate.slice(0, 10);
const dayNumber = (m: Match) => Date.parse(dayOf(m)) / DAY;

export const outcomeOf = (m: Match): Outcome => {
  const h = m.score.fullTime.home as number;
  const a = m.score.fullTime.away as number;
  return h > a ? 'H' : h < a ? 'A' : 'D';
};

/**
 * The matches a walk-forward test scores, in kick-off order: every played match on a day with at
 * least `minPrior` of this season's results before it (the rule lib/model.ts backtestSteps uses).
 */
export function scoredMatches(season: Match[], minPrior = 30): Match[] {
  const games = season.filter(played).sort(byDate);
  const out: Match[] = [];
  for (let i = 0; i < games.length; ) {
    let j = i;
    while (j < games.length && dayOf(games[j]) === dayOf(games[i])) j++;
    if (i >= minPrior) out.push(...games.slice(i, j));
    i = j;
  }
  return out;
}

/** Expected goals for each scored match (same order as `scoredMatches`), from fits on earlier days. */
export function poissonRates(last: Match[] | null, season: Match[], spec: PoissonSpec, minPrior = 30): { home: Float64Array; away: Float64Array } {
  const games = season.filter(played).sort(byDate);
  const lastGames = (last ?? []).filter(played).sort(byDate);

  // dense team indices: this season's clubs first, then clubs only in last season's results
  const index = new Map<number, number>();
  const ix = (id: number) => index.get(id) ?? (index.set(id, index.size), index.size - 1);
  const now = new Set<number>();
  for (const m of season) { now.add(m.homeTeam.id); now.add(m.awayTeam.id); }
  for (const t of now) ix(t);
  const nowCount = index.size;
  for (const m of lastGames) { ix(m.homeTeam.id); ix(m.awayTeam.id); }
  const T = index.size;

  // the prior: last season's strengths pulled toward average, exactly as lib/model.ts seasonPrior builds it
  const lastFit = lastGames.length ? fitMaher(lastGames, 120) : null;
  const prior = lastFit ? priorFrom(lastFit, now, spec.carry) : null;
  const pa = new Float64Array(T).fill(1);
  const pd = new Float64Array(T).fill(1);
  const pn = new Float64Array(T); // virtual games per club
  for (const [id, i] of index) {
    if (i >= nowCount) continue;
    pa[i] = prior?.attack.get(id) ?? 1;
    pd[i] = prior?.defence.get(id) ?? 1;
    pn[i] = prior ? spec.priorGames : PRIOR_GAMES;
  }
  const lastMuHome = lastFit?.muHome ?? 0;
  const lastMuAway = lastFit?.muAway ?? 0;
  const rateGames = lastFit ? spec.rateGames : 0;

  // every result that can enter a fit, oldest first: last season's (when pooled), then this season's
  const pooled = spec.pool ? lastGames : [];
  const all = [...pooled, ...games];
  const N = all.length;
  const H = new Int32Array(N), A = new Int32Array(N), GH = new Float64Array(N), GA = new Float64Array(N), D = new Float64Array(N);
  all.forEach((m, k) => { H[k] = ix(m.homeTeam.id); A[k] = ix(m.awayTeam.id); GH[k] = m.score.fullTime.home as number; GA[k] = m.score.fullTime.away as number; D[k] = dayNumber(m); });
  const offset = pooled.length;
  const start = games.length ? dayNumber(games[0]) : 0;
  const decay = Number.isFinite(spec.halfLife);

  const w = new Float64Array(N);
  const attack = new Float64Array(T), defence = new Float64Array(T), homeAdv = new Float64Array(T);
  const scored = new Float64Array(T), expScored = new Float64Array(T), conceded = new Float64Array(T), expConceded = new Float64Array(T);
  const hs = new Float64Array(T), he = new Float64Array(T), hc = new Float64Array(T), hx = new Float64Array(T);
  const active = new Uint8Array(T);

  const outHome: number[] = [];
  const outAway: number[] = [];
  for (let i = 0; i < games.length; ) {
    let j = i;
    while (j < games.length && dayOf(games[j]) === dayOf(games[i])) j++;
    if (i >= minPrior) {
      const n = offset + i; // results before this day
      const today = D[offset + i];
      let W = 0, hg = 0, ag = 0;
      active.fill(0);
      for (let k = 0; k < n; k++) {
        w[k] = decay ? Math.pow(0.5, (today - D[k]) / spec.halfLife) : 1;
        W += w[k]; hg += w[k] * GH[k]; ag += w[k] * GA[k];
        active[H[k]] = 1; active[A[k]] = 1;
      }
      const muHome = Math.max((hg + rateGames * lastMuHome) / (W + rateGames), 0.2);
      const muAway = Math.max((ag + rateGames * lastMuAway) / (W + rateGames), 0.2);
      const fade = decay && spec.fadePrior ? Math.pow(0.5, (today - start) / spec.halfLife) : 1;
      const perGame = (muHome + muAway) / 2;
      let teams = 0;
      for (let t = 0; t < T; t++) { attack[t] = 1; defence[t] = 1; homeAdv[t] = 1; teams += active[t]; }

      for (let it = 0; it < 60; it++) {
        for (let t = 0; t < T; t++) {
          const g = pn[t] * fade * perGame;
          scored[t] = g * pa[t]; expScored[t] = g; conceded[t] = g * pd[t]; expConceded[t] = g;
        }
        for (let k = 0; k < n; k++) {
          const h = H[k], a = A[k], wk = w[k], g = homeAdv[h];
          scored[h] += wk * GH[k]; expScored[h] += wk * muHome * defence[a] * g;
          scored[a] += wk * GA[k]; expScored[a] += wk * muAway * defence[h] / g;
          conceded[h] += wk * GA[k]; expConceded[h] += wk * muAway * attack[a] / g;
          conceded[a] += wk * GH[k]; expConceded[a] += wk * muHome * attack[h] * g;
        }
        let sum = 0;
        for (let t = 0; t < T; t++) {
          if (!active[t]) continue;
          attack[t] = scored[t] / expScored[t];
          defence[t] = conceded[t] / expConceded[t];
          sum += attack[t];
        }
        const meanAttack = sum / teams;
        for (let t = 0; t < T; t++) if (active[t]) attack[t] /= meanAttack;

        if (spec.homeGames > 0) {
          // a club's home factor g multiplies its goals at home and divides its visitors'. With S goals
          // scored at home against E expected at g = 1, and C conceded against X expected, the
          // likelihood peaks where E g^2 - (S - C) g - X = 0; the prior is homeGames games at g = 1.
          for (let t = 0; t < T; t++) { hs[t] = spec.homeGames * muHome; he[t] = spec.homeGames * muHome; hc[t] = spec.homeGames * muAway; hx[t] = spec.homeGames * muAway; }
          for (let k = 0; k < n; k++) {
            const h = H[k], a = A[k], wk = w[k];
            hs[h] += wk * GH[k]; he[h] += wk * muHome * attack[h] * defence[a];
            hc[h] += wk * GA[k]; hx[h] += wk * muAway * attack[a] * defence[h];
          }
          for (let t = 0; t < T; t++) {
            const b = hs[t] - hc[t];
            homeAdv[t] = (b + Math.sqrt(b * b + 4 * he[t] * hx[t])) / (2 * he[t]);
          }
        }
      }
      for (let k = i; k < j; k++) {
        const h = H[offset + k], a = A[offset + k];
        const ah = active[h] ? attack[h] : 1, dh = active[h] ? defence[h] : 1, g = active[h] ? homeAdv[h] : 1;
        const aa = active[a] ? attack[a] : 1, da = active[a] ? defence[a] : 1;
        outHome.push(muHome * ah * da * g);
        outAway.push(muAway * aa * dh / g);
      }
    }
    i = j;
  }
  return { home: Float64Array.from(outHome), away: Float64Array.from(outAway) };
}

/**
 * Home / draw / away chances from two expected-goal rates. With rho = 0 and drawBoost = 0 this is
 * lib/model.ts predict: independent Poissons summed over a 0-10 grid. `rho` is Dixon & Coles'
 * correction to the four lowest scorelines (negative rho: more 0-0 and 1-1, fewer 1-0 and 0-1);
 * `drawBoost` scales every drawn scoreline by 1 + drawBoost. Renormalised either way.
 */
export function probsFromRates(xgHome: number, xgAway: number, rho = 0, drawBoost = 0): Probs {
  const ph = [Math.exp(-xgHome)];
  const pa = [Math.exp(-xgAway)];
  for (let k = 1; k <= MAX_GOALS; k++) { ph.push(ph[k - 1] * xgHome / k); pa.push(pa[k - 1] * xgAway / k); }
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      let p = ph[i] * pa[j];
      if (rho !== 0 && i < 2 && j < 2) p *= Math.max(0, lowScoreFactor(i, j, xgHome, xgAway, rho));
      if (i > j) home += p; else if (i === j) draw += p * (1 + drawBoost); else away += p;
    }
  }
  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total };
}

/** Dixon & Coles' tau: the factor on P(i, j) for i, j in {0, 1}; 1 everywhere else. */
export function lowScoreFactor(i: number, j: number, xgHome: number, xgAway: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - xgHome * xgAway * rho;
  if (i === 0 && j === 1) return 1 + xgHome * rho;
  if (i === 1 && j === 0) return 1 + xgAway * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/** Walk-forward home / draw / away forecasts for a season's scored matches under `spec`. */
export function poissonForecasts(last: Match[] | null, season: Match[], spec: PoissonSpec, minPrior = 30): Probs[] {
  const r = poissonRates(last, season, spec, minPrior);
  return Array.from(r.home, (h, k) => probsFromRates(h, r.away[k], spec.rho, spec.drawBoost));
}

// ---- Elo + ordered logit

export interface EloSpec {
  /** rating points at stake per match */
  k: number;
  /** home advantage in rating points, used when updating */
  home: number;
  /** how much of a club's distance from 1500 survives the summer */
  carry: number;
  /** scale the update by ln(1 + goal margin) / ln 2, so a 1-goal win is the plain update */
  margin: boolean;
}

/**
 * Elo ratings carried through consecutive seasons of one league. Returns, for every played match,
 * the home side's rating minus the away side's as they stood before that match's day. Ratings move
 * after each day's matches. Between seasons each club is pulled toward 1500 by `carry`, and clubs
 * new to the league start at the average of the clubs that left it (1500 in the first season).
 */
export function eloDiffs(seasons: Match[][], spec: EloSpec): Map<number, number> {
  const out = new Map<number, number>();
  let ratings = new Map<number, number>();
  for (const season of seasons) {
    const games = season.filter(played).sort(byDate);
    const now = new Set<number>();
    for (const m of season) { now.add(m.homeTeam.id); now.add(m.awayTeam.id); }
    if (ratings.size) {
      const gone = [...ratings.keys()].filter((t) => !now.has(t));
      const pulled = (r: number) => 1500 + spec.carry * (r - 1500);
      const newcomer = gone.length ? gone.reduce((s, t) => s + pulled(ratings.get(t)!), 0) / gone.length : 1500;
      const next = new Map<number, number>();
      for (const t of now) next.set(t, ratings.has(t) ? pulled(ratings.get(t)!) : newcomer);
      ratings = next;
    } else {
      for (const t of now) ratings.set(t, 1500);
    }
    for (let i = 0; i < games.length; ) {
      let j = i;
      while (j < games.length && dayOf(games[j]) === dayOf(games[i])) j++;
      const moves: [number, number][] = [];
      for (let k = i; k < j; k++) {
        const m = games[k];
        const rh = ratings.get(m.homeTeam.id) ?? 1500;
        const ra = ratings.get(m.awayTeam.id) ?? 1500;
        out.set(m.id, rh - ra);
        const gh = m.score.fullTime.home as number;
        const ga = m.score.fullTime.away as number;
        const expected = 1 / (1 + Math.pow(10, -(rh - ra + spec.home) / 400));
        const actual = gh > ga ? 1 : gh < ga ? 0 : 0.5;
        const scale = spec.margin && gh !== ga ? Math.log(1 + Math.abs(gh - ga)) / Math.LN2 : 1;
        const delta = spec.k * scale * (actual - expected);
        moves.push([m.homeTeam.id, delta], [m.awayTeam.id, -delta]);
      }
      for (const [t, d] of moves) ratings.set(t, (ratings.get(t) ?? 1500) + d);
      i = j;
    }
  }
  return out;
}

/** P(away) = s(c1 - b x), P(away or draw) = s(c1 + gap - b x), with s the logistic function and gap > 0. */
export interface OrderedLogit { b: number; c1: number; gap: number }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function orderedLogit(m: OrderedLogit, x: number): Probs {
  const away = sigmoid(m.c1 - m.b * x);
  const notHome = sigmoid(m.c1 + m.gap - m.b * x);
  return { home: 1 - notHome, draw: notHome - away, away };
}

/** Maximum-likelihood ordered logit of the result on one number (here a rating difference / 400), by Newton's method. */
export function fitOrderedLogit(x: ArrayLike<number>, o: Outcome[]): OrderedLogit {
  const loss = (t: number[]) => {
    const m = { b: t[0], c1: t[1], gap: Math.exp(t[2]) };
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      const p = orderedLogit(m, x[i]);
      s -= Math.log(Math.max(1e-12, o[i] === 'H' ? p.home : o[i] === 'D' ? p.draw : p.away));
    }
    return s / x.length;
  };
  let t = [1, -0.5, 0];
  let f = loss(t);
  const e = 1e-4;
  for (let it = 0; it < 50; it++) {
    // gradient and Hessian by central differences: three parameters, so this is cheap
    const g = [0, 1, 2].map((a) => { const u = t.slice(), d = t.slice(); u[a] += e; d[a] -= e; return (loss(u) - loss(d)) / (2 * e); });
    const hess = [0, 1, 2].map((a) => [0, 1, 2].map((b) => {
      const pp = t.slice(), pm = t.slice(), mp = t.slice(), mm = t.slice();
      pp[a] += e; pp[b] += e; pm[a] += e; pm[b] -= e; mp[a] -= e; mp[b] += e; mm[a] -= e; mm[b] -= e;
      return (loss(pp) - loss(pm) - loss(mp) + loss(mm)) / (4 * e * e);
    }));
    const step = solve3(hess, g);
    let size = 1;
    let next = t;
    let fn = f;
    for (let half = 0; half < 20; half++) {
      next = t.map((v, a) => v - size * step[a]);
      fn = loss(next);
      if (fn <= f) break;
      size /= 2;
    }
    const gain = f - fn;
    if (gain < 0) break;
    t = next; f = fn;
    if (gain < 1e-12) break;
  }
  return { b: t[0], c1: t[1], gap: Math.exp(t[2]) };
}

function solve3(m: number[][], v: number[]): number[] {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    if (Math.abs(a[c][c]) < 1e-14) return v; // singular: fall back to a gradient step
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row, i) => row[3] / row[i]);
}

/** A weighted average of two forecasts (a linear opinion pool): w on the first. */
export const blend = (a: Probs, b: Probs, w: number): Probs => ({ home: w * a.home + (1 - w) * b.home, draw: w * a.draw + (1 - w) * b.draw, away: w * a.away + (1 - w) * b.away });
