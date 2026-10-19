/** The subset of football-data.org v4 response shapes the app reads. */

export interface Team {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

export type MatchStatus =
  | 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
  | 'FINISHED' | 'SUSPENDED' | 'POSTPONED' | 'CANCELLED' | 'AWARDED';

export interface Score {
  home: number | null;
  away: number | null;
}

export interface Match {
  id: number;
  utcDate: string;
  status: MatchStatus;
  matchday?: number | null;
  stage?: string;
  homeTeam: Team;
  awayTeam: Team;
  score: { winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null; fullTime: Score; halfTime?: Score };
  competition?: { id: number; name: string };
}

export interface MatchesResponse {
  matches: Match[];
}

export interface StandingRow {
  position: number;
  team: Team;
  playedGames: number;
  form?: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface StandingsResponse {
  season?: { currentMatchday?: number | null; startDate?: string; endDate?: string };
  standings: { stage?: string; type: 'TOTAL' | 'HOME' | 'AWAY'; group?: string | null; table: StandingRow[] }[];
}

export interface Scorer {
  player: { id: number; name: string; nationality?: string; dateOfBirth?: string; position?: string | null; section?: string | null };
  team: Team;
  playedMatches?: number | null;
  goals: number;
  assists: number | null;
  penalties: number | null;
}

export interface ScorersResponse {
  scorers: Scorer[];
}

export interface SquadPlayer {
  id: number;
  name: string;
  position?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
}

export interface TeamDetail extends Team {
  venue?: string | null;
  founded?: number | null;
  clubColors?: string | null;
  coach?: { name?: string | null; nationality?: string | null } | null;
  squad?: SquadPlayer[];
}

export interface TeamsResponse {
  teams: TeamDetail[];
}
