import { describe, expect, it } from 'vitest';
import { resolve } from '../lib/proxy';

const q = (s = '') => new URLSearchParams(s);

describe('proxy rules', () => {
  it('allows the four data paths for supported competitions', () => {
    for (const p of ['standings', 'matches', 'scorers', 'teams']) {
      expect(resolve(`competitions/2021/${p}`, q())).not.toBeNull();
    }
  });

  it('rejects other competitions and other paths', () => {
    expect(resolve('competitions/2000/standings', q())).toBeNull();
    expect(resolve('persons/44', q())).toBeNull();
    expect(resolve('competitions/2021/../../v2/foo', q())).toBeNull();
    expect(resolve('', q())).toBeNull();
  });

  it('forwards only known, well-formed query parameters', () => {
    const r = resolve('competitions/2021/scorers', q('limit=20&path=x&token=abc&status=SCHEDULED,TIMED&season=2025;drop'))!;
    expect(r.upstream).toBe('https://api.football-data.org/v4/competitions/2021/scorers?limit=20&status=SCHEDULED%2CTIMED');
  });

  it('caches live-carrying fixtures briefly and squads for long', () => {
    expect(resolve('competitions/2021/matches', q())!.cacheControl).toContain('s-maxage=30');
    expect(resolve('competitions/2021/teams', q())!.cacheControl).toContain('s-maxage=43200');
  });
});
