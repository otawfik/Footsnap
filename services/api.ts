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
 *
 * The last good copy of each response is also saved on the device. If the
 * network is down (or the proxy fails), the app shows that copy instead of an
 * error and says how old it is (see useOffline).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MatchesResponse, ScorersResponse, StandingsResponse, TeamsResponse } from '../lib/types';

export const DEPLOYED_URL = 'https://footsnap-app.vercel.app';

export const BASE = (
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

// ---- saved copies, for when there's no connection ----

const SAVE_PREFIX = 'fd:v1:';
const SAVE_MAX_CHARS = 1_500_000; // stay well inside AsyncStorage's per-item and web storage limits

/** When the oldest saved copy currently on screen was fetched; null while everything is live. */
let offlineSince: number | null = null;
const staleAt = new Map<string, number>();
const listeners = new Set<(since: number | null) => void>();

function setStale(path: string, savedAt: number | null) {
  if (savedAt === null) staleAt.delete(path);
  else staleAt.set(path, savedAt);
  const next = staleAt.size ? Math.min(...staleAt.values()) : null;
  if (next === offlineSince) return;
  offlineSince = next;
  listeners.forEach((l) => l(next));
}

export function subscribeOffline(listener: (since: number | null) => void): () => void {
  listeners.add(listener);
  listener(offlineSince);
  return () => listeners.delete(listener);
}

async function save(path: string, body: unknown) {
  try {
    const raw = JSON.stringify({ at: Date.now(), body });
    if (raw.length <= SAVE_MAX_CHARS) await AsyncStorage.setItem(SAVE_PREFIX + path, raw);
  } catch {
    // storage full or unavailable: the live copy still works
  }
}

async function saved<T>(path: string): Promise<{ at: number; body: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** A failure worth falling back for: no connection, the proxy down, or the free tier busy. */
const transient = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);

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
    save(path, body);
    setStale(path, null);
    return (SHOW_CRESTS ? body : stripCrests(body)) as T;
  })().catch(async (e) => {
    const copy = transient(e) ? await saved<T>(path) : null;
    if (!copy) throw e;
    setStale(path, copy.at);
    return (SHOW_CRESTS ? copy.body : stripCrests(copy.body)) as T;
  });
  memory.set(url, { at: Date.now(), value });
  value.then(
    () => { if (staleAt.has(path)) memory.delete(url); }, // a saved copy: try the network again next time
    () => memory.delete(url) // never cache a failure
  );
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
