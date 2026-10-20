/**
 * Rules for the football-data.org proxy (api/fd.ts): which upstream paths it
 * will fetch and how long the CDN may cache each one. Kept pure for testing.
 *
 * The free tier allows 10 upstream requests a minute per key. Every response
 * is cached at Vercel's edge, so that budget is shared by all visitors rather
 * than spent per visitor: a hundred people opening the Premier League table in
 * the same five minutes cost one upstream call.
 */

export const COMPETITIONS = new Set([2021, 2014, 2002, 2019, 2015, 2001]);

const PARAMS = new Set(['status', 'season', 'limit', 'matchday', 'dateFrom', 'dateTo']);

interface Rule {
  pattern: RegExp;
  /** seconds the edge may serve it fresh, then serve stale while refreshing */
  maxAge: number;
  stale: number;
}

// stale-while-revalidate is long on purpose: when the free tier is busy (429),
// the edge keeps serving the last good copy instead of an error
const RULES: Rule[] = [
  // a season's fixtures carry the live scores, so they're the shortest-lived
  { pattern: /^competitions\/(\d+)\/matches$/, maxAge: 30, stale: 600 },
  // tables only change when a match finishes
  { pattern: /^competitions\/(\d+)\/standings$/, maxAge: 300, stale: 3600 },
  { pattern: /^competitions\/(\d+)\/scorers$/, maxAge: 1800, stale: 21600 },
  { pattern: /^competitions\/(\d+)\/teams$/, maxAge: 43200, stale: 604800 },
];

export interface Resolved {
  upstream: string;
  cacheControl: string;
}

/** Map a client path + query to an upstream URL, or null if it isn't allowed. */
export function resolve(path: string, query: URLSearchParams): Resolved | null {
  const clean = path.replace(/^\/+|\/+$/g, '');
  for (const rule of RULES) {
    const m = clean.match(rule.pattern);
    if (!m) continue;
    if (!COMPETITIONS.has(Number(m[1]))) return null;
    const params = new URLSearchParams();
    for (const [k, v] of query) {
      if (k !== 'path' && PARAMS.has(k) && /^[\w,.-]{1,40}$/.test(v)) params.set(k, v);
    }
    const qs = params.toString();
    return {
      upstream: `https://api.football-data.org/v4/${clean}${qs ? `?${qs}` : ''}`,
      cacheControl: `public, max-age=0, s-maxage=${rule.maxAge}, stale-while-revalidate=${rule.stale}`,
    };
  }
  return null;
}
