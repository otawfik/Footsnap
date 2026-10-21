import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('saved copies when offline', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('serves the last good response when the network is down, and says so', async () => {
    const api = await import('../services/api');
    const seen: (number | null)[] = [];
    api.subscribeOffline((s) => seen.push(s));

    vi.stubGlobal('fetch', vi.fn(async () => ok({ standings: ['live'] })));
    expect(await api.fetchStandings(2021, true)).toEqual({ standings: ['live'] });
    await new Promise((r) => setTimeout(r, 0)); // let the save land

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await api.fetchStandings(2021, true)).toEqual({ standings: ['live'] });
    expect(typeof seen.at(-1)).toBe('number');

    vi.stubGlobal('fetch', vi.fn(async () => ok({ standings: ['fresh'] })));
    expect(await api.fetchStandings(2021)).toEqual({ standings: ['fresh'] }); // a saved copy isn't memory-cached
    expect(seen.at(-1)).toBeNull();
  });

  it('still fails when there is nothing saved, or the request itself is wrong', async () => {
    const api = await import('../services/api');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(api.fetchScorers(2021, true)).rejects.toThrow('No connection');

    store.set('fd:v1:competitions/2021/teams', JSON.stringify({ at: 1, body: { teams: [] } }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Not allowed"}', { status: 404 })));
    await expect(api.fetchTeams(2021, true)).rejects.toThrow('Not allowed');
  });
});
