/**
 * Season simulator and table replay.
 *
 * simulate(): Monte Carlo over the fixtures still to play. Each run draws every
 * remaining scoreline from the Poisson model (lib/model.ts), adds it to the
 * official table, ranks by points, goal difference, goals scored, and counts
 * where every team finishes. `forced` pins chosen fixtures to a scoreline: the
 * what-if machine.
 *
 * Team strengths are estimates, not facts, so each run also redraws every
 * team's attack and defence around the fitted value (log-normal, wider for
 * teams with fewer games). Without that, ten games in, the simulator treated a
 * hot start as certain and handed one side a 95% title chance.
 *
 * tableAfter(): the table as it stood after any matchday, rebuilt from results,
 * for the time-machine slider.
 */
import type { Match, StandingRow, Team } from './types';
import { isFinished, zone, Zone } from './football';
import { predict, Ratings } from './model';
import { normal, poisson, rng } from './rng';

export interface Projection {
  teamId: number;
  title: number;
  top: number; // the competition's top zone (Champions League places / last-16)
  relegation: number;
  avgPoints: number;
  avgPosition: number;
  /** share of runs finishing in each position, index 0 = 1st */
  positions: number[];
}

export const remaining = (matches: Match[], competitionId: number) =>
  matches.filter(
    (m) =>
      (m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'POSTPONED') &&
      (competitionId !== 2001 || !m.stage || m.stage === 'LEAGUE_STAGE')
  );

export function simulate(
  table: StandingRow[],
  matches: Match[],
  ratings: Ratings,
  competitionId: number,
  { runs = 3000, seed = 7, forced = new Map<number, [number, number]>(), uncertainty = true } = {}
): Map<number, Projection> {
  const ids = table.map((r) => r.team.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const fixtures = remaining(matches, competitionId).filter((m) => index.has(m.homeTeam.id) && index.has(m.awayTeam.id));
  const n = ids.length;
  // expected goals per fixture don't change between runs
  const lambdas = fixtures.map((m) => {
    const p = predict(ratings, m.homeTeam.id, m.awayTeam.id);
    return [p.xgHome, p.xgAway] as const;
  });
  // spread of each team's strength estimate: about ±23% after 8 games, ±13% after 38
  const spread = table.map((row) => (uncertainty ? 0.35 / Math.sqrt(1 + row.playedGames / 6) : 0));
  const attMod = new Float64Array(n);
  const defMod = new Float64Array(n);
  const r = rng(seed);
  const counts = ids.map(() => new Array<number>(n).fill(0));
  const pointsSum = new Array<number>(n).fill(0);
  const pts = new Float64Array(n);
  const gd = new Float64Array(n);
  const gf = new Float64Array(n);
  const order = ids.map((_, i) => i);
  const lot = new Float64Array(n);

  for (let run = 0; run < runs; run++) {
    table.forEach((row, i) => {
      pts[i] = row.points;
      gd[i] = row.goalDifference;
      gf[i] = row.goalsFor;
      attMod[i] = spread[i] ? Math.exp(spread[i] * normal(r) - spread[i] ** 2 / 2) : 1;
      defMod[i] = spread[i] ? Math.exp(spread[i] * normal(r) - spread[i] ** 2 / 2) : 1;
    });
    for (let k = 0; k < fixtures.length; k++) {
      const m = fixtures[k];
      const h = index.get(m.homeTeam.id)!;
      const a = index.get(m.awayTeam.id)!;
      // always draw, then apply any pin: the what-if run and the baseline then use the same random
      // numbers (common random numbers), so only real knock-on effects show up as changes
      const drawH = poisson(lambdas[k][0] * attMod[h] * defMod[a], r);
      const drawA = poisson(lambdas[k][1] * attMod[a] * defMod[h], r);
      const pinned = forced.get(m.id);
      const hg = pinned ? pinned[0] : drawH;
      const ag = pinned ? pinned[1] : drawA;
      gf[h] += hg; gf[a] += ag; gd[h] += hg - ag; gd[a] += ag - hg;
      if (hg > ag) pts[h] += 3; else if (hg < ag) pts[a] += 3; else { pts[h] += 1; pts[a] += 1; }
    }
    // ties beyond goals scored are broken by lot, drawn up front so every run uses the same count of draws
    for (let i = 0; i < n; i++) lot[i] = r();
    order.sort((x, y) => pts[y] - pts[x] || gd[y] - gd[x] || gf[y] - gf[x] || lot[x] - lot[y]);
    order.forEach((teamIdx, pos) => {
      counts[teamIdx][pos]++;
      pointsSum[teamIdx] += pts[teamIdx];
    });
  }

  const out = new Map<number, Projection>();
  ids.forEach((id, i) => {
    const positions = counts[i].map((c) => c / runs);
    const share = (z: Zone) => positions.reduce((s, p, pos) => (zone(competitionId, pos + 1, n) === z ? s + p : s), 0);
    out.set(id, {
      teamId: id,
      title: positions[0],
      top: share('top'),
      relegation: share('relegation'),
      avgPoints: pointsSum[i] / runs,
      avgPosition: positions.reduce((s, p, pos) => s + p * (pos + 1), 0),
      positions,
    });
  });
  return out;
}

export interface ReplayRow {
  team: Team;
  played: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
  position: number;
}

/** Highest matchday with at least one result. */
export const lastMatchday = (matches: Match[]) =>
  Math.max(0, ...matches.filter((m) => isFinished(m) && m.matchday).map((m) => m.matchday as number));

/** The table after a given matchday, from results alone (no deductions or head-to-head rules). */
export function tableAfter(matches: Match[], matchday: number): ReplayRow[] {
  const rows = new Map<number, ReplayRow>();
  const row = (t: Team) => {
    if (!rows.has(t.id)) rows.set(t.id, { team: t, played: 0, points: 0, goalDifference: 0, goalsFor: 0, position: 0 });
    return rows.get(t.id)!;
  };
  for (const m of matches) {
    if (!m.matchday || m.matchday > matchday) {
      row(m.homeTeam);
      row(m.awayTeam);
      continue;
    }
    const h = row(m.homeTeam);
    const a = row(m.awayTeam);
    if (!isFinished(m)) continue;
    const hg = m.score.fullTime.home ?? 0;
    const ag = m.score.fullTime.away ?? 0;
    h.played++; a.played++;
    h.goalsFor += hg; a.goalsFor += ag;
    h.goalDifference += hg - ag; a.goalDifference += ag - hg;
    if (hg > ag) h.points += 3; else if (hg < ag) a.points += 3; else { h.points++; a.points++; }
  }
  const sorted = [...rows.values()].sort(
    (x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor || x.team.name.localeCompare(y.team.name)
  );
  sorted.forEach((r, i) => (r.position = i + 1));
  return sorted;
}

export interface TrajectoryPoint {
  matchday: number;
  position: number;
  points: number;
}

/** A team's league position and points after every matchday so far. */
export function trajectory(matches: Match[], teamId: number): TrajectoryPoint[] {
  const out: TrajectoryPoint[] = [];
  const last = lastMatchday(matches);
  for (let md = 1; md <= last; md++) {
    const row = tableAfter(matches, md).find((r) => r.team.id === teamId);
    if (row) out.push({ matchday: md, position: row.position, points: row.points });
  }
  return out;
}
