/**
 * FootSnap API Service
 * Calls football-data.org directly. The API key is read from
 * EXPO_PUBLIC_FOOTBALL_API_KEY in .env and is bundled client-side —
 * acceptable for a personal / dev build. Migrate back to a server proxy
 * for a public release.
 */

const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.EXPO_PUBLIC_FOOTBALL_API_KEY ?? '';

// Top 5 domestic leagues + UEFA Champions League
export const ALLOWED_LEAGUE_IDS = [2021, 2014, 2002, 2019, 2015, 2001] as const;

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  let url = `${BASE_URL}/${path}`;
  if (params && Object.keys(params).length > 0) {
    url = `${url}?${new URLSearchParams(params).toString()}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Auth-Token': API_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.message ?? err?.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

export const fetchCompetitions = () =>
  get('competitions', { areas: '2072,2224,2088,2081,2163' });

export const fetchCompetition = (leagueId: number) =>
  get(`competitions/${leagueId}`);

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export const fetchStandings = (leagueId: number, season?: string) =>
  get(`competitions/${leagueId}/standings`, season ? { season } : undefined);

// ---------------------------------------------------------------------------
// Matches / Fixtures
// ---------------------------------------------------------------------------

const COMPETITIONS = ALLOWED_LEAGUE_IDS.join(',');

export const fetchLiveMatches = () =>
  get('matches', { status: 'IN_PLAY,PAUSED', competitions: COMPETITIONS });

export const fetchTodayMatches = () =>
  get('matches', {
    status: 'SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED',
    competitions: COMPETITIONS,
  });

export const fetchLeagueMatches = (
  leagueId: number,
  params?: Record<string, string>
) => get(`competitions/${leagueId}/matches`, params);

export const fetchTeamMatches = (
  teamId: number,
  params?: Record<string, string>
) => get(`teams/${teamId}/matches`, params);

// ---------------------------------------------------------------------------
// Players / Scorers
// ---------------------------------------------------------------------------

export const fetchScorers = (leagueId: number, limit = 20, season?: string) =>
  get(`competitions/${leagueId}/scorers`, {
    limit: String(limit),
    ...(season ? { season } : {}),
  });

export const fetchPerson = (personId: number) => get(`persons/${personId}`);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const fetchLeagueTeams = (leagueId: number, season?: string) =>
  get(`competitions/${leagueId}/teams`, season ? { season } : undefined);

export const fetchTeam = (teamId: number) => get(`teams/${teamId}`);

// ---------------------------------------------------------------------------
// Predictions — computed client-side from standings data
// ---------------------------------------------------------------------------

export interface PredictionEntry {
  team: { id: number; name: string; crestUrl?: string };
  position: number;
  points: number;
  form: string;
  formScore: number;
  formLabel: 'Hot' | 'Warm' | 'Cold';
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalDifference: number;
}

function formScore(formStr: string | null | undefined): number {
  if (!formStr) return 0;
  const scores: Record<string, number> = { W: 3, D: 1, L: 0 };
  // Strip everything that isn't W, D, or L (handles commas, spaces, etc.)
  const cleaned = formStr.toUpperCase().replace(/[^WDL]/g, '');
  if (cleaned.length === 0) return 0;
  const last5 = cleaned.slice(-5).split('');
  const total = last5.reduce((sum, c) => sum + (scores[c] ?? 0), 0);
  return total / 15; // normalise 0-1
}

export async function fetchPredictions(leagueId: number): Promise<{ leagueId: number; predictions: PredictionEntry[] }> {
  const data = await fetchStandings(leagueId) as any;
  const table: any[] = data?.standings?.[0]?.table ?? [];

  const predictions: PredictionEntry[] = table.map((entry: any) => {
    let score = formScore(entry.form);
    // Fallback: when form string is absent, estimate from season W/D/L ratio
    if (score === 0 && entry.playedGames > 0) {
      score = (entry.won * 3 + (entry.draw ?? 0)) / (entry.playedGames * 3);
    }
    return {
      team: {
        id: entry.team?.id,
        name: entry.team?.name,
        crestUrl: entry.team?.crest,
      },
      position: entry.position,
      points: entry.points,
      form: entry.form ?? '',
      formScore: Math.round(score * 100) / 100,
      formLabel: score > 0.6 ? 'Hot' : score > 0.35 ? 'Warm' : 'Cold',
      playedGames: entry.playedGames,
      won: entry.won,
      draw: entry.draw,
      lost: entry.lost,
      goalDifference: entry.goalDifference,
    };
  });

  predictions.sort((a, b) => b.formScore - a.formScore);

  return { leagueId, predictions: predictions.slice(0, 10) };
}
