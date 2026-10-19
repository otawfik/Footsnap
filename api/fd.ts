/**
 * GET /api/fd/<football-data.org path>  (rewritten to /api/fd?path=... by vercel.json)
 *
 * Adds the server-side key, fetches from football-data.org, and lets Vercel's
 * edge cache the answer per lib/proxy.ts. The key never reaches the app.
 */
import { resolve } from '../lib/proxy';

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = resolve(url.searchParams.get('path') ?? '', url.searchParams);
  if (!target) return json({ error: 'Not an allowed football-data.org path.' }, 404);

  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) return json({ error: 'Live data is not connected yet: FOOTBALL_DATA_KEY is not set on the server.', code: 'NO_KEY' }, 503);

  let upstream: Response;
  try {
    upstream = await fetch(target.upstream, { headers: { 'X-Auth-Token': key } });
  } catch {
    return json({ error: 'Could not reach football-data.org.' }, 502);
  }
  const body = await upstream.text();
  if (upstream.status === 429) {
    return json({ error: 'The free data tier is busy for a moment. Retrying shortly.', code: 'RATE_LIMIT' }, 429, {
      'Retry-After': upstream.headers.get('Retry-After') ?? '30',
      'Cache-Control': 'no-store',
    });
  }
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      // only successful answers are cached; errors should be retried
      'Cache-Control': upstream.ok ? target.cacheControl : 'no-store',
    },
  });
}
