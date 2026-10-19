import { describe, expect, it } from 'vitest';
import { age, byLine, formScore, line, recentForm, splitMatches, squadStats, totalTable, zone } from '../lib/football';
import type { Match } from '../lib/types';

const m = (id: number, date: string, status: Match['status'], home: number, away: number, hg: number | null, ag: number | null): Match => ({
  id,
  utcDate: date,
  status,
  homeTeam: { id: home, name: `T${home}` },
  awayTeam: { id: away, name: `T${away}` },
  score: { fullTime: { home: hg, away: ag } },
});

const now = Date.parse('2026-10-19T15:00:00Z');
const fixtures = [
  m(1, '2026-10-01T15:00:00Z', 'FINISHED', 1, 2, 2, 0),
  m(2, '2026-10-08T15:00:00Z', 'FINISHED', 3, 1, 1, 1),
  m(3, '2026-10-15T15:00:00Z', 'FINISHED', 1, 4, 0, 3),
  m(4, '2026-10-19T14:30:00Z', 'IN_PLAY', 2, 3, 1, 0),
  m(5, '2026-10-22T19:00:00Z', 'TIMED', 1, 3, null, null),
  m(6, '2026-10-20T19:00:00Z', 'SCHEDULED', 2, 4, null, null),
  m(7, '2026-10-18T19:00:00Z', 'POSTPONED', 4, 1, null, null),
];

describe('splitMatches', () => {
  it('separates live, latest results (newest first) and upcoming (soonest first)', () => {
    const { live, results, upcoming } = splitMatches(fixtures, now);
    expect(live.map((x) => x.id)).toEqual([4]);
    expect(results.map((x) => x.id)).toEqual([3, 2, 1]);
    expect(upcoming.map((x) => x.id)).toEqual([6, 5]);
  });
});

describe('form', () => {
  it('reads results from the team’s side, oldest first', () => {
    expect(recentForm(fixtures, 1)).toEqual(['W', 'D', 'L']);
    expect(recentForm(fixtures, 4)).toEqual(['W']);
  });
  it('scores points per game on 0-1', () => {
    expect(formScore(['W', 'D', 'L'])).toBeCloseTo(4 / 9);
    expect(formScore([])).toBe(0);
  });
});

describe('totalTable', () => {
  it('prefers the TOTAL table over home/away splits', () => {
    const t = totalTable({
      standings: [
        { type: 'HOME', table: [{ position: 9 } as never] },
        { type: 'TOTAL', table: [{ position: 1 } as never] },
      ],
    });
    expect(t[0].position).toBe(1);
  });
  it('copes with no data', () => expect(totalTable(null)).toEqual([]));
});

describe('zone', () => {
  it('Premier League: top four, Europe, bottom three', () => {
    expect(zone(2021, 4, 20)).toBe('top');
    expect(zone(2021, 6, 20)).toBe('europe');
    expect(zone(2021, 17, 20)).toBeNull();
    expect(zone(2021, 18, 20)).toBe('relegation');
  });
  it('Bundesliga: 18 teams with a play-off spot', () => {
    expect(zone(2002, 16, 18)).toBe('playoff');
    expect(zone(2002, 17, 18)).toBe('relegation');
  });
  it('Champions League league phase', () => {
    expect(zone(2001, 8, 36)).toBe('top');
    expect(zone(2001, 24, 36)).toBe('playoff');
    expect(zone(2001, 25, 36)).toBe('relegation');
  });
});

describe('squads', () => {
  it('maps coarse and fine positions to lines', () => {
    expect(line('Goalkeeper')).toBe('GK');
    expect(line('Centre-Back')).toBe('DF');
    expect(line('Defence')).toBe('DF');
    expect(line('Defensive Midfield')).toBe('MF');
    expect(line('Right Winger')).toBe('FW');
    expect(line('Offence')).toBe('FW');
    expect(line(null)).toBeNull();
  });
  it('computes age around birthdays', () => {
    const today = new Date('2026-10-19T00:00:00Z');
    expect(age('2000-10-19', today)).toBe(26);
    expect(age('2000-10-20', today)).toBe(25);
    expect(age('not a date', today)).toBeNull();
  });
  it('summarises a squad and groups it by line', () => {
    const squad = [
      { id: 1, name: 'A', position: 'Goalkeeper', dateOfBirth: '2000-01-01', nationality: 'England' },
      { id: 2, name: 'B', position: 'Left-Back', dateOfBirth: '1996-01-01', nationality: 'France' },
      { id: 3, name: 'C', position: null, dateOfBirth: null, nationality: 'England' },
    ];
    const s = squadStats(squad, 'England', new Date('2026-06-01'));
    expect(s.size).toBe(3);
    expect(s.avgAge).toBeCloseTo(28);
    expect(s.foreign).toBeCloseTo(1 / 3);
    const g = byLine(squad);
    expect(g.GK.length).toBe(1);
    expect(g.DF.length).toBe(1);
    expect(g.Other.length).toBe(1);
  });
});
