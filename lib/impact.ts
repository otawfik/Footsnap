/**
 * What a result meant: how one finished match moved each side's season chances.
 *
 * Two runs of the season simulator (lib/season simulate) from the same starting point, the league
 * as it stood at kick-off:
 *   - before: every result from before kick-off is in the table; this match and everything after it
 *     (including games that kicked off at the same time) is simulated.
 *   - after: the same, with this match pinned to its real score.
 * Both use the same model (the fit from before the match day, as the match page's forecast does)
 * and the very same simulated seasons (simulateVariants: each season is drawn once and ranked both
 * ways), so every other fixture plays out identically in both: the gap between them is this result
 * and nothing else, not simulation noise.
 *
 * The table is rebuilt from results (points, goal difference, goals scored), so it leaves out any
 * points deduction; the official standings can't be wound back to a past kick-off.
 */
import type { Match, StandingRow, Team } from './types';
import { isFinished } from './football';
import type { Ratings } from './model';
import { simulateVariants, Projection } from './season';

export const IMPACT_RUNS = 2000;

export type Stake = 'title' | 'top' | 'relegation';

export interface TeamImpact {
  team: Team;
  before: Projection;
  after: Projection;
}

export interface ResultImpact {
  /** simulated seasons in each of the two runs */
  runs: number;
  /** fixtures still to play at kick-off (this one included) */
  fixtures: number;
  home: TeamImpact;
  away: TeamImpact;
}

/** The stakes that make sense for a competition, in display order, with their labels. */
export function stakesFor(competitionId: number): { key: Stake; label: string; bad?: boolean }[] {
  if (competitionId === 2001)
    return [
      { key: 'top', label: 'Top eight' },
      { key: 'relegation', label: 'Out in the league phase', bad: true },
    ];
  return [
    { key: 'title', label: 'Title' },
    { key: 'top', label: 'Top four' },
    { key: 'relegation', label: 'Relegation', bad: true },
  ];
}

const inLeague = (m: Match, competitionId: number) => competitionId !== 2001 || !m.stage || m.stage === 'LEAGUE_STAGE';

/** Can this match's effect on the table be simulated: a finished league game with a score. */
export function hasImpact(m: Match, competitionId: number) {
  return isFinished(m) && m.score.fullTime.home !== null && m.score.fullTime.away !== null && inLeague(m, competitionId);
}

/** The table from results kicked off before `kickoff`, with every team in `matches`, ranked. */
export function tableAt(matches: Match[], kickoff: string, competitionId: number): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  const row = (t: Team) => {
    if (!rows.has(t.id)) rows.set(t.id, { position: 0, team: t, playedGames: 0, won: 0, draw: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
    return rows.get(t.id)!;
  };
  for (const m of matches) {
    if (!inLeague(m, competitionId)) continue;
    const h = row(m.homeTeam);
    const a = row(m.awayTeam);
    if (!isFinished(m) || m.utcDate >= kickoff) continue;
    const hg = m.score.fullTime.home ?? 0;
    const ag = m.score.fullTime.away ?? 0;
    h.playedGames++; a.playedGames++;
    h.goalsFor += hg; a.goalsFor += ag;
    h.goalsAgainst += ag; a.goalsAgainst += hg;
    h.goalDifference += hg - ag; a.goalDifference += ag - hg;
    if (hg > ag) { h.won++; a.lost++; h.points += 3; }
    else if (hg < ag) { a.won++; h.lost++; a.points += 3; }
    else { h.draw++; a.draw++; h.points++; a.points++; }
  }
  const sorted = [...rows.values()].sort(
    (x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor || x.team.name.localeCompare(y.team.name)
  );
  sorted.forEach((r, i) => (r.position = i + 1));
  return sorted;
}

/**
 * The season as it stood at `kickoff`: results from before it stay, every other league game that
 * hasn't been called off goes back to "to play" (simulate() draws those).
 */
export function seasonAt(matches: Match[], kickoff: string, competitionId: number): Match[] {
  return matches
    .filter((m) => inLeague(m, competitionId))
    .map((m) =>
      (isFinished(m) && m.utcDate < kickoff) || m.status === 'CANCELLED' || m.status === 'SUSPENDED'
        ? m
        : { ...m, status: 'SCHEDULED' as const, score: { ...m.score, winner: null, fullTime: { home: null, away: null } } }
    );
}

const cache = new Map<string, ResultImpact>();

/** Before and after for both sides; null if the match can't be simulated (see hasImpact). */
export function resultImpact(
  match: Match,
  matches: Match[],
  ratings: Ratings,
  competitionId: number,
  { runs = IMPACT_RUNS, seed = 7 } = {}
): ResultImpact | null {
  if (!hasImpact(match, competitionId)) return null;
  const finishedBefore = matches.filter((m) => isFinished(m) && m.utcDate < match.utcDate).length;
  const key = `${competitionId}:${match.id}:${finishedBefore}:${ratings.games}:${runs}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const table = tableAt(matches, match.utcDate, competitionId);
  const world = seasonAt(matches, match.utcDate, competitionId);
  const score: [number, number] = [match.score.fullTime.home!, match.score.fullTime.away!];
  // one pass, two rankings per simulated season: the match left to chance, and its real score
  const [before, after] = simulateVariants(table, world, ratings, competitionId, [new Map(), new Map([[match.id, score]])], { runs, seed });
  const side = (t: Team): TeamImpact | null => {
    const b = before.get(t.id);
    const a = after.get(t.id);
    return b && a ? { team: t, before: b, after: a } : null;
  };
  const home = side(match.homeTeam);
  const away = side(match.awayTeam);
  if (!home || !away) return null;
  const fixtures = world.filter((m) => m.status === 'SCHEDULED').length;
  const out: ResultImpact = { runs, fixtures, home, away };
  if (cache.size > 30) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}
