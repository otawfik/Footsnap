import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerCard } from '../lib/cards';
import type { Line } from '../lib/football';
import { checkWhy, duelAbility, FACTS_OVERRIDE } from '../lib/abilities';
import type { Facts } from '../lib/facts';

const ID = 990001;
const card = (line: Line, age = 25): PlayerCard => ({
  id: ID, name: 'P', banner: 'P', line, position: 'Player', age, dateOfBirth: null, nationality: 'X',
  team: { id: 1, name: 'Team One', shortName: 'One', colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } },
  rarity: 'common', rank: null, stats: null, power: null, abilities: [],
});
const as = (f: Facts | undefined, line: Line, age?: number) => {
  FACTS_OVERRIDE[ID] = f;
  const c = card(line, age);
  const a = duelAbility(c);
  expect(checkWhy(c, a)).toBeNull();
  return a;
};
afterEach(() => delete FACTS_OVERRIDE[ID]);

describe('Wikidata profile abilities', () => {
  it('reads caps, height and position, in that order', () => {
    expect(as({ q: 'Q1', caps: 104, cm: 195, pos: ['cb'] }, 'DF')).toMatchObject({ title: 'Centurion', role: 'profile-caps', why: '104 caps for his country (Wikidata).' });
    expect(as({ q: 'Q1', cm: 195, pos: ['cb'] }, 'DF')).toMatchObject({ title: 'Wins every header', why: '195 cm tall (Wikidata).' });
    expect(as({ q: 'Q1', cm: 168, pos: ['wg'] }, 'FW').title).toBe('Low centre of gravity');
    expect(as({ q: 'Q1', cm: 180, pos: ['wg', 'am'] }, 'FW')).toMatchObject({ title: 'Winger', why: 'Listed as a winger (Wikidata), at One.' });
    expect(as({ q: 'Q1', caps: 61, cm: 180 }, 'MF').title).toBe('Seasoned international');
    expect(as({ q: 'Q1', pos: ['cb'] }, 'DF').title).toBe('Centre-back pairing');
  });

  it("a position only counts on the player's own line, and heights are per line", () => {
    // a 'winger' listed as a defender (a wing-back in the squad list) doesn't become a Winger
    expect(as({ q: 'Q1', pos: ['wg'] }, 'DF').role).toMatch(/variant$/);
    // 191 is tall for a forward, not for a goalkeeper
    expect(as({ q: 'Q1', cm: 191 }, 'FW').title).toBe('Target man');
    expect(as({ q: 'Q1', cm: 191 }, 'GK').role).toBe('GK-variant');
    // keepers and defenders are never 'short'
    expect(as({ q: 'Q1', cm: 168 }, 'DF').role).toBe('DF-variant');
  });

  it('age traits still come first; no facts falls back to the line variant', () => {
    expect(as({ q: 'Q1', caps: 120 }, 'FW', 19).title).toBe('Wonderkid');
    expect(as(undefined, 'MF').role).toBe('MF-variant');
  });

  it('checkWhy refuses a height the facts do not hold', () => {
    FACTS_OVERRIDE[ID] = { q: 'Q1', cm: 180 };
    expect(checkWhy(card('FW'), { why: '199 cm tall (Wikidata).', parts: [{ kind: 'withMates', n: 1 }], role: 'profile-tall' })).toMatch(/199/);
  });
});
