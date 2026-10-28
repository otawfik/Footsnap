import { describe, expect, it } from 'vitest';
import type { PlayerCard, Rarity } from '../lib/cards';
import type { Line } from '../lib/football';
import {
  aiPlays, cardPower, cardStats, ConditionId, CONDITIONS, endTurn, GameState, legalPlays, newGame, Placed, play,
  projectedPower, resolveTurn, result, retreat, Side, snap, unplay, Zone, zoneCondition, zonePower,
} from '../lib/game';
import { hash, rng } from '../lib/rng';

interface CardOpts { rarity?: Rarity; rank?: number | null; line?: Line | null; goals?: number; title?: string }
const card = (id: number, o: CardOpts = {}): PlayerCard => ({
  id, name: `P${id}`, banner: `P${id}`, line: o.line === undefined ? 'FW' : o.line, position: 'Forward', age: 25, dateOfBirth: null, nationality: 'X',
  team: { id: 1, name: 'T', shortName: 'T', colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } },
  rarity: o.rarity ?? 'common', rank: o.rank ?? null,
  stats: o.goals === undefined ? null : { goals: o.goals, assists: 0, penalties: 0, played: 10 },
  power: null, abilities: o.title ? [{ kind: 'trait', title: o.title, text: '' }] : [],
});
/** a common forward with an ability: cost 2, Power 3 */
const fw = (id: number, title?: string) => card(id, { title });
const filler = (base: number) => Array.from({ length: 12 }, (_, i) => card(base + i, { line: 'DF' }));
const NEUTRAL: ConditionId[] = ['neutral', 'neutral', 'neutral'];

/** A game on a given turn with chosen hands; decks are vanilla 1-cost defenders. */
function setup(you: PlayerCard[], opp: PlayerCard[] = [], o: { turn?: number; conditions?: ConditionId[] } = {}): GameState {
  const s = newGame({ you: filler(900), opponent: filler(950), seed: 1, shuffle: false, conditions: o.conditions ?? NEUTRAL });
  s.hands.you = you;
  s.hands.opponent = opp;
  s.turn = o.turn ?? 6;
  return s;
}
/** Put a revealed card straight onto the board (test setup only). */
function put(s: GameState, side: Side, zone: Zone, c: PlayerCard, turn = 1): Placed {
  const p: Placed = { card: c, stats: cardStats(c), side, zone, turn, bonus: 0 };
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

  it("maps the first ability's title to a short Snap-style effect", () => {
    const kind = (title?: string) => cardStats(fw(1, title)).effect?.kind ?? null;
    expect(kind('Golden Boot leader')).toBe('talisman');
    expect(kind('Joint top scorer')).toBe('talisman');
    expect(kind('Rare passport')).toBe('scout');
    expect(['Last line', 'Goalkeeper', 'Defender'].map(kind)).toEqual(['marking', 'marking', 'marking']);
    expect([kind('Goal threat'), kind('Forward'), kind('Midfielder'), kind('Squad player'), kind()]).toEqual([null, null, null, null, null]);
    const c = card(1, { title: 'Clinical' });
    c.abilities.push({ kind: 'trait', title: 'Wonderkid', text: '' });
    expect(cardStats(c).effect!.text).toMatch(/^On Reveal: /);
    expect(cardStats(fw(1, 'Wonderkid')).effect!.text).toMatch(/^End of turn: /);
    expect(cardStats(fw(1, 'Home-grown')).effect!.text).toMatch(/^Ongoing: /);
  });
});

describe('effects', () => {
  it('Golden Boot: +2 only while it is your highest-Power card here', () => {
    const s = setup([]);
    put(s, 'you', 0, fw(1, 'Golden Boot leader'));
    expect(powerOf(s, 'you', 1)).toBe(5);
    put(s, 'you', 0, fw(2)); // level Power still counts as highest
    expect(powerOf(s, 'you', 1)).toBe(5);
    put(s, 'you', 0, card(3, { rarity: 'rare', rank: 12 }));
    expect(powerOf(s, 'you', 1)).toBe(3);
  });

  it('Clinical: +3 alone, but not when another card is queued beside it', () => {
    let s = turn(setup([fw(1, 'Clinical')]), [['you', 1, 0]]);
    expect(powerOf(s, 'you', 1)).toBe(6);
    expect(s.log).toContain('P1 revealed in Left wing: +3 Power, alone here.');
    s = turn(setup([fw(1, 'Clinical'), fw(2)]), [['you', 1, 0], ['you', 2, 0]]);
    expect(powerOf(s, 'you', 1)).toBe(3);
  });

  it('Spot-kick specialist: +2 when the opponent has more cards here', () => {
    const s0 = setup([fw(1, 'Spot-kick specialist')]);
    put(s0, 'opponent', 0, fw(50));
    put(s0, 'opponent', 0, fw(51));
    expect(powerOf(turn(s0, [['you', 1, 0]]), 'you', 1)).toBe(5);
    const s1 = setup([fw(1, 'Spot-kick specialist')]);
    put(s1, 'opponent', 0, fw(50));
    expect(powerOf(turn(s1, [['you', 1, 0]]), 'you', 1)).toBe(3);
  });

  it('Playmaker: +1 to your other revealed cards here, so queue order matters', () => {
    let s = turn(setup([fw(1), fw(2, 'Playmaker'), fw(3)], [], { turn: 6 }), [['you', 1, 0], ['you', 2, 0], ['you', 3, 0]]);
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2), powerOf(s, 'you', 3)]).toEqual([4, 3, 3]);
    expect(s.log).toContain('P2 revealed in Left wing: +1 to your other cards here.');
    s = setup([]);
    put(s, 'opponent', 0, fw(50)); // enemy cards don't get it
    s.hands.you = [fw(2, 'Playmaker')];
    s = turn(s, [['you', 2, 0]]);
    expect(powerOf(s, 'opponent', 50)).toBe(3);
  });

  it('Open-play finisher: +1 for each other card you have here', () => {
    const s = setup([]);
    put(s, 'you', 1, fw(1, 'Open-play finisher'));
    put(s, 'opponent', 1, fw(50));
    expect(powerOf(s, 'you', 1)).toBe(3);
    put(s, 'you', 1, fw(2));
    put(s, 'you', 1, fw(3));
    expect(powerOf(s, 'you', 1)).toBe(5);
  });

  it('Wonderkid grows by 1 at the end of every turn it is on the board', () => {
    let s = turn(setup([fw(1, 'Wonderkid')], [], { turn: 2 }), [['you', 1, 2]]);
    expect(powerOf(s, 'you', 1)).toBe(4);
    s = endTurn(s, { ai: false });
    s = endTurn(s, { ai: false });
    expect(powerOf(s, 'you', 1)).toBe(6);
    expect(s.log).toContain('P1 grew to 6 Power.');
  });

  it('Veteran: +3 only if played on turn 5 or 6', () => {
    const s = setup([]);
    put(s, 'you', 0, fw(1, 'Veteran'), 4);
    put(s, 'you', 1, fw(2, 'Veteran'), 5);
    put(s, 'you', 2, fw(3, 'Veteran'), 6);
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2), powerOf(s, 'you', 3)]).toEqual([3, 6, 6]);
  });

  it('One of a kind / Rare passport draw a card, and an empty deck is harmless', () => {
    let s = setup([fw(1, 'One of a kind'), fw(2, 'Rare passport')]);
    const deck = s.decks.you.length;
    s = turn(s, [['you', 1, 0]]);
    expect(s.hands.you.length).toBe(2);
    expect(s.decks.you.length).toBe(deck - 1);
    s = setup([fw(2, 'Rare passport')]);
    s.decks.you = [];
    s = turn(s, [['you', 2, 0]]);
    expect(s.log).toContain('P2 revealed in Left wing: deck is empty.');
  });

  it('Home-grown: +2 in the Centre only', () => {
    const s = setup([]);
    put(s, 'you', 0, fw(1, 'Home-grown'));
    put(s, 'you', 1, fw(2, 'Home-grown'));
    expect([powerOf(s, 'you', 1), powerOf(s, 'you', 2)]).toEqual([3, 5]);
  });

  it("Keepers and defenders: enemy cards here −1, and it doesn't stack", () => {
    const s = setup([]);
    put(s, 'you', 0, card(1, { line: 'GK', title: 'Last line' }));
    put(s, 'opponent', 0, fw(50));
    put(s, 'opponent', 1, fw(51));
    expect([powerOf(s, 'opponent', 50), powerOf(s, 'opponent', 51)]).toEqual([2, 3]);
    put(s, 'you', 0, card(2, { line: 'DF', title: 'Defender' }));
    put(s, 'you', 0, card(3, { line: 'GK', title: 'Goalkeeper' }));
    put(s, 'you', 0, card(4, { line: 'GK', title: 'Goalkeeper' }));
    // four markers still take only 1 off (stacking made a wall of commons the dominant play)
    expect(powerOf(s, 'opponent', 50)).toBe(2);
    expect(powerOf(s, 'you', 1)).toBe(2); // doesn't hit its own side
  });
});

describe('zone conditions', () => {
  it('are drawn from the seed, all different, and reveal on turns 1, 2, 3', () => {
    const g = (seed: number) => newGame({ you: filler(1), opponent: filler(100), seed });
    expect(g(7).conditions).toEqual(g(7).conditions);
    for (let seed = 0; seed < 50; seed++) expect(new Set(g(seed).conditions).size).toBe(3);
    let s = newGame({ you: filler(1), opponent: filler(100), seed: 1, conditions: ['floodlights', 'wet', 'derby'] });
    expect([0, 1, 2].map((z) => zoneCondition(s, z as Zone))).toEqual(['floodlights', null, null]);
    s = endTurn(endTurn(s, { ai: false }), { ai: false });
    expect([0, 1, 2].map((z) => zoneCondition(s, z as Zone))).toEqual(['floodlights', 'wet', 'derby']);
    expect(s.log).toContain('Right wing revealed: Derby. The first card each side plays here gets +2 Power.');
  });

  it('Floodlights +1, Derby +2 to each side’s first card, Wet pitch costs 1 more', () => {
    const s = setup([fw(1)], [], { conditions: ['floodlights', 'derby', 'wet'] });
    put(s, 'you', 0, fw(10));
    put(s, 'you', 1, fw(11));
    put(s, 'you', 1, fw(12));
    put(s, 'opponent', 1, fw(50));
    expect(powerOf(s, 'you', 10)).toBe(4);
    expect([powerOf(s, 'you', 11), powerOf(s, 'you', 12), powerOf(s, 'opponent', 50)]).toEqual([5, 3, 5]);
    expect(legalPlays(s, 'you').map((p) => [p.zone, p.cost])).toEqual([[0, 2], [1, 2], [2, 3]]);
    s.turn = 2; // the Right wing's Wet pitch hasn't revealed yet, so it does nothing
    expect(legalPlays(s, 'you').map((p) => p.cost)).toEqual([2, 2, 2]);
  });

  it('Empty stands: no On Reveal and no Ongoing effects there', () => {
    const empty: ConditionId[] = ['empty', 'neutral', 'neutral'];
    const s = turn(setup([fw(1, 'Clinical')], [], { conditions: empty }), [['you', 1, 0]]);
    expect(powerOf(s, 'you', 1)).toBe(3);
    expect(s.log).toContain('P1 revealed in Left wing.');
    const t = setup([], [], { conditions: empty });
    put(t, 'you', 0, fw(2, 'Open-play finisher'));
    put(t, 'you', 0, fw(3));
    put(t, 'opponent', 0, card(50, { line: 'GK', title: 'Last line' }));
    expect([powerOf(t, 'you', 2), powerOf(t, 'you', 3)]).toEqual([3, 3]);
  });

  it('Counter-attack: from turn 5 a side 4 or more behind gets +3, and close zones are left alone', () => {
    const s = setup([], [], { conditions: ['counter', 'neutral', 'neutral'], turn: 4 });
    put(s, 'you', 0, card(1, { rarity: 'rare', rank: 12 }));
    put(s, 'opponent', 0, fw(50));
    s.turn = 5;
    // 5 vs 3: only 2 behind, no help (it used to flip close zones)
    expect([zonePower(s, 0, 'you'), zonePower(s, 0, 'opponent')]).toEqual([5, 3]);
    put(s, 'you', 0, card(2, { rarity: 'rare', rank: 13 }));
    // 10 vs 3: 7 behind, +3
    expect([zonePower(s, 0, 'you'), zonePower(s, 0, 'opponent')]).toEqual([10, 6]);
    s.turn = 4;
    expect(zonePower(s, 0, 'opponent')).toBe(3);
  });
});

describe('turn flow', () => {
  it('deals 3, draws 1 a turn, and energy is the turn number', () => {
    let s = newGame({ you: filler(1), opponent: filler(100), seed: 3, conditions: NEUTRAL });
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
    const done = { ...s, over: true };
    expect(() => play(done, 'you', 1, 0)).toThrow('over');
  });

  it('holds at most 4 cards per side per zone, queued ones included', () => {
    let s = setup([card(1, { line: 'DF' }), card(2, { line: 'DF' })]);
    for (let i = 0; i < 3; i++) put(s, 'you', 0, fw(10 + i));
    s = play(s, 'you', 1, 0);
    expect(() => play(s, 'you', 2, 0)).toThrow('Left wing is full.');
    expect(legalPlays(s, 'you').map((p) => p.zone)).toEqual([1, 2]);
    s.hands.opponent = [card(60, { line: 'DF' })]; // your cards don't fill the other side's slots
    expect(legalPlays(s, 'opponent').map((p) => p.zone)).toEqual([0, 1, 2]);
  });

  it('reveals the side winning more zones first; level means you first', () => {
    let s = setup([fw(1)], [fw(50)]);
    put(s, 'opponent', 2, fw(51));
    s = turn(s, [['you', 1, 0], ['opponent', 50, 0]]);
    const at = (line: string) => s.log.indexOf(line);
    expect(at("Opponent's P50 revealed in Left wing.")).toBeLessThan(at('P1 revealed in Left wing.'));
    s = turn(setup([fw(1)], [fw(50)]), [['opponent', 50, 0], ['you', 1, 0]]);
    expect(at('P1 revealed in Left wing.')).toBeLessThan(at("Opponent's P50 revealed in Left wing."));
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
  it('a snap doubles the prize next turn, once per side; full time doubles again', () => {
    let s = snap(newGame({ you: filler(1), opponent: filler(100), seed: 2 }), 'you');
    expect(s.prize).toBe(1);
    expect(() => snap(s, 'you')).toThrow('Already pressed');
    s = endTurn(s, { ai: false });
    expect(s.prize).toBe(2);
    s = snap(s, 'opponent');
    s = endTurn(s, { ai: false });
    expect(s.prize).toBe(4);
    while (!s.over) s = endTurn(s, { ai: false });
    expect(result(s).prize).toBe(8);
  });

  it('a snap on the final turn still counts before the final doubling', () => {
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

const TITLES = [
  'Golden Boot leader', 'Joint top scorer', 'Clinical', 'Spot-kick specialist', 'Playmaker', 'Open-play finisher', 'Goal threat',
  'One of a kind', 'Wonderkid', 'Veteran', 'Rare passport', 'Home-grown', 'Last line', 'Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Squad player',
];
const LINES: Line[] = ['GK', 'DF', 'MF', 'FW'];
/** A plausible deck: 1 icon, 2 elite, 3 rare, 6 commons, random lines and abilities. */
function deck(seed: number, base: number): PlayerCard[] {
  const r = rng(seed);
  const pickOne = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const tiers: [Rarity, number][] = [['icon', 1], ['elite', 2], ['rare', 3], ['common', 6]];
  const out: PlayerCard[] = [];
  for (const [rarity, n] of tiers) {
    for (let i = 0; i < n; i++) {
      const rank = rarity === 'icon' ? 1 + Math.floor(r() * 3) : rarity === 'elite' ? 4 + Math.floor(r() * 7) : rarity === 'rare' ? 11 + Math.floor(r() * 10) : null;
      const goals = rank ? Math.floor(r() * 20) : r() < 0.5 ? Math.floor(r() * 4) : undefined;
      out.push(card(base + out.length, { rarity, rank, line: pickOne(LINES), goals, title: pickOne(TITLES) }));
    }
  }
  return out;
}

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
  let s = newGame({ you: deck(seed, 1000), opponent: deck(hash(`${seed}:opp`), 2000), seed });
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

  it('the AI never makes an illegal play over 200 games, on either side', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = game(seed, aiBot); // play() throws on anything illegal, from aiBot or from endTurn's AI
      expect(s.over).toBe(true);
      for (const z of s.zones) expect(Math.max(z.you.length, z.opponent.length)).toBeLessThanOrEqual(4);
    }
  });

  it('the AI beats a random-play bot most of the time', () => {
    let ai = 0;
    let bot = 0;
    for (let seed = 0; seed < 200; seed++) {
      const w = result(game(seed, randomBot)).winner;
      if (w === 'opponent') ai++;
      else if (w === 'you') bot++;
    }
    expect(ai).toBeGreaterThan(140);
    expect(ai).toBeGreaterThan(bot * 3);
  });
});

describe('AI prize', () => {
  it('snaps on a comfortable late lead, retreats from a rout once the prize is up, and does neither early', () => {
    const s = setup([], [], { turn: 5 });
    put(s, 'opponent', 0, card(60, { rarity: 'icon', rank: 1 }));
    put(s, 'opponent', 1, card(61, { rarity: 'icon', rank: 1 }));
    // 10-0, 10-0, 0-0: the other side needs ~12 Power across two zones to turn it round
    expect(aiPlays({ ...s, turn: 6 }, 1, 'opponent').snap).toBe(true); // 6 energy left for them: safe
    expect(aiPlays(s, 1, 'opponent').snap).toBe(false); // 11 energy left on turn 5: still catchable
    expect(aiPlays({ ...s, turn: 2 }, 1, 'opponent').snap).toBe(false);
    expect(aiPlays(s, 1, 'you').retreat).toBe(false); // prize still ×1
    const high = { ...s, prize: 2 };
    expect(aiPlays(high, 1, 'you')).toMatchObject({ retreat: true, plays: [] });
    expect(aiPlays({ ...high, turn: 4 }, 1, 'you').retreat).toBe(false);
  });

  it('spends its energy and prefers open or narrowly lost zones', () => {
    const s = setup([], [fw(50), fw(51), card(52, { line: 'DF' })], { turn: 5 });
    put(s, 'you', 0, card(1, { rarity: 'icon', rank: 1 })); // Left wing is gone
    put(s, 'you', 1, fw(2)); // Centre is close
    const move = aiPlays(s, 3, 'opponent');
    const cost = move.plays.reduce((t, p) => t + cardStats(s.hands.opponent.find((c) => c.id === p.cardId)!).cost, 0);
    expect(cost).toBe(5);
    expect(move.plays.every((p) => p.zone !== 0)).toBe(true);
  });
});

describe('turn steps', () => {
  it('resolveTurn shows the queue, then one landing per card in reveal order, and ends where endTurn does', () => {
    let s = setup([fw(1), fw(2, 'Wonderkid')], [fw(50)], { turn: 6 });
    s = play(play(play(s, 'you', 1, 0), 'you', 2, 1), 'opponent', 50, 2);
    const r = resolveTurn(s, { ai: false });
    expect(r.final).toEqual(endTurn(s, { ai: false }));
    expect(r.steps.map((x) => x.kind)).toEqual(['queued', 'reveal', 'reveal', 'reveal', 'grow']);
    expect(r.steps.filter((x) => x.card).map((x) => [x.card!.side, x.card!.id])).toEqual([['you', 1], ['you', 2], ['opponent', 50]]);
    // each landing is on the board in its own step and still queued in the one before
    const second = r.steps[2];
    expect(second.state.zones[1].you.map((c) => c.card.id)).toEqual([2]);
    expect(r.steps[1].state.pending.you.map((p) => p.card.id)).toEqual([2]);
    expect(zonePower(r.steps[3].state, 2, 'opponent')).toBe(3);
  });

  it("the queued step carries the AI's plays, and an AI retreat has no steps", () => {
    const s = newGame({ you: filler(900), opponent: filler(950), seed: 4, shuffle: false, conditions: NEUTRAL });
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

  it('projectedPower adds queued cards with their conditions and effects, without touching the state', () => {
    let s = setup([fw(1), fw(2, 'Playmaker')], [], { conditions: ['floodlights', 'neutral', 'neutral'] });
    put(s, 'you', 0, fw(3));
    expect(projectedPower(s, 0, 'you')).toBe(4);
    s = play(play(s, 'you', 1, 0), 'you', 2, 0);
    // 3 on the board (+1 lights), then P1 3+1, then the Playmaker 3+1 giving +1 to both others
    expect(projectedPower(s, 0, 'you')).toBe(14);
    expect(zonePower(s, 0, 'you')).toBe(4);
    expect(s.pending.you).toHaveLength(2);
  });

  it('every condition has a plate-length summary', () => {
    for (const c of Object.values(CONDITIONS)) expect(c.short.length).toBeLessThanOrEqual(30);
  });
});

describe('copy', () => {
  it('never uses betting words in the log', () => {
    for (const seed of [1, 7, 99]) {
      let s = newGame({ you: deck(seed, 1000), opponent: deck(hash(`${seed}:opp`), 2000), seed });
      s = snap(s, 'you');
      while (!s.over) s = endTurn(s);
      expect(s.log.join(' ')).not.toMatch(/\b(odds|bet|wager|stakes?|payout)\b/i);
    }
  });
});
