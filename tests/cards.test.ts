import { describe, expect, it } from 'vitest';
import { bannerName, buildCards, rarityForRank, statAbilities, traitAbilities } from '../lib/cards';
import type { Scorer, TeamDetail } from '../lib/types';

const now = new Date('2026-10-20T12:00:00Z');
const teams: TeamDetail[] = [
  {
    id: 1, name: 'Alpha FC', shortName: 'Alpha', clubColors: 'Red / White',
    squad: [
      { id: 11, name: 'Kid Striker', position: 'Centre-Forward', dateOfBirth: '2007-01-01', nationality: 'England' },
      { id: 12, name: 'Old Keeper', position: 'Goalkeeper', dateOfBirth: '1990-01-01', nationality: 'Japan' },
      { id: 13, name: 'Mid Fielder', position: 'Central Midfield', dateOfBirth: '1999-05-05', nationality: 'England' },
    ],
  },
  {
    id: 2, name: 'Beta United', shortName: 'Beta', clubColors: 'Sky Blue / White',
    squad: [
      { id: 21, name: 'Top Scorer', position: 'Centre-Forward', dateOfBirth: '2000-06-01', nationality: 'Norway' },
      { id: 22, name: 'Back Four', position: 'Left-Back', dateOfBirth: '1998-02-02', nationality: 'England' },
    ],
  },
];
const scorers: Scorer[] = [
  { player: { id: 21, name: 'Top Scorer' }, team: { id: 2, name: 'Beta United' }, goals: 9, assists: 1, penalties: 3, playedMatches: 8 },
  { player: { id: 11, name: 'Kid Striker' }, team: { id: 1, name: 'Alpha FC' }, goals: 4, assists: 4, penalties: 0, playedMatches: 8 },
];

describe('rarity', () => {
  it('follows rank by goal contributions', () => {
    expect([1, 3, 4, 10, 11, 20, 21, null].map(rarityForRank)).toEqual(['icon', 'icon', 'elite', 'elite', 'rare', 'rare', 'common', 'common']);
  });
});

describe('buildCards', () => {
  const cards = buildCards(teams, scorers, 'Test League', 'England', now);

  it('gives every squad player a card', () => {
    expect(cards.size).toBe(5);
  });

  it('ranks by goals × 2 + assists and sets Power', () => {
    expect(cards.get(21)!.rank).toBe(1);
    expect(cards.get(21)!.power).toBe(19);
    expect(cards.get(11)!.rank).toBe(2);
    expect(cards.get(13)!.power).toBeNull();
    expect(cards.get(13)!.rarity).toBe('common');
  });

  it('writes abilities that are true of the data', () => {
    const top = cards.get(21)!.abilities.map((a) => a.text);
    expect(top[0]).toBe('Leads the Test League with 9 goals.');
    const kid = cards.get(11)!.abilities.map((a) => a.title);
    expect(kid).toContain('Wonderkid');
    const keeper = cards.get(12)!.abilities.map((a) => a.text);
    expect(keeper[0]).toBe('The only player from Japan in the Test League.');
    expect(keeper).toContain('36: the oldest player at Alpha.');
  });

  it('never gives more than two abilities, and always at least one', () => {
    for (const c of cards.values()) {
      expect(c.abilities.length).toBeGreaterThanOrEqual(1);
      expect(c.abilities.length).toBeLessThanOrEqual(2);
    }
  });

  it('uses club colours', () => {
    expect(cards.get(21)!.team.colors.primary).toBe('#6CABDD');
  });
});

describe('statAbilities', () => {
  const ctx = { competition: 'L', topGoals: 10, topGoalsCount: 2 };
  it('handles joint leaders, penalties, playmaking and open play', () => {
    expect(statAbilities({ goals: 10, assists: null, penalties: null, played: 9 }, ctx)[0].text).toBe('Joint top scorer in the L with 10 goals.');
    expect(statAbilities({ goals: 5, assists: null, penalties: 2, played: 9 }, ctx)[0].title).toBe('Spot-kick specialist');
    expect(statAbilities({ goals: 2, assists: 5, penalties: 1, played: 9 }, ctx)[0].text).toBe('5 assists on top of 2 goals.');
    expect(statAbilities({ goals: 5, assists: 0, penalties: 0, played: 9 }, ctx)[0].text).toBe('All 5 goals from open play.');
    expect(statAbilities({ goals: 1, assists: 0, penalties: 1, played: 9 }, ctx)[0].text).toBe('1 goal in 9 games this season.');
  });
});

describe('traitAbilities', () => {
  it('falls back to the role when nothing stands out', () => {
    const a = traitAbilities(
      { age: 26, nationality: 'England', line: 'MF', position: 'Central Midfield' },
      { club: 'X', ages: [26], keepers: 2, fromNation: 0, u21: 0, over33: 0 },
      { competition: 'L', nation: 'Spain', nationCount: new Map([['England', 40]]) }
    );
    expect(a).toEqual([{ key: 'role-MF', kind: 'trait', title: 'Midfielder', text: 'Central Midfield at X, from England.' }]);
  });
});

describe('bannerName', () => {
  it('shortens long names to the surname part', () => {
    expect(bannerName('Erling Haaland')).toBe('Haaland');
    expect(bannerName('Raphinha')).toBe('Raphinha');
  });
});

import { positionName } from '../lib/cards';
describe('positionName', () => {
  it('turns coarse positions into card wording and keeps fine ones', () => {
    expect(positionName('Offence', 'FW')).toBe('Forward');
    expect(positionName('Left-Back', 'DF')).toBe('Left-Back');
    expect(positionName(null, 'GK')).toBe('Goalkeeper');
    expect(positionName(undefined, null)).toBe('Player');
  });
});
