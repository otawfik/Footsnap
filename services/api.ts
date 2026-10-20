/**
 * FootSnap data client.
 *
 * Every request goes through the app's own proxy (/api/fd on the deployed
 * site), which holds the football-data.org key server-side and caches at the
 * edge. No key is bundled into the app. The web build calls the proxy on its
 * own origin; native builds (Expo Go, simulators) call the deployed site,
 * overridable with EXPO_PUBLIC_API_BASE.
 *
 * Responses are also kept in memory for a short time and in-flight requests
 * are shared, so Home and Predictions asking for the same season's fixtures
 * cost one request.
 */
import { Platform } from 'react-native';
import type { MatchesResponse, ScorersResponse, StandingsResponse, TeamsResponse } from '../lib/types';

export const DEPLOYED_URL = 'https://footsnap-app.vercel.app';

const BASE = (
  process.env.EXPO_PUBLIC_API_BASE ?? (Platform.OS === 'web' ? '' : DEPLOYED_URL)
).replace(/\/$/, '');

/**
 * Club crests are the clubs' trademarks. Builds made with EXPO_PUBLIC_SHOW_CRESTS=false
 * strip every crest URL from the data here, in one place, and the app falls back
 * to badges in each club's colours (see docs/app-store.md, "Content Rights").
 */
export const SHOW_CRESTS = process.env.EXPO_PUBLIC_SHOW_CRESTS !== 'false';

function stripCrests<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripCrests) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (k !== 'crest') out[k] = stripCrests(v);
    return out as T;
  }
  return value;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly retryAfterS?: number) {
    super(message);
  }
}

const memory = new Map<string, { at: number; value: Promise<unknown> }>();

async function request<T>(path: string, ttlMs: number, force = false): Promise<T> {
  const url = `${BASE}/api/fd/${path}`;
  const hit = memory.get(url);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;

  const value = (async () => {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new ApiError('No connection. Pull down to retry.', 0);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const retry = Number(res.headers.get('Retry-After'));
      throw new ApiError(
        body?.error ?? body?.message ?? `Request failed (${res.status})`,
        res.status,
        body?.code,
        Number.isFinite(retry) && retry > 0 ? retry : undefined
      );
    }
    return (SHOW_CRESTS ? body : stripCrests(body)) as T;
  })();
  memory.set(url, { at: Date.now(), value });
  value.catch(() => memory.delete(url)); // never cache a failure
  return value;
}

export const fetchSeasonMatches = (leagueId: number, force = false) =>
  request<MatchesResponse>(`competitions/${leagueId}/matches`, 25_000, force);

export const fetchStandings = (leagueId: number, force = false) =>
  request<StandingsResponse>(`competitions/${leagueId}/standings`, 60_000, force);

export const fetchScorers = (leagueId: number, force = false) =>
  request<ScorersResponse>(`competitions/${leagueId}/scorers?limit=20`, 300_000, force);

export const fetchTeams = (leagueId: number, force = false) =>
  request<TeamsResponse>(`competitions/${leagueId}/teams`, 3_600_000, force);
