/** Pure helpers over football-data.org data: no React Native, unit-tested. */
import type { Match, SquadPlayer, StandingRow, StandingsResponse } from './types';

export const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT']);
export const UPCOMING_STATUSES = new Set(['SCHEDULED', 'TIMED']);

export const isLive = (m: Match) => LIVE_STATUSES.has(m.status);
export const isFinished = (m: Match) => m.status === 'FINISHED' || m.status === 'AWARDED';
export const isUpcoming = (m: Match) => UPCOMING_STATUSES.has(m.status);

const time = (m: Match) => new Date(m.utcDate).getTime();

/** Split a season's fixtures into what the Home screen shows. */
export function splitMatches(matches: Match[], now = Date.now(), nResults = 5, nUpcoming = 5) {
  const live = matches.filter(isLive).sort((a, b) => time(a) - time(b));
  const results = matches
    .filter((m) => isFinished(m) && time(m) <= now)
    .sort((a, b) => time(b) - time(a))
    .slice(0, nResults);
  const upcoming = matches
    .filter((m) => isUpcoming(m) && time(m) >= now - 3 * 3600_000)
    .sort((a, b) => time(a) - time(b))
    .slice(0, nUpcoming);
  return { live, results, upcoming };
}

export type Result = 'W' | 'D' | 'L';

/** A team's results in its last n finished matches, oldest first. */
export function recentForm(matches: Match[], teamId: number, n = 5): Result[] {
  return matches
    .filter((m) => isFinished(m) && (m.homeTeam.id === teamId || m.awayTeam.id === teamId))
    .sort((a, b) => time(a) - time(b))
    .slice(-n)
    .map((m) => {
      const home = m.homeTeam.id === teamId;
      const gf = (home ? m.score.fullTime.home : m.score.fullTime.away) ?? 0;
      const ga = (home ? m.score.fullTime.away : m.score.fullTime.home) ?? 0;
      return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    });
}

/** Points per game over a form string: W=3, D=1, L=0, scaled to 0-1. */
export const formScore = (form: Result[]) =>
  form.length ? form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / (3 * form.length) : 0;

/** The overall league table (TOTAL), not the home or away splits. */
export function totalTable(data: StandingsResponse | null | undefined): StandingRow[] {
  const tables = data?.standings ?? [];
  return (tables.find((t) => t.type === 'TOTAL') ?? tables[0])?.table ?? [];
}

export type Zone = 'top' | 'europe' | 'playoff' | 'relegation' | null;

/**
 * Table zones by competition. Domestic: Champions League places, then the
 * relegation places (Bundesliga and Ligue 1 have 18 teams and a play-off spot).
 * Champions League league phase: top 8 go straight through, 9-24 to the play-offs.
 */
export function zone(competitionId: number, position: number, teams: number): Zone {
  if (competitionId === 2001) return position <= 8 ? 'top' : position <= 24 ? 'playoff' : 'relegation';
  const cl = 4;
  if (position <= cl) return 'top';
  if (position <= cl + 2) return 'europe';
  const relegated = 3;
  if (teams === 18) {
    if (position === 16) return 'playoff';
    if (position >= 17) return 'relegation';
    return null;
  }
  return position > teams - relegated ? 'relegation' : null;
}

export type Line = 'GK' | 'DF' | 'MF' | 'FW';
export const LINES: Line[] = ['GK', 'DF', 'MF', 'FW'];

/** football-data.org positions come both coarse ("Defence") and fine ("Left-Back"). */
export function line(position: string | null | undefined): Line | null {
  const p = (position ?? '').toLowerCase();
  if (!p) return null;
  if (p.includes('goal')) return 'GK';
  // before defence: "Defensive Midfield" is a midfielder
  if (p.includes('midfield')) return 'MF';
  if (p.includes('back') || p.includes('defen')) return 'DF';
  if (p.includes('forward') || p.includes('offence') || p.includes('attack') || p.includes('wing') || p.includes('striker')) return 'FW';
  return null;
}

export function age(dateOfBirth: string | null | undefined, now = new Date()): number | null {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) a -= 1;
  return a;
}

/** Squad summary: size, average age, share of players from outside the club's country. */
export function squadStats(squad: SquadPlayer[], homeNation?: string, now = new Date()) {
  const ages = squad.map((p) => age(p.dateOfBirth, now)).filter((a): a is number => a !== null);
  const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;
  const withNation = squad.filter((p) => p.nationality);
  const foreign = homeNation && withNation.length
    ? withNation.filter((p) => p.nationality !== homeNation).length / withNation.length
    : null;
  return { size: squad.length, avgAge, foreign };
}

/** Squad grouped by line in pitch order, unknown positions last. */
export function byLine(squad: SquadPlayer[]) {
  const groups: Record<Line | 'Other', SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [], Other: [] };
  for (const p of squad) groups[line(p.position) ?? 'Other'].push(p);
  return groups;
}
