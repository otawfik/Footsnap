import { describe, expect, it } from 'vitest';
import type { Ability, PlayerCard, Rarity } from '../lib/cards';
import type { Line } from '../lib/football';
import { checkWhy, duelAbility, GROW_CAP, Part, PartKind, partText, PART_TRIGGER, TRIGGER_NAME } from '../lib/abilities';
import {
  aiPlays, cardPower, cardStats, CROWD_BOOST, endTurn, energyOf, firstToReveal, GameState, isHome, legalPlays, newGame, Placed, play,
  projectedPower, resolveTurn, result, retreat, ROAR_BOOST, Side, snap, statsIn, unplay, Zone, zoneName, zonePower, zoneTwist,
} from '../lib/game';
import { pickStadiums, PLAIN_STADIUMS, Stadium, stadiumPool, TwistId, twistOf, TWISTS, TWIST_POOL } from '../lib/stadiums';
import { hash, rng } from '../lib/rng';

interface CardOpts {
  rarity?: Rarity;
  rank?: number | null;
  line?: Line | null;
  goals?: number;
  assists?: number | null;
  penalties?: number | null;
  age?: number | null;
  team?: number;
  nationality?: string | null;
  keys?: string[];
}
const card = (id: number, o: CardOpts = {}): PlayerCard => ({
  id, name: `P${id}`, banner: `P${id}`, line: o.line === undefined ? 'FW' : o.line, position: 'Forward', age: o.age === undefined ? 25 : o.age, dateOfBirth: null,
  nationality: o.nationality === undefined ? 'X' : o.nationality,
  team: { id: o.team ?? 1, name: `Team ${o.team ?? 1}`, shortName: `Team ${o.team ?? 1}`, colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } },
  rarity: o.rarity ?? 'common', rank: o.rank ?? null,
  stats: o.goals === undefined ? null : { goals: o.goals, assists: o.assists ?? 0, penalties: o.penalties ?? 0, played: 10 },
  power: null,
  abilities: (o.keys ?? []).map((k): Ability => ({ key: k, kind: 'trait', title: k, text: '' })),
});
/** a common forward: cost 2, Power 3 */
const fw = (id: number, o: CardOpts = {}) => card(id, o);
const df = (id: number, o: CardOpts = {}) => card(id, { ...o, line: 'DF' });
const filler = (base: number) => Array.from({ length: 12 }, (_, i) => df(base + i));
const NEUTRAL: TwistId[] = ['neutral', 'neutral', 'neutral'];
/** every test card plays with no ability unless a test gives it parts */
const VANILLA: Record<number, Part[]> = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [i, []]));
const P = (kind: PartKind, n: number): Part => ({ kind, n });
/** a ground that Team 1 (by default) calls home */
const ground = (name: string, twist: TwistId = 'neutral', clubs = [1]): Stadium => ({ name, clubs, codes: clubs.map((c) => `T${c}`), colors: [], twist });

interface SetupOpts {
  turn?: number;
  twists?: TwistId[];
  stadiums?: Stadium[];
  parts?: Record<number, Part[]>;
}
/** A game on a given turn with chosen hands; decks are vanilla 1-cost defenders, plain grounds, no twists. */
function setup(you: PlayerCard[], opp: PlayerCard[] = [], o: SetupOpts = {}): GameState {
  const s = newGame({
    you: filler(900), opponent: filler(950), seed: 1, shuffle: false,
    stadiums: o.stadiums, twists: o.twists ?? (o.stadiums ? undefined : NEUTRAL),
    overrides: { ...VANILLA, ...o.parts },
  });
  s.hands.you = you;
  s.hands.opponent = opp;
  s.turn = o.turn ?? 6;
  return s;
}
/** Put a revealed card straight onto the board (test setup only). */
function put(s: GameState, side: Side, zone: Zone, c: PlayerCard, turn = 1): Placed {
  const p: Placed = { card: c, stats: statsIn(s, c), side, zone, turn, bonus: 0 };
  s.zones[zone][side].push(p);
  return p;
}
const placed = (s: GameState, side: Side, id: number) => s.zones.flatMap((z) => z[side]).find((c) => c.card.id === id)!;
const powerOf = (s: GameState, side: Side, id: number) => cardPower(s, placed(s, side, id));
const turn = (s: GameState, plays: [Side, number, Zone][]) => endTurn(plays.reduce((t, [w, id, z]) => play(t, w, id, z), s), { ai: false });

describe('card stats', () => {
  it('costs by rarity, elite rank and line', () => {
    const cost = (o: CardOpts) => cardStats(card(1, o)).cost;
    expect(cost({ rarity: 'icon', rank: 1 })).toBe(6);
    expect(cost({ rarity: 'elite', rank: 6 })).toBe(5);
    expect(cost({ rarity: 'elite', rank: 7 })).toBe(4);
    expect(cost({ rarity: 'rare', rank: 15 })).toBe(3);
    expect([cost({ line: 'FW' }), cost({ line: 'MF' }), cost({ line: 'DF' }), cost({ line: 'GK' }), cost({ line: null })]).toEqual([2, 2, 1, 1, 2]);
  });

  it('powers by cost plus +1 per 4 goals, at most +3', () => {
    expect(cardStats(card(1, { line: 'GK' })).power).toBe(2);
    expect(cardStats(card(1, { rarity: 'rare', rank: 12 })).power).toBe(5);
    expect(cardStats(card(1, { rarity: 'elite', rank: 8, goals: 8 })).power).toBe(6 + 2);
    expect(cardStats(card(1, { rarity: 'icon', rank: 1, goals: 11 })).power).toBe(10 + 2);
    // a 30-goal season still adds only 3: Power per energy can't run away by spring
    expect(cardStats(card(1, { rarity: 'icon', rank: 1, goals: 30 })).power).toBe(13);
  });

  it('every card has an ability, and an override can take it away', () => {
    expect(cardStats(fw(1)).effect).not.toBeNull();
    const s = setup([]);
    expect(statsIn(s, fw(1)).effect).toBeNull();
    s.overrides = { 1: [P('alone', 2)] };
    expect(statsIn(s, fw(1)).effect!.parts).toEqual([P('alone', 2)]);
  });
});

describe('abilities from the data', () => {
  const role = (c: PlayerCard) => duelAbility(c);

  it('season first: top scorer, penalties, assists, open play, any goals', () => {
    expect(role(fw(1, { goals: 12, keys: ['top-scorer'] }))).toMatchObject({ role: 'season-top', parts: [P('highest', 3)] });
    expect(role(fw(1, { goals: 10, penalties: 3 }))).toMatchObject({ role: 'season-pens', parts: [P('pens', 3)], why: '3 of 10 goals from the penalty spot.' });
    expect(role(fw(1, { goals: 10, penalties: 9 })).parts).toEqual([P('pens', 4)]); // capped
    expect(role(fw(1, { goals: 2, assists: 7 }))).toMatchObject({ role: 'season-assists', parts: [P('boostHere', 2)] });
    expect(role(fw(1, { goals: 5 }))).toMatchObject({ role: 'season-openplay', why: 'All 5 goals from open play.' });
    expect(role(fw(1, { goals: 2 }))).toMatchObject({ role: 'season-threat', parts: [P('outnumbered', 3)] });
  });

  it('then traits from age and passport, then a line variant fixed by player id', () => {
    expect(role(fw(1, { age: 19 }))).toMatchObject({ role: 'trait-young', parts: [P('grow', 1)], why: '19 years old.' });
    expect(role(fw(1, { age: 34 }))).toMatchObject({ role: 'trait-veteran', parts: [P('late', 3)] });
    expect(role(fw(1, { keys: ['one-of-a-kind'] }))).toMatchObject({ role: 'trait-passport', parts: [P('roamer', 2)] });
    expect(role(fw(1, { keys: ['home-nation'] }))).toMatchObject({ role: 'trait-home', parts: [P('homeHero', 2)] });
    // a keeper with a rare passport falls through to its line
    expect(role(card(1, { line: 'GK', keys: ['rare-passport'] })).role).toBe('GK-variant');
    const a = role(df(77));
    expect(role(df(77))).toEqual(a);
    expect(a).toMatchObject({ role: 'DF-variant', archetype: 'Defender', why: 'Forward at Team 1.' });
  });

  it('text leads with the trigger, and growth says its cap', () => {
    const c = fw(1);
    for (const kind of Object.keys(PART_TRIGGER) as PartKind[]) expect(partText(P(kind, 2), c).startsWith(`${TRIGGER_NAME[PART_TRIGGER[kind]]}: `)).toBe(true);
    expect(partText(P('grow', 1), c)).toBe(`Every turn: +1 Power, up to +${GROW_CAP}.`);
    expect(partText(P('homeHero', 2), c)).toBe("While here: +2 more Power at Team 1's stadium.");
  });

  it("checkWhy passes what duelAbility builds and catches a number the data doesn't hold", () => {
    const cards = [fw(1, { goals: 12, keys: ['top-scorer'] }), fw(2, { goals: 10, penalties: 3 }), fw(3, { age: 19 }), fw(4, { age: 34 }), df(5), card(6, { line: 'GK' })];
    for (const c of cards) expect(checkWhy(c, duelAbility(c))).toBeNull();
    expect(checkWhy(fw(2, { goals: 10, penalties: 3 }), { why: '4 of 10 goals.', parts: [P('pens', 3)], role: 'season-pens' })).toMatch(/"4"/);
    expect(checkWhy(fw(2, { goals: 10, penalties: 3 }), { why: '', parts: [P('pens', 4)], role: 'season-pens' })).toMatch(/pens/);
    expect(checkWhy(fw(3, { age: 25 }), { why: '', parts: [P('grow', 1)], role: 'trait-young' })).toMatch(/growth/);
  });
});

describe('parts', () => {
  it('alone: Kick-off +n as your only card here, counting a card queued beside it', () => {
    let s = turn(setup([fw(1)], [], { parts: { 1: [P('alone', 4)] } }), [['you', 1, 0]]);
    expect(powerOf(s, 'you', 1)).toBe(7);
    expect(s.log).toContain('P1 revealed at Left wing: +4, alone here.');
    s = turn(setup([fw(1), fw(2)], [], { parts: { 1: [P('alone', 4)] } }), [['you', 2, 0], ['you', 1, 0]]);
    expect(powerOf(s, 'you', 1)).toBe(3);
  });

  it('outnumbered, behind and emptyHere read the board as the card lands', () => {
    const o = (kind: PartKind, foes: number) => {
      const s = setup([fw(1)], [], { parts: { 1: [P(kind, 3)] } });
      for (let i = 0; i < foes; i++) put(s, 'opponent', 0, fw(50 + i));
      return powerOf(turn(s, [['you', 1, 0]]), 'you', 1);
    };
    expect([o('outnumbered', 2), o('outnumbered', 1)]).toEqual([6, 3]);
    expect([o('behind', 1), o('behind', 0)]).toEqual([6, 3]);
    expect([o('emptyHere', 0), o('emptyHere', 1)]).toEqual([6, 3]);
  });

  it('boostHere: +n to your other revealed cards here, so queue order matters', () => {
    let s = turn(setup([fw(1), fw(2), fw(3)], [], { parts: { 2: [P('boostHere', 1)] } }), [['you', 1, 0], ['you', 2, 0], ['you', 3, 0]]);
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2), powerOf(s, 'you', 3)]).toEqual([4, 3, 3]);
    expect(s.log).toContain('P2 revealed at Left wing: +1 to your other cards here.');
    s = setup([fw(2)], [], { parts: { 2: [P('boostHere', 1)] } });
    put(s, 'opponent', 0, fw(50)); // enemy cards don't get it
    s = turn(s, [['you', 2, 0]]);
    expect(powerOf(s, 'opponent', 50)).toBe(3);
  });

  it('boostOthers: +n to your strongest card at each other stadium', () => {
    const s = setup([fw(1)], [], { parts: { 1: [P('boostOthers', 1)] } });
    put(s, 'you', 1, fw(10));
    put(s, 'you', 2, card(11, { rarity: 'rare', rank: 12 }));
    put(s, 'you', 2, fw(12));
    const t = turn(s, [['you', 1, 0]]);
    expect([powerOf(t, 'you', 10), powerOf(t, 'you', 11), powerOf(t, 'you', 12)]).toEqual([4, 6, 3]);
  });

  it(`grow: Every turn +n, never more than +${GROW_CAP} in all`, () => {
    let s = turn(setup([fw(1)], [], { turn: 2, parts: { 1: [P('grow', 1)] } }), [['you', 1, 2]]);
    expect(powerOf(s, 'you', 1)).toBe(4);
    for (let i = 0; i < 3; i++) s = endTurn(s, { ai: false });
    expect(powerOf(s, 'you', 1)).toBe(3 + GROW_CAP);
    expect(s.log).toContain(`P1 grew to ${3 + GROW_CAP} Power.`);
    expect(s.log.filter((l) => l.startsWith('P1 grew'))).toHaveLength(GROW_CAP);
  });

  it('late: +n only if played on turn 5 or 6', () => {
    const s = setup([], [], { parts: { 1: [P('late', 3)], 2: [P('late', 3)], 3: [P('late', 3)] } });
    put(s, 'you', 0, fw(1), 4);
    put(s, 'you', 1, fw(2), 5);
    put(s, 'you', 2, fw(3), 6);
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2), powerOf(s, 'you', 3)]).toEqual([3, 6, 6]);
  });

  it('draw: Kick-off draws, and an empty deck is harmless', () => {
    let s = setup([fw(1), fw(2)], [], { parts: { 1: [P('draw', 1)], 2: [P('draw', 1)] } });
    const deck = s.decks.you.length;
    s = turn(s, [['you', 1, 0]]);
    expect(s.hands.you.length).toBe(2);
    expect(s.decks.you.length).toBe(deck - 1);
    s = setup([fw(2)], [], { parts: { 2: [P('draw', 1)] } });
    s.decks.you = [];
    s = turn(s, [['you', 2, 0]]);
    expect(s.log).toContain('P2 revealed at Left wing: deck is empty.');
  });

  it("mark: enemy cards here −n; it doesn't stack and doesn't hit its own side", () => {
    const s = setup([], [], { parts: { 1: [P('mark', 1)], 2: [P('mark', 1)], 3: [P('mark', 1)] } });
    put(s, 'you', 0, card(1, { line: 'GK' }));
    put(s, 'opponent', 0, fw(50));
    put(s, 'opponent', 1, fw(51));
    expect([powerOf(s, 'opponent', 50), powerOf(s, 'opponent', 51)]).toEqual([2, 3]);
    put(s, 'you', 0, df(2));
    put(s, 'you', 0, df(3));
    expect(powerOf(s, 'opponent', 50)).toBe(2);
    expect(powerOf(s, 'you', 1)).toBe(2);
  });

  it('tackle hits their strongest card here; stop hits every one; Power floors at 0', () => {
    let s = setup([fw(1)], [], { parts: { 1: [P('tackle', 2)] } });
    put(s, 'opponent', 0, card(50, { rarity: 'rare', rank: 12 }));
    put(s, 'opponent', 0, fw(51));
    s = turn(s, [['you', 1, 0]]);
    expect([powerOf(s, 'opponent', 50), powerOf(s, 'opponent', 51)]).toEqual([3, 3]);
    expect(s.log).toContain('P1 revealed at Left wing: −2 to AI · P50.');
    s = setup([fw(1)], [], { parts: { 1: [P('stop', 1)] } });
    put(s, 'opponent', 0, card(50, { rarity: 'rare', rank: 12 }));
    put(s, 'opponent', 0, fw(51));
    s = turn(s, [['you', 1, 0]]);
    expect([powerOf(s, 'opponent', 50), powerOf(s, 'opponent', 51)]).toEqual([4, 2]);
    s = setup([fw(1)], [], { parts: { 1: [P('tackle', 9)] } });
    put(s, 'opponent', 0, fw(50));
    expect(powerOf(turn(s, [['you', 1, 0]]), 'opponent', 50)).toBe(0);
  });

  it('pairDef and captain read your other cards here', () => {
    const s = setup([], [], { parts: { 1: [P('pairDef', 3)], 5: [P('captain', 1)] } });
    put(s, 'you', 0, df(1));
    put(s, 'you', 0, fw(2));
    expect(powerOf(s, 'you', 1)).toBe(2);
    put(s, 'you', 0, df(3));
    expect(powerOf(s, 'you', 1)).toBe(5);
    put(s, 'you', 1, card(5, { line: 'GK' }));
    put(s, 'you', 1, fw(6));
    expect([powerOf(s, 'you', 5), powerOf(s, 'you', 6)]).toEqual([2, 4]);
  });

  it('Full time: lastDitch only if behind there, pens always', () => {
    const s = setup([], [], { parts: { 1: [P('lastDitch', 3)], 2: [P('lastDitch', 3)], 3: [P('pens', 2)] } });
    put(s, 'you', 0, fw(1));
    put(s, 'opponent', 0, card(50, { rarity: 'rare', rank: 12 }));
    put(s, 'you', 1, fw(2));
    put(s, 'you', 2, fw(3));
    const r = resolveTurn(s, { ai: false });
    const t = r.final;
    expect([powerOf(t, 'you', 1), powerOf(t, 'you', 2), powerOf(t, 'you', 3)]).toEqual([6, 3, 5]);
    expect(t.log).toContain('Full time: P1 +3 at Left wing.');
    expect(r.steps.map((x) => x.kind)).toContain('fulltime');
  });

  it("homeHero and roamer read the card's own club's ground", () => {
    const stadiums = [ground('Home Park'), ground('Away Road', 'neutral', [2]), ground('Elsewhere', 'neutral', [3])];
    const s = setup([], [], { stadiums, parts: { 1: [P('homeHero', 3)], 2: [P('homeHero', 3)], 3: [P('roamer', 2)], 4: [P('roamer', 2)] } });
    put(s, 'you', 0, fw(1));
    put(s, 'you', 1, fw(2));
    put(s, 'you', 0, fw(3));
    put(s, 'you', 1, fw(4));
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2)]).toEqual([3 + CROWD_BOOST + 3, 3]);
    expect([powerOf(s, 'you', 3), powerOf(s, 'you', 4)]).toEqual([3 + CROWD_BOOST, 5]);
  });

  it('spread, clubmates (max 3) and countrymen count the right cards', () => {
    const s = setup([], [], { parts: { 1: [P('spread', 2)], 2: [P('clubmates', 1)], 3: [P('countrymen', 2)] } });
    put(s, 'you', 0, fw(1));
    expect(powerOf(s, 'you', 1)).toBe(3);
    put(s, 'you', 1, fw(10, { team: 2, nationality: 'Y' }));
    put(s, 'you', 2, fw(11, { team: 2, nationality: 'Y' }));
    expect(powerOf(s, 'you', 1)).toBe(5);
    put(s, 'you', 1, fw(2));
    // clubmates: P1 only (10, 11 are another club); then three more Team 1 cards cap it at +3
    expect(powerOf(s, 'you', 2)).toBe(4);
    put(s, 'you', 2, fw(12));
    put(s, 'you', 2, fw(13));
    put(s, 'you', 0, fw(14));
    expect(powerOf(s, 'you', 2)).toBe(6);
    // countrymen: other X cards here (P1, P14 at the Left wing)
    put(s, 'you', 0, fw(3));
    expect(powerOf(s, 'you', 3)).toBe(3 + 4);
    const t = setup([], [], { parts: { 3: [P('countrymen', 2)] } });
    put(t, 'you', 0, fw(3, { nationality: null }));
    put(t, 'you', 0, fw(4, { nationality: null }));
    expect(powerOf(t, 'you', 3)).toBe(3);
  });
});

describe('stadiums', () => {
  it('a home card gets the crowd boost at its own ground only, on either side', () => {
    const s = setup([], [], { stadiums: [ground('Home Park'), ground('Away Road', 'neutral', [2]), ground('Elsewhere', 'neutral', [])] });
    put(s, 'you', 0, fw(1));
    put(s, 'opponent', 0, fw(50));
    put(s, 'opponent', 1, fw(51));
    put(s, 'you', 1, fw(52, { team: 2 }));
    expect([powerOf(s, 'you', 1), powerOf(s, 'opponent', 50), powerOf(s, 'opponent', 51), powerOf(s, 'you', 52)]).toEqual([7, 7, 3, 7]);
    expect([isHome(s, 0, fw(1)), isHome(s, 2, fw(1))]).toEqual([true, false]);
    expect(zoneName(s, 1)).toBe('Away Road');
  });

  it('the landing step says when the crowd fired', () => {
    const s = setup([fw(1), fw(2, { team: 9 })], [], { stadiums: [ground('Home Park'), ground('B', 'neutral', []), ground('C', 'neutral', [])] });
    const r = resolveTurn(play(play(s, 'you', 1, 0), 'you', 2, 1), { ai: false });
    expect(r.steps.filter((x) => x.kind === 'reveal').map((x) => x.crowd)).toEqual([true, false]);
    expect(r.final.log).toContain(`P1 revealed at Home Park: home crowd +${CROWD_BOOST}.`);
  });

  it('twists reveal on turns 1, 2, 3 and do nothing before', () => {
    let s = newGame({ you: filler(1), opponent: filler(100), seed: 1, twists: ['floodlights', 'heavy', 'cauldron'] });
    expect([0, 1, 2].map((z) => zoneTwist(s, z as Zone))).toEqual(['floodlights', null, null]);
    s = endTurn(endTurn(s, { ai: false }), { ai: false });
    expect([0, 1, 2].map((z) => zoneTwist(s, z as Zone))).toEqual(['floodlights', 'heavy', 'cauldron']);
    expect(s.log).toContain(`Right wing revealed: Cauldron. ${TWISTS.cauldron.text}`);
  });

  it('plain grounds draw three different twists from the seed', () => {
    const g = (seed: number) => newGame({ you: filler(1), opponent: filler(100), seed }).stadiums.map((x) => x.twist);
    expect(g(7)).toEqual(g(7));
    for (let seed = 0; seed < 50; seed++) expect(new Set(g(seed)).size).toBe(3);
  });

  it('Floodlights +1; Heavy pitch costs 1 more once revealed; Tight pitch holds 3', () => {
    const s = setup([fw(1), df(2)], [], { twists: ['floodlights', 'heavy', 'tight'] });
    put(s, 'you', 0, fw(10));
    expect(powerOf(s, 'you', 10)).toBe(4);
    expect(legalPlays(s, 'you').filter((p) => p.cardId === 1).map((p) => [p.zone, p.cost])).toEqual([[0, 2], [1, 3], [2, 2]]);
    s.turn = 1; // the Centre's Heavy pitch hasn't revealed
    expect(legalPlays(s, 'you').filter((p) => p.cardId === 2).map((p) => p.cost)).toEqual([1, 1, 1]);
    s.turn = 6;
    for (let i = 0; i < 2; i++) put(s, 'you', 2, df(20 + i));
    const t = play(s, 'you', 2, 2);
    expect(() => play(t, 'you', 1, 2)).toThrow('Right wing is full.');
  });

  it("Cauldron: each side's first card here each turn gets +2, for good", () => {
    let s = setup([fw(1), fw(2)], [fw(50)], { twists: ['cauldron', 'neutral', 'neutral'], turn: 5 });
    s = turn(s, [['you', 1, 0], ['you', 2, 0], ['opponent', 50, 0]]);
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2), powerOf(s, 'opponent', 50)]).toEqual([5, 3, 5]);
    s.hands.you.push(fw(3));
    s = turn(s, [['you', 3, 0]]);
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 3)]).toEqual([5, 5]);
  });

  it("Tactics board: abilities don't work there, the crowd still does", () => {
    const stadiums = [ground('Board', 'tactics'), ground('B', 'neutral', []), ground('C', 'neutral', [])];
    const s = turn(setup([fw(1)], [], { stadiums, parts: { 1: [P('alone', 4)] } }), [['you', 1, 0]]);
    expect(powerOf(s, 'you', 1)).toBe(3 + CROWD_BOOST);
    const t = setup([], [], { stadiums, parts: { 50: [P('mark', 1)] } });
    put(t, 'you', 0, fw(2, { team: 9 }));
    put(t, 'opponent', 0, card(50, { line: 'GK', team: 9 }));
    expect(powerOf(t, 'you', 2)).toBe(3);
  });

  it(`Wall of sound: the crowd is +${ROAR_BOOST}; Big stage: the strongest card either side +2`, () => {
    const s = setup([], [], { stadiums: [ground('Loud', 'roar'), ground('Stage', 'spotlight', []), ground('C', 'neutral', [])] });
    put(s, 'you', 0, fw(1));
    expect(powerOf(s, 'you', 1)).toBe(3 + ROAR_BOOST);
    put(s, 'you', 1, fw(2));
    put(s, 'opponent', 1, card(50, { rarity: 'rare', rank: 12 }));
    put(s, 'opponent', 1, card(51, { rarity: 'rare', rank: 13 }));
    expect([powerOf(s, 'you', 2), powerOf(s, 'opponent', 50), powerOf(s, 'opponent', 51)]).toEqual([3, 7, 7]);
  });

  it('Late drama: from turn 5 a side 4 or more behind gets +3, and close zones are left alone', () => {
    const s = setup([], [], { twists: ['counter', 'neutral', 'neutral'], turn: 5 });
    put(s, 'you', 0, card(1, { rarity: 'rare', rank: 12 }));
    put(s, 'opponent', 0, fw(50));
    expect([zonePower(s, 0, 'you'), zonePower(s, 0, 'opponent')]).toEqual([5, 3]);
    put(s, 'you', 0, card(2, { rarity: 'rare', rank: 13 }));
    expect([zonePower(s, 0, 'you'), zonePower(s, 0, 'opponent')]).toEqual([10, 6]);
    s.turn = 4;
    expect(zonePower(s, 0, 'opponent')).toBe(3);
  });

  it('Fortress: the side behind there gets +1 energy next turn', () => {
    const s = setup([], [], { twists: ['fortress', 'neutral', 'neutral'], turn: 3 });
    put(s, 'you', 0, fw(1));
    const t = endTurn(s, { ai: false });
    expect([energyOf(t, 'you'), energyOf(t, 'opponent')]).toEqual([4, 5]);
    expect(t.log).toContain('Fortress at Left wing: AI Manager gets +1 energy next turn.');
  });

  it('every twist has a plate-length summary', () => {
    for (const t of Object.values(TWISTS)) expect(t.short.length).toBeLessThanOrEqual(22);
  });
});

describe('stadium pool', () => {
  const teams = [
    { id: 1, name: 'Inter', shortName: 'Inter', tla: 'INT', venue: 'Stadio Giuseppe Meazza', clubColors: 'Blue / Black' },
    { id: 2, name: 'Milan', shortName: 'Milan', tla: 'MIL', venue: 'Stadio Giuseppe Meazza', clubColors: 'Red / Black' },
    { id: 3, name: 'Roma', shortName: 'Roma', tla: 'ROM', venue: 'Stadio Olimpico', clubColors: 'Red / Yellow' },
    { id: 4, name: 'Nowhere FC', shortName: 'Nowhere', tla: 'NOW', venue: null, clubColors: null },
    { id: 5, name: 'Atalanta', shortName: 'Atalanta', tla: 'ATA', venue: 'Gewiss Stadium', clubColors: 'Blue / Black' },
    { id: 6, name: 'Napoli', shortName: 'Napoli', tla: 'NAP', venue: 'Stadio Diego Armando Maradona', clubColors: 'Sky Blue / White' },
  ];

  it('one ground per venue, shared by the clubs that list it; no venue, no ground', () => {
    const pool = stadiumPool(teams as never);
    expect(pool.map((x) => x.name)).toEqual(['Gewiss Stadium', 'Stadio Diego Armando Maradona', 'Stadio Giuseppe Meazza', 'Stadio Olimpico']);
    expect(pool.find((x) => x.name === 'Stadio Giuseppe Meazza')).toMatchObject({ clubs: [1, 2], codes: ['INT', 'MIL'] });
    for (const x of pool) expect(x.colors).toHaveLength(x.clubs.length);
  });

  it('a ground always has the same twist, from the pool', () => {
    expect(twistOf('Anfield')).toBe(twistOf(' anfield '));
    for (const v of ['Anfield', 'Old Trafford', 'Camp Nou', 'Allianz Arena']) expect(TWIST_POOL).toContain(twistOf(v));
  });

  it('picks three grounds by seed, leaning to the decks’ clubs, without repeating a twist when it can', () => {
    const pool = stadiumPool(teams as never);
    const deck = Array.from({ length: 12 }, (_, i) => fw(i, { team: 3 }));
    const a = pickStadiums(pool, [deck, deck], 42);
    expect(pickStadiums(pool, [deck, deck], 42)).toEqual(a);
    expect(new Set(a.map((x) => x.name)).size).toBe(3);
    let olimpico = 0;
    for (let seed = 0; seed < 100; seed++) if (pickStadiums(pool, [deck, deck], seed).some((x) => x.name === 'Stadio Olimpico')) olimpico++;
    expect(olimpico).toBeGreaterThan(90);
    const twists = (p: Stadium[]) => new Set(p.map((x) => x.twist)).size;
    if (new Set(pool.map((x) => x.twist)).size >= 3) expect(twists(a)).toBe(3);
  });

  it('plain stand-ins have no home club', () => {
    expect(PLAIN_STADIUMS().every((x) => x.clubs.length === 0)).toBe(true);
  });
});

describe('turn flow', () => {
  it('deals 3, draws 1 a turn, and energy is the turn number', () => {
    let s = newGame({ you: filler(1), opponent: filler(100), seed: 3, twists: NEUTRAL });
    expect([s.hands.you.length, s.hands.opponent.length, s.decks.you.length]).toEqual([3, 3, 9]);
    expect(legalPlays(s, 'you').every((p) => p.cost <= 1)).toBe(true);
    s = endTurn(s, { ai: false });
    expect([s.turn, s.hands.you.length, s.hands.opponent.length]).toEqual([2, 4, 4]);
    s = play(play(s, 'you', s.hands.you[0].id, 0), 'you', s.hands.you[1].id, 1);
    expect(legalPlays(s, 'you')).toEqual([]);
    expect(() => play(s, 'you', s.hands.you[0].id, 2)).toThrow('Not enough energy.');
  });

  it('rejects illegal plays and lets a queued play be taken back', () => {
    const s = setup([fw(1), card(2, { rarity: 'icon', rank: 1 })], [], { turn: 3 });
    expect(() => play(s, 'you', 99, 0)).toThrow('not in hand');
    expect(() => play(s, 'you', 1, 3 as Zone)).toThrow('No zone 3');
    expect(() => play(s, 'you', 2, 0)).toThrow('Not enough energy.');
    expect(() => play(s, 'opponent', 1, 0)).toThrow('not in hand');
    const q = play(s, 'you', 1, 0);
    expect(q.hands.you.map((c) => c.id)).toEqual([2]);
    expect(unplay(q, 'you', 1).hands.you.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(() => play({ ...s, over: true }, 'you', 1, 0)).toThrow('over');
  });

  it('holds at most 4 cards per side per zone, queued ones included', () => {
    let s = setup([df(1), df(2)]);
    for (let i = 0; i < 3; i++) put(s, 'you', 0, fw(10 + i));
    s = play(s, 'you', 1, 0);
    expect(() => play(s, 'you', 2, 0)).toThrow('Left wing is full.');
    expect(legalPlays(s, 'you').map((p) => p.zone)).toEqual([1, 2]);
    s.hands.opponent = [df(60)];
    expect(legalPlays(s, 'opponent').map((p) => p.zone)).toEqual([0, 1, 2]);
  });

  it('the side winning more zones reveals first', () => {
    const s = setup([fw(1)], [fw(50)]);
    put(s, 'opponent', 2, fw(51));
    expect(firstToReveal(s)).toBe('opponent');
    const t = turn(s, [['you', 1, 0], ['opponent', 50, 0]]);
    expect(t.log.indexOf('AI · P50 revealed at Left wing.')).toBeLessThan(t.log.indexOf('P1 revealed at Left wing.'));
  });

  it('on a level board a seeded coin toss decides, and both seats win it', () => {
    const level = (seed: number) => firstToReveal({ ...setup([]), seed, turn: 1 });
    expect(level(5)).toBe(level(5));
    const firsts = Array.from({ length: 200 }, (_, i) => level(i));
    const you = firsts.filter((x) => x === 'you').length;
    expect(you).toBeGreaterThan(70);
    expect(you).toBeLessThan(130);
  });

  it('never mutates its input', () => {
    const s = newGame({ you: filler(1), opponent: filler(100), seed: 5 });
    const before = JSON.stringify(s);
    const q = play(s, 'you', s.hands.you[0].id, 0);
    endTurn(q);
    snap(s, 'you');
    retreat(s, 'you');
    expect(JSON.stringify(s)).toBe(before);
    expect(q.pending.you.length).toBe(1);
  });
});

describe('prize', () => {
  it('a press doubles the prize next turn, once per side; full time doubles again', () => {
    let s = snap(newGame({ you: filler(1), opponent: filler(100), seed: 2 }), 'you');
    expect(s.prize).toBe(1);
    expect(() => snap(s, 'you')).toThrow('Already pressed');
    s = endTurn(s, { ai: false });
    expect(s.prize).toBe(2);
    s = endTurn(snap(s, 'opponent'), { ai: false });
    expect(s.prize).toBe(4);
    while (!s.over) s = endTurn(s, { ai: false });
    expect(result(s).prize).toBe(8);
  });

  it('a press on the final turn still counts before the final doubling', () => {
    let s = newGame({ you: filler(1), opponent: filler(100), seed: 2 });
    while (s.turn < 6) s = endTurn(s, { ai: false });
    s = endTurn(snap(snap(s, 'you'), 'opponent'), { ai: false });
    expect(s.prize).toBe(8);
  });

  it('retreating ends at the current prize, not ones still waiting to land', () => {
    let s = endTurn(snap(newGame({ you: filler(1), opponent: filler(100), seed: 2 }), 'you'), { ai: false });
    s = retreat(snap(s, 'opponent'), 'you');
    expect(result(s)).toMatchObject({ winner: 'opponent', prize: 2, final: true, retreated: 'you' });
    expect(() => play(s, 'you', s.hands.you[0].id, 0)).toThrow('over');
    expect(() => retreat(s, 'opponent')).toThrow('over');
    expect(endTurn(s)).toBe(s);
  });
});

describe('result', () => {
  it('2 of 3 zones wins; level on zones goes to total Power; then a draw', () => {
    const s = setup([]);
    s.over = true;
    put(s, 'you', 0, fw(1));
    put(s, 'you', 1, fw(2));
    put(s, 'opponent', 2, card(50, { rarity: 'icon', rank: 1 }));
    expect(result(s)).toMatchObject({ winner: 'you', zonesWon: { you: 2, opponent: 1 }, zones: ['you', 'you', 'opponent'] });
    const t = setup([]);
    put(t, 'you', 0, fw(1));
    put(t, 'opponent', 1, card(50, { rarity: 'rare', rank: 12 }));
    expect(result(t)).toMatchObject({ winner: 'opponent', zonesWon: { you: 1, opponent: 1 }, power: { you: 3, opponent: 5 } });
    const d = setup([]);
    put(d, 'you', 0, fw(1));
    put(d, 'opponent', 2, fw(50));
    expect(result(d).winner).toBe('draw');
    expect(result(setup([])).winner).toBe('draw');
  });
});

// ---------------------------------------------------------------- full games

const LINES: Line[] = ['GK', 'DF', 'MF', 'FW'];
const KEYS = ['top-scorer', 'clinical', 'one-of-a-kind', 'rare-passport', 'home-nation'];
/** A plausible deck: 1 icon, 2 elite, 3 rare, 6 commons, from four clubs, with real-shaped data. */
function deck(seed: number, base: number): PlayerCard[] {
  const r = rng(seed);
  const pickOne = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const tiers: [Rarity, number][] = [['icon', 1], ['elite', 2], ['rare', 3], ['common', 6]];
  const out: PlayerCard[] = [];
  for (const [rarity, n] of tiers) {
    for (let i = 0; i < n; i++) {
      const rank = rarity === 'icon' ? 1 + Math.floor(r() * 3) : rarity === 'elite' ? 4 + Math.floor(r() * 7) : rarity === 'rare' ? 11 + Math.floor(r() * 10) : null;
      const goals = rank ? Math.floor(r() * 20) : r() < 0.5 ? Math.floor(r() * 4) : undefined;
      out.push(card(base + out.length, {
        rarity, rank, line: pickOne(LINES), goals, assists: Math.floor(r() * 8), penalties: Math.floor(r() * 4),
        age: 17 + Math.floor(r() * 20), team: 1 + Math.floor(r() * 4), keys: r() < 0.4 ? [pickOne(KEYS)] : [],
      }));
    }
  }
  return out;
}
const GROUNDS = (seed: number) => {
  const t = TWIST_POOL.slice().sort((a, b) => hash(`${seed}${a}`) - hash(`${seed}${b}`));
  return [ground('North Stand', t[0], [1]), ground('Riverside', t[1], [2, 3]), ground('The Park', t[2], [4])];
};

type Bot = (s: GameState, who: Side, r: () => number) => GameState;
const randomBot: Bot = (s, who, r) => {
  for (;;) {
    const lp = legalPlays(s, who);
    if (!lp.length || r() < 0.15) return s;
    const p = lp[Math.floor(r() * lp.length)];
    s = play(s, who, p.cardId, p.zone);
  }
};
/** The AI driving a side by hand, checking every play it makes is legal when it's made. */
const aiBot: Bot = (s, who, r) => {
  const move = aiPlays(s, Math.floor(r() * 2 ** 32), who);
  if (move.retreat) return retreat(s, who);
  if (move.snap) s = snap(s, who);
  for (const p of move.plays) {
    expect(legalPlays(s, who)).toContainEqual(expect.objectContaining(p));
    s = play(s, who, p.cardId, p.zone);
  }
  return s;
};
/** One game: `you` is the bot, the opponent is endTurn's built-in AI. */
function game(seed: number, bot: Bot): GameState {
  let s = newGame({ you: deck(seed, 1000), opponent: deck(hash(`${seed}:opp`), 2000), seed, stadiums: GROUNDS(seed) });
  const r = rng(seed);
  while (!s.over) {
    s = bot(s, 'you', r);
    if (!s.over) s = endTurn(s);
  }
  return s;
}

describe('full games', () => {
  it('a seed always plays out the same game, ending in a valid result', () => {
    for (const seed of [1, 42, 2026]) {
      const a = game(seed, randomBot);
      const b = game(seed, randomBot);
      expect(b.log).toEqual(a.log);
      expect(result(b)).toEqual(result(a));
      const r = result(a);
      expect(r.final).toBe(true);
      expect(['you', 'opponent', 'draw']).toContain(r.winner);
      expect([1, 2, 4, 8]).toContain(r.prize);
      expect(r.zonesWon.you + r.zonesWon.opponent).toBeLessThanOrEqual(3);
      expect(a.log.at(-1)).toMatch(/^(Full time|.* retreated)/);
    }
  });

  it('the AI never makes an illegal play over 150 games, on either side', () => {
    for (let seed = 0; seed < 150; seed++) {
      const s = game(seed, aiBot);
      expect(s.over).toBe(true);
      s.zones.forEach((z, i) => expect(Math.max(z.you.length, z.opponent.length)).toBeLessThanOrEqual(s.stadiums[i].twist === 'tight' ? 3 : 4));
    }
  });

  it('the AI beats a random-play bot most of the time', () => {
    let ai = 0;
    let bot = 0;
    for (let seed = 0; seed < 150; seed++) {
      const w = result(game(seed, randomBot)).winner;
      if (w === 'opponent') ai++;
      else if (w === 'you') bot++;
    }
    expect(ai).toBeGreaterThan(105);
    expect(ai).toBeGreaterThan(bot * 3);
  });
});

describe('AI', () => {
  it('presses on a comfortable late lead, retreats from a rout once the prize is up, and does neither early', () => {
    const s = setup([], [], { turn: 5 });
    put(s, 'opponent', 0, card(60, { rarity: 'icon', rank: 1 }));
    put(s, 'opponent', 1, card(61, { rarity: 'icon', rank: 1 }));
    expect(aiPlays({ ...s, turn: 6 }, 1, 'opponent').snap).toBe(true);
    expect(aiPlays(s, 1, 'opponent').snap).toBe(false);
    expect(aiPlays({ ...s, turn: 2 }, 1, 'opponent').snap).toBe(false);
    expect(aiPlays(s, 1, 'you').retreat).toBe(false);
    const high = { ...s, prize: 2 };
    expect(aiPlays(high, 1, 'you')).toMatchObject({ retreat: true, plays: [] });
    expect(aiPlays({ ...high, turn: 4 }, 1, 'you').retreat).toBe(false);
  });

  it('spends its energy and prefers open or narrowly lost zones', () => {
    const s = setup([], [fw(50), fw(51), df(52)], { turn: 5 });
    put(s, 'you', 0, card(1, { rarity: 'icon', rank: 1 }));
    put(s, 'you', 1, fw(2));
    const move = aiPlays(s, 3, 'opponent');
    const cost = move.plays.reduce((t, p) => t + cardStats(s.hands.opponent.find((c) => c.id === p.cardId)!).cost, 0);
    expect(cost).toBe(5);
    expect(move.plays.every((p) => p.zone !== 0)).toBe(true);
  });

  it('sends a home card to its own ground', () => {
    const s = setup([], [fw(50, { team: 7 })], { turn: 2, stadiums: [ground('A', 'neutral', [3]), ground('B', 'neutral', [7]), ground('C', 'neutral', [5])] });
    expect(aiPlays(s, 1, 'opponent').plays).toEqual([{ cardId: 50, zone: 1 }]);
  });

  it("doesn't see the other side's queue", () => {
    const s = setup([fw(1)], [fw(50)], { turn: 2 });
    const q = play(s, 'you', 1, 0);
    expect(aiPlays(q, 9, 'opponent')).toEqual(aiPlays(s, 9, 'opponent'));
  });
});

describe('turn steps', () => {
  it('resolveTurn shows the queue, then one landing per card in reveal order, and ends where endTurn does', () => {
    let s = setup([fw(1), fw(2)], [fw(50)], { turn: 5, parts: { 2: [P('grow', 1)] } });
    put(s, 'opponent', 0, df(60)); // the AI leads a zone, so it reveals first
    s = play(play(play(s, 'you', 1, 0), 'you', 2, 1), 'opponent', 50, 2);
    const r = resolveTurn(s, { ai: false });
    expect(r.final).toEqual(endTurn(s, { ai: false }));
    expect(r.steps.map((x) => x.kind)).toEqual(['queued', 'reveal', 'reveal', 'reveal', 'grow']);
    expect(r.steps.filter((x) => x.card).map((x) => [x.card!.side, x.card!.id])).toEqual([['opponent', 50], ['you', 1], ['you', 2]]);
    expect(r.steps[2].state.zones[0].you.map((c) => c.card.id)).toEqual([1]);
    expect(r.steps[2].state.pending.you.map((p) => p.card.id)).toEqual([2]);
  });

  it("the queued step carries the AI's plays, and an AI retreat has no steps", () => {
    const s = newGame({ you: filler(900), opponent: filler(950), seed: 4, shuffle: false, twists: NEUTRAL });
    const r = resolveTurn(s);
    expect(r.steps[0].kind).toBe('queued');
    expect(r.steps[0].state.pending.opponent.length).toBeGreaterThan(0);
    const rout = setup([], [], { turn: 5 });
    put(rout, 'you', 0, card(60, { rarity: 'icon', rank: 1 }));
    put(rout, 'you', 1, card(61, { rarity: 'icon', rank: 1 }));
    const gone = resolveTurn({ ...rout, prize: 2 });
    expect(gone.steps).toEqual([]);
    expect(gone.final.retreated).toBe('opponent');
  });

  it('projectedPower adds queued cards with their twists and abilities, without touching the state', () => {
    let s = setup([fw(1), fw(2)], [], { twists: ['floodlights', 'neutral', 'neutral'], parts: { 2: [P('boostHere', 1)] } });
    put(s, 'you', 0, fw(3));
    expect(projectedPower(s, 0, 'you')).toBe(4);
    s = play(play(s, 'you', 1, 0), 'you', 2, 0);
    // 3 on the board (+1 lights), then P1 3+1, then the boost 3+1 giving +1 to both others
    expect(projectedPower(s, 0, 'you')).toBe(14);
    expect(zonePower(s, 0, 'you')).toBe(4);
    expect(s.pending.you).toHaveLength(2);
  });
});

describe('copy', () => {
  it('never uses betting words in the log', () => {
    for (const seed of [1, 7, 99]) {
      let s = newGame({ you: deck(seed, 1000), opponent: deck(hash(`${seed}:opp`), 2000), seed, stadiums: GROUNDS(seed) });
      s = snap(s, 'you');
      while (!s.over) s = endTurn(s);
      expect(s.log.join(' ')).not.toMatch(/\b(odds|bet|wager|stakes?|payout)\b/i);
    }
  });
});
