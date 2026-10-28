import { describe, expect, it } from 'vitest';
import { buildCards, explainStats, faceName, faceStats, initialOf, seasonLabel, teamCode } from '../lib/cards';
import { nationCode } from '../lib/nations';
import { cardStats, GOAL_BONUS_CAP } from '../lib/game';
import type { TeamDetail } from '../lib/types';

describe('face name', () => {
  it('prints the surname, FUT-style', () => {
    expect(faceName('Erling Haaland')).toBe('Haaland');
    expect(faceName('Harry Kane')).toBe('Kane');
    expect(faceName('Martin Ødegaard')).toBe('Ødegaard');
    expect(faceName('Rodri')).toBe('Rodri');
  });
  it('keeps particles and suffixes with the surname', () => {
    expect(faceName('Virgil van Dijk')).toBe('van Dijk');
    expect(faceName('Kevin De Bruyne')).toBe('De Bruyne');
    expect(faceName('Alexis Mac Allister')).toBe('Mac Allister');
    expect(faceName('Vinicius Junior')).toBe('Vinicius Junior');
    expect(faceName('De Ligt')).toBe('De Ligt');
  });
  it('takes the medallion letter from the surname, keeping diacritics', () => {
    expect(initialOf('Martin Ødegaard')).toBe('Ø');
    expect(initialOf('Virgil van Dijk')).toBe('D');
    expect(initialOf('Kylian Mbappé')).toBe('M');
    expect(initialOf('Éder Militão')).toBe('M');
  });
});

describe('codes', () => {
  it('uses the data tla, else the short name', () => {
    expect(teamCode({ tla: 'mci', name: 'Manchester City FC', shortName: 'Man City' })).toBe('MCI');
    expect(teamCode({ name: 'Bayer 04 Leverkusen', shortName: 'Leverkusen' })).toBe('LEV');
    expect(teamCode({ tla: '', name: 'Atlético Madrid' })).toBe('ATL');
  });
  it('maps nationalities to FIFA trigrams, with football-data spellings', () => {
    expect(nationCode('Norway')).toBe('NOR');
    expect(nationCode('England')).toBe('ENG');
    expect(nationCode('Germany')).toBe('GER');
    expect(nationCode('Netherlands')).toBe('NED');
    expect(nationCode('Korea, South')).toBe('KOR');
    expect(nationCode('Cape Verde Islands')).toBe('CPV');
    expect(nationCode('Turkiye')).toBe('TUR');
    expect(nationCode('Ivory Coast')).toBe('CIV');
    expect(nationCode('Atlantis')).toBe('ATL');
    expect(nationCode(null)).toBeNull();
  });
  it('labels the season from the date', () => {
    expect(seasonLabel(new Date('2026-10-28'))).toBe('26/27');
    expect(seasonLabel(new Date('2027-03-01'))).toBe('26/27');
    expect(seasonLabel(new Date('2027-08-01'))).toBe('27/28');
  });
  it('puts a club code on every built card', () => {
    const teams: TeamDetail[] = [{ id: 1, name: 'Alpha FC', shortName: 'Alpha', tla: 'ALF', squad: [{ id: 5, name: 'A B' }] }, { id: 2, name: 'Beta', squad: [{ id: 6, name: 'C D' }] }];
    const cards = buildCards(teams, [], 'L');
    expect(cards.get(5)?.team.tla).toBe('ALF');
    expect(cards.get(6)?.team.tla).toBe('BET');
  });
});

describe('face stats', () => {
  it('shows goals, assists, apps and age', () => {
    expect(faceStats({ stats: { goals: 9, assists: 2, penalties: 1, played: 8 }, age: 26 })).toEqual([
      { value: '9', label: 'GLS' },
      { value: '2', label: 'AST' },
      { value: '8', label: 'APP' },
      { value: '26', label: 'AGE' },
    ]);
  });
  it('shows goals per game when assists are missing, never a fake 0', () => {
    const s = faceStats({ stats: { goals: 9, assists: null, penalties: null, played: 8 }, age: 26 });
    expect(s?.map((x) => x.label)).toEqual(['GLS', 'G/GM', 'APP', 'AGE']);
    expect(s?.[1].value).toBe('1.13');
    const t = faceStats({ stats: { goals: 3, assists: null, penalties: null, played: null }, age: null });
    expect(t).toEqual([{ value: '3', label: 'GLS' }]);
  });
  it('is null without season stats', () => {
    expect(faceStats({ stats: null, age: 30 })).toBeNull();
  });
});

describe('explain', () => {
  const base = { id: 1, name: 'X', banner: 'X', position: 'Forward', age: 26, dateOfBirth: null, nationality: 'Norway', team: { id: 1, name: 'T', shortName: 'T', colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } }, power: 0, abilities: [] };
  it('matches the duel numbers', () => {
    const icon = { ...base, rarity: 'icon' as const, rank: 1, line: 'FW' as const, stats: { goals: 9, assists: 1, penalties: 0, played: 8 } };
    const g = cardStats(icon);
    expect(explainStats(icon, g.cost, g.power, GOAL_BONUS_CAP)).toEqual(['Cost 6: Icon rarity.', `Power ${g.power}: ${g.power - 2} for cost 6 + 2 for 9 goals (1 per 4).`]);
    const def = { ...base, rarity: 'common' as const, rank: null, line: 'DF' as const, stats: null };
    const d = cardStats(def);
    expect(explainStats(def, d.cost, d.power)[0]).toBe('Cost 1: Bronze defender.');
    expect(explainStats(def, d.cost, d.power)[1]).toBe(`Power ${d.power}: ${d.power} for cost 1. No league goals listed, so no goal bonus.`);
  });
});
