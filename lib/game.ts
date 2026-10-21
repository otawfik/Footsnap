/**
 * Duel: a Marvel Snap-style card game played with FootSnap's player cards.
 * Pure and deterministic: no React Native, no clock, no Math.random. Every
 * exported function takes a state and returns a new one; inputs are never
 * mutated. Randomness comes only from the game's seed (lib/rng).
 *
 * CARDS (cardStats), derived only from the real card:
 *   cost    icon 6 · elite 5 if rank <= 6, else 4 · rare 3 ·
 *           common forwards/midfielders 2, defenders/keepers 1 (unknown line 2)
 *   power   by cost {1: 2, 2: 3, 3: 5, 4: 6, 5: 8, 6: 10}, plus floor(goals / 4) up
 *           to +3 for players with season stats (capped so Power per energy stays
 *           in line as goals pile up through a season)
 *   effect  from the card's FIRST ability title:
 *     Golden Boot leader, Joint top scorer  Ongoing: +2 Power if this is your highest-Power card here
 *     Clinical                              On Reveal: if this is your only card here, +3 Power
 *     Spot-kick specialist                  On Reveal: +2 Power if the opponent has more cards here
 *     Playmaker                             On Reveal: +1 Power to your other cards here
 *     Open-play finisher                    Ongoing: +1 Power for each other card you have here
 *     Wonderkid                             End of turn: +1 Power (grows every turn it's on the board)
 *     Veteran                               Ongoing: +3 Power if played on turn 5 or 6
 *     One of a kind, Rare passport          On Reveal: draw a card
 *     Home nation                           Ongoing: +2 Power in the Centre (the home zone)
 *     Last line, Goalkeeper, Defender       Ongoing: enemy cards here have −1 Power
 *     anything else (Goal threat, Midfielder, Forward, Squad player, none)  vanilla
 *   Defender takes the −1 option rather than "locks the zone": commons cost 1, so
 *   a lock would let three Defenders shut the other side out of the board by turn 3.
 *
 * BOARD: three zones (0 Left wing, 1 Centre, 2 Right wing), at most 4 cards per
 *   side per zone. Each zone draws a different condition from CONDITIONS with
 *   the seed; zone i's condition reveals at the start of turn i + 1 and does
 *   nothing before that.
 *
 * FLOW: 6 turns, energy = turn number. 12-card decks are shuffled, each side
 *   draws 3, then 1 more at the start of turns 2-6 (no hand limit; an empty deck
 *   just stops drawing). During a turn each side queues plays (hand → zone)
 *   within its energy. endTurn reveals them: the side winning more zones right
 *   now reveals all its cards first (tie: you first), each side in the order it
 *   queued them. On Reveal effects resolve as each card lands; then end-of-turn
 *   effects. Card Power never drops below 0.
 *   "Cards here" in an effect counts revealed cards plus cards still waiting to
 *   reveal this turn, so queueing two cards together can't fake "only card here".
 *   On Reveal buffs only reach cards already revealed, so queue order matters.
 *
 * WINNING: after turn 6 a side wins a zone with more Power there. More zones won
 *   wins (2 of 3, or 1 against 0 with two ties); level on zones → more total
 *   Power across all zones; still level → draw.
 *
 * STAKES: start at 1. Each side may snap once, during a turn: stakes double when
 *   that turn ends (so a turn-6 snap still counts). Stakes double again,
 *   automatically, after the final turn. Retreating ends the game at once and
 *   costs the CURRENT stakes, not doubles still waiting to land.
 */
import type { PlayerCard } from './cards';
import { hash, rng } from './rng';

export type Side = 'you' | 'opponent';
export type Zone = 0 | 1 | 2;

export const ZONES: Zone[] = [0, 1, 2];
export const ZONE_NAME: Record<Zone, string> = { 0: 'Left wing', 1: 'Centre', 2: 'Right wing' };
export const TURNS = 6;
export const DECK_SIZE = 12;
export const START_HAND = 3;
export const MAX_PER_ZONE = 4;
/** the zone Home-grown cards count as home */
export const HOME_ZONE: Zone = 1;

export const other = (s: Side): Side => (s === 'you' ? 'opponent' : 'you');

// ---------------------------------------------------------------- card stats

export type EffectKind =
  | 'talisman' // top scorer
  | 'clinical'
  | 'penalty'
  | 'playmaker'
  | 'finisher'
  | 'wonderkid'
  | 'veteran'
  | 'scout' // draws a card
  | 'home'
  | 'marking'; // keepers and defenders

export interface Effect {
  kind: EffectKind;
  trigger: 'reveal' | 'ongoing' | 'end';
  text: string;
}

export interface CardStats {
  cost: number;
  power: number;
  effect: Effect | null;
}

const EFFECTS: Record<EffectKind, Effect> = {
  talisman: { kind: 'talisman', trigger: 'ongoing', text: 'Ongoing: +2 Power if this is your highest-Power card here.' },
  clinical: { kind: 'clinical', trigger: 'reveal', text: 'On Reveal: if this is your only card here, +3 Power.' },
  penalty: { kind: 'penalty', trigger: 'reveal', text: 'On Reveal: +2 Power if the opponent has more cards here.' },
  playmaker: { kind: 'playmaker', trigger: 'reveal', text: 'On Reveal: +1 Power to your other cards here.' },
  finisher: { kind: 'finisher', trigger: 'ongoing', text: 'Ongoing: +1 Power for each other card you have here.' },
  wonderkid: { kind: 'wonderkid', trigger: 'end', text: 'End of turn: +1 Power.' },
  veteran: { kind: 'veteran', trigger: 'ongoing', text: 'Ongoing: +3 Power if played on turn 5 or 6.' },
  scout: { kind: 'scout', trigger: 'reveal', text: 'On Reveal: draw a card.' },
  home: { kind: 'home', trigger: 'ongoing', text: 'Ongoing: +2 Power in the Centre.' },
  marking: { kind: 'marking', trigger: 'ongoing', text: "Ongoing: enemy cards here have −1 Power (doesn't stack)." },
};

// abilities carry a stable key (lib/cards.ts); titles are kept as a fallback for older saved cards
const EFFECT_BY_KEY: Record<string, EffectKind> = {
  'top-scorer': 'talisman',
  clinical: 'clinical',
  penalties: 'penalty',
  playmaker: 'playmaker',
  'open-play': 'finisher',
  wonderkid: 'wonderkid',
  veteran: 'veteran',
  'one-of-a-kind': 'scout',
  'rare-passport': 'scout',
  'home-nation': 'home',
  keeper: 'marking',
  'role-GK': 'marking',
  'role-DF': 'marking',
};
const EFFECT_BY_TITLE: Record<string, EffectKind> = {
  'Golden Boot leader': 'talisman',
  'Joint top scorer': 'talisman',
  Clinical: 'clinical',
  'Spot-kick specialist': 'penalty',
  Playmaker: 'playmaker',
  'Open-play finisher': 'finisher',
  Wonderkid: 'wonderkid',
  Veteran: 'veteran',
  'One of a kind': 'scout',
  'Rare passport': 'scout',
  'Home-grown': 'home',
  'Home nation': 'home',
  'Last line': 'marking',
  Goalkeeper: 'marking',
  Defender: 'marking',
};

const POWER_BY_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 8, 6: 10 };
export const MAX_POWER = 14;
export const GOAL_BONUS_CAP = 3;

export function cardStats(card: PlayerCard): CardStats {
  let cost: number;
  if (card.rarity === 'icon') cost = 6;
  else if (card.rarity === 'elite') cost = card.rank !== null && card.rank <= 6 ? 5 : 4;
  else if (card.rarity === 'rare') cost = 3;
  else cost = card.line === 'DF' || card.line === 'GK' ? 1 : 2;
  // goals add +1 per 4, at most +3, so a 20-goal striker in spring doesn't break the curve
  const power = Math.min(MAX_POWER, POWER_BY_COST[cost] + (card.stats ? Math.min(GOAL_BONUS_CAP, Math.floor(card.stats.goals / 4)) : 0));
  const first = card.abilities[0];
  const kind = first ? (first.key ? EFFECT_BY_KEY[first.key] : undefined) ?? EFFECT_BY_TITLE[first.title] : undefined;
  return { cost, power, effect: kind ? EFFECTS[kind] : null };
}

// ---------------------------------------------------------------- conditions

export type ConditionId = 'floodlights' | 'wet' | 'derby' | 'empty' | 'counter' | 'neutral';

export const CONDITIONS: Record<ConditionId, { name: string; text: string }> = {
  floodlights: { name: 'Floodlights', text: 'Cards here have +1 Power.' },
  wet: { name: 'Wet pitch', text: 'Cards here cost 1 more to play.' },
  derby: { name: 'Derby', text: 'The first card each side plays here gets +2 Power.' },
  empty: { name: 'Empty stands', text: 'No card effects work here.' },
  counter: { name: 'Counter-attack', text: 'From turn 5, a side 4 or more behind here gets +3 Power.' },
  neutral: { name: 'Neutral ground', text: 'Nothing special.' },
};
const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

/** The zone's condition once it has revealed (turn zone + 1), else null. */
export const zoneCondition = (s: GameState, zone: Zone): ConditionId | null => (s.turn >= zone + 1 ? s.conditions[zone] : null);

const effectsWork = (s: GameState, zone: Zone) => zoneCondition(s, zone) !== 'empty';

// ---------------------------------------------------------------- state

/** A revealed card on the board. */
export interface Placed {
  card: PlayerCard;
  stats: CardStats;
  side: Side;
  zone: Zone;
  /** the turn it was played */
  turn: number;
  /** permanent Power gained from On Reveal and end-of-turn effects */
  bonus: number;
}

/** A play queued this turn, waiting to reveal. */
export interface Pending {
  card: PlayerCard;
  zone: Zone;
  /** what it cost, Wet pitch included */
  cost: number;
}

export interface GameState {
  seed: number;
  /** 1-6; stays 6 once the game is over */
  turn: number;
  over: boolean;
  stakes: number;
  snapped: Record<Side, boolean>;
  /** snaps made this turn: they double the stakes when the turn ends */
  snapsThisTurn: Side[];
  retreated: Side | null;
  /** all three drawn up front; read them through zoneCondition() so unrevealed ones stay hidden */
  conditions: ConditionId[];
  decks: Record<Side, PlayerCard[]>;
  hands: Record<Side, PlayerCard[]>;
  pending: Record<Side, Pending[]>;
  /** per zone, each side's revealed cards in reveal order */
  zones: Record<Side, Placed[]>[];
  /** readable event log for the UI to animate, oldest first */
  log: string[];
}

export interface Play {
  cardId: number;
  zone: Zone;
}

const clone = (s: GameState): GameState => ({
  ...s,
  snapped: { ...s.snapped },
  snapsThisTurn: [...s.snapsThisTurn],
  conditions: [...s.conditions],
  decks: { you: [...s.decks.you], opponent: [...s.decks.opponent] },
  hands: { you: [...s.hands.you], opponent: [...s.hands.opponent] },
  pending: { you: s.pending.you.map((p) => ({ ...p })), opponent: s.pending.opponent.map((p) => ({ ...p })) },
  zones: s.zones.map((z) => ({ you: z.you.map((c) => ({ ...c })), opponent: z.opponent.map((c) => ({ ...c })) })),
  log: [...s.log],
});

function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const label = (side: Side, card: PlayerCard) => (side === 'you' ? card.banner : `Opponent's ${card.banner}`);
const their = (side: Side) => (side === 'you' ? 'your' : 'their');

function draw(s: GameState, side: Side): PlayerCard | null {
  const c = s.decks[side].shift() ?? null;
  if (c) s.hands[side].push(c);
  return c;
}

function logDraw(s: GameState, side: Side, c: PlayerCard | null) {
  if (!c) s.log.push(side === 'you' ? 'Your deck is empty.' : "Opponent's deck is empty.");
  else s.log.push(side === 'you' ? `You drew ${c.banner}.` : 'Opponent drew a card.');
}

function logCondition(s: GameState) {
  const z = (s.turn - 1) as Zone;
  if (z > 2) return;
  const c = CONDITIONS[s.conditions[z]];
  s.log.push(`${ZONE_NAME[z]} revealed: ${c.name}. ${c.text}`);
}

export interface NewGameOptions {
  you: PlayerCard[];
  opponent: PlayerCard[];
  seed: number;
  /** keep the decks in the order given (index 0 drawn first), for tutorials and tests */
  shuffle?: boolean;
  /** fix the three zone conditions instead of drawing them, for daily puzzles and tests */
  conditions?: ConditionId[];
}

export function newGame(o: NewGameOptions): GameState {
  if (o.you.length !== DECK_SIZE || o.opponent.length !== DECK_SIZE) throw new Error(`Each deck needs exactly ${DECK_SIZE} cards.`);
  const keep = o.shuffle === false;
  const conditions = o.conditions ?? shuffle(CONDITION_IDS, rng(hash(`${o.seed}:zones`))).slice(0, 3);
  if (conditions.length !== 3) throw new Error('Exactly three zone conditions.');
  const s: GameState = {
    seed: o.seed,
    turn: 1,
    over: false,
    stakes: 1,
    snapped: { you: false, opponent: false },
    snapsThisTurn: [],
    retreated: null,
    conditions: [...conditions],
    decks: {
      you: keep ? o.you.slice() : shuffle(o.you, rng(hash(`${o.seed}:you`))),
      opponent: keep ? o.opponent.slice() : shuffle(o.opponent, rng(hash(`${o.seed}:opponent`))),
    },
    hands: { you: [], opponent: [] },
    pending: { you: [], opponent: [] },
    zones: ZONES.map(() => ({ you: [], opponent: [] })),
    log: [],
  };
  for (let i = 0; i < START_HAND; i++) {
    draw(s, 'you');
    draw(s, 'opponent');
  }
  s.log.push('Turn 1.');
  logCondition(s);
  return s;
}

// ---------------------------------------------------------------- power

const pre = (c: Placed) => c.stats.power + c.bonus;

/** A revealed card's Power right now: base + bonuses + ongoing effects and conditions, floored at 0. */
export function cardPower(s: GameState, c: Placed): number {
  const own = s.zones[c.zone][c.side];
  const foe = s.zones[c.zone][other(c.side)];
  const cond = zoneCondition(s, c.zone);
  let p = pre(c);
  if (cond === 'floodlights') p += 1;
  if (cond === 'derby' && own[0] === c) p += 2;
  if (cond !== 'empty') {
    switch (c.stats.effect?.kind) {
      case 'talisman':
        if (own.every((o) => o === c || pre(o) <= pre(c))) p += 2;
        break;
      case 'finisher':
        p += own.length - 1;
        break;
      case 'veteran':
        if (c.turn >= 5) p += 3;
        break;
      case 'home':
        if (c.zone === HOME_ZONE) p += 2;
        break;
    }
    // marking doesn't stack: four defenders still only take 1 off each enemy card here
    if (foe.some((o) => o.stats.effect?.kind === 'marking')) p -= 1;
  }
  return Math.max(0, p);
}

const COUNTER_GAP = 4;
const rawPower = (s: GameState, zone: Zone, who: Side) => s.zones[zone][who].reduce((t, c) => t + cardPower(s, c), 0);

/** A side's total Power in a zone, Counter-attack included. */
export function zonePower(s: GameState, zone: Zone, who: Side): number {
  const mine = rawPower(s, zone, who);
  // only for a side well behind, so it narrows a rout without flipping a close zone
  if (zoneCondition(s, zone) === 'counter' && s.turn >= 5 && rawPower(s, zone, other(who)) - mine >= COUNTER_GAP) return mine + 3;
  return mine;
}

const zoneLeader = (s: GameState, z: Zone): Side | 'tie' => {
  const a = zonePower(s, z, 'you');
  const b = zonePower(s, z, 'opponent');
  return a > b ? 'you' : b > a ? 'opponent' : 'tie';
};

// ---------------------------------------------------------------- playing

/** Cards a side has in a zone: revealed plus still waiting to reveal this turn. */
const count = (s: GameState, zone: Zone, who: Side) => s.zones[zone][who].length + s.pending[who].filter((p) => p.zone === zone).length;

export const playCost = (s: GameState, card: PlayerCard, zone: Zone) => cardStats(card).cost + (zoneCondition(s, zone) === 'wet' ? 1 : 0);

/** Energy a side has left this turn after its queued plays. */
export const energyLeft = (s: GameState, who: Side) => s.turn - s.pending[who].reduce((t, p) => t + p.cost, 0);

/** Why a play is illegal, or null if it's fine. */
function illegal(s: GameState, who: Side, cardId: number, zone: number): string | null {
  if (s.over) return 'The game is over.';
  if (!ZONES.includes(zone as Zone)) return `No zone ${zone}.`;
  const card = s.hands[who].find((c) => c.id === cardId);
  if (!card) return `Card ${cardId} is not in hand.`;
  if (count(s, zone as Zone, who) >= MAX_PER_ZONE) return `${ZONE_NAME[zone as Zone]} is full.`;
  if (playCost(s, card, zone as Zone) > energyLeft(s, who)) return 'Not enough energy.';
  return null;
}

export interface LegalPlay extends Play {
  cost: number;
}

/** Every play the side could queue right now. */
export function legalPlays(s: GameState, who: Side): LegalPlay[] {
  const out: LegalPlay[] = [];
  const seen = new Set<number>();
  for (const card of s.hands[who]) {
    if (seen.has(card.id)) continue; // duplicates in hand are the same play
    seen.add(card.id);
    for (const zone of ZONES) if (!illegal(s, who, card.id, zone)) out.push({ cardId: card.id, zone, cost: playCost(s, card, zone) });
  }
  return out;
}

/** Queue a card from hand into a zone. Throws on an illegal play. */
export function play(state: GameState, who: Side, cardId: number, zone: Zone): GameState {
  const why = illegal(state, who, cardId, zone);
  if (why) throw new Error(why);
  const s = clone(state);
  const i = s.hands[who].findIndex((c) => c.id === cardId);
  const [card] = s.hands[who].splice(i, 1);
  s.pending[who].push({ card, zone, cost: playCost(s, card, zone) });
  return s;
}

/** Take back a queued play before the turn ends. */
export function unplay(state: GameState, who: Side, cardId: number): GameState {
  const i = state.pending[who].findIndex((p) => p.card.id === cardId);
  if (i < 0 || state.over) throw new Error(`Card ${cardId} is not queued.`);
  const s = clone(state);
  const [p] = s.pending[who].splice(i, 1);
  s.hands[who].push(p.card);
  return s;
}

// ---------------------------------------------------------------- stakes

export const canSnap = (s: GameState, who: Side) => !s.over && !s.snapped[who];

export function snap(state: GameState, who: Side): GameState {
  if (!canSnap(state, who)) throw new Error(state.over ? 'The game is over.' : 'Already pressed this game.');
  const s = clone(state);
  s.snapped[who] = true;
  s.snapsThisTurn.push(who);
  const next = s.stakes * 2 ** s.snapsThisTurn.length;
  s.log.push(`${who === 'you' ? 'You' : 'Opponent'} pressed: stakes go to ${next} when this turn ends.`);
  return s;
}

/** Concede now, losing the current stakes. */
export function retreat(state: GameState, who: Side): GameState {
  if (state.over) throw new Error('The game is over.');
  const s = clone(state);
  s.over = true;
  s.retreated = who;
  s.snapsThisTurn = [];
  s.log.push(`${who === 'you' ? 'You' : 'Opponent'} retreated, losing ${s.stakes}.`);
  return s;
}

// ---------------------------------------------------------------- turn

function reveal(s: GameState, side: Side, p: Pending) {
  const foe = other(side);
  const c: Placed = { card: p.card, stats: cardStats(p.card), side, zone: p.zone, turn: s.turn, bonus: 0 };
  s.zones[p.zone][side].push(c);
  let note = '';
  if (effectsWork(s, p.zone)) {
    switch (c.stats.effect?.kind) {
      case 'clinical':
        if (count(s, p.zone, side) === 1) {
          c.bonus += 3;
          note = '+3 Power, alone here';
        }
        break;
      case 'penalty':
        if (count(s, p.zone, foe) > count(s, p.zone, side)) {
          c.bonus += 2;
          note = '+2 Power, outnumbered here';
        }
        break;
      case 'playmaker': {
        const mates = s.zones[p.zone][side].filter((o) => o !== c);
        for (const o of mates) o.bonus += 1;
        if (mates.length) note = `+1 to ${their(side)} other cards here`;
        break;
      }
      case 'scout': {
        const d = draw(s, side);
        note = d ? (side === 'you' ? `drew ${d.banner}` : 'drew a card') : 'deck is empty';
        break;
      }
    }
  }
  s.log.push(`${label(side, c.card)} revealed in ${ZONE_NAME[p.zone]}${note ? `: ${note}` : ''}.`);
}

export interface EndTurnOptions {
  /** let aiPlays choose the opponent's plays, snap and retreat (default true); false uses the opponent's queued plays as they are */
  ai?: boolean;
}

/** Resolve the turn: AI moves, both sides reveal, effects resolve, stakes update, next turn starts (or the game ends). */
export function endTurn(state: GameState, opts: EndTurnOptions = {}): GameState {
  if (state.over) return state;
  let s = clone(state);

  if (opts.ai !== false) {
    const move = aiPlays(s, hash(`${s.seed}:ai:${s.turn}`), 'opponent');
    if (move.retreat) return retreat(s, 'opponent');
    if (move.snap && canSnap(s, 'opponent')) s = snap(s, 'opponent');
    for (const p of move.plays) s = play(s, 'opponent', p.cardId, p.zone);
  }

  // whoever is winning more zones reveals first; level → you first
  const won = (side: Side) => ZONES.filter((z) => zoneLeader(s, z) === side).length;
  const first: Side = won('opponent') > won('you') ? 'opponent' : 'you';
  for (const side of [first, other(first)]) {
    while (s.pending[side].length) reveal(s, side, s.pending[side].shift()!);
  }

  // end of turn: Wonderkids grow
  for (const z of ZONES) {
    if (!effectsWork(s, z)) continue;
    for (const side of [first, other(first)]) {
      for (const c of s.zones[z][side]) {
        if (c.stats.effect?.kind !== 'wonderkid') continue;
        c.bonus += 1;
        s.log.push(`${label(side, c.card)} grew to ${cardPower(s, c)} Power.`);
      }
    }
  }

  s.stakes *= 2 ** s.snapsThisTurn.length;
  s.snapsThisTurn = [];

  if (s.turn >= TURNS) {
    s.over = true;
    s.stakes *= 2;
    const r = result(s);
    const zones = ZONES.map((z) => `${ZONE_NAME[z]} ${zonePower(s, z, 'you')}-${zonePower(s, z, 'opponent')}`).join(', ');
    s.log.push(`Full time. ${zones}. ${r.winner === 'draw' ? 'Draw' : r.winner === 'you' ? 'You win' : 'Opponent wins'} (stakes ${s.stakes}).`);
    return s;
  }

  s.turn += 1;
  s.log.push(`Turn ${s.turn}.`);
  logCondition(s);
  logDraw(s, 'you', draw(s, 'you'));
  logDraw(s, 'opponent', draw(s, 'opponent'));
  return s;
}

// ---------------------------------------------------------------- result

export interface GameResult {
  winner: Side | 'draw';
  /** final stakes if the game is over (current stakes on a retreat); current stakes otherwise */
  stakes: number;
  zonesWon: Record<Side, number>;
  /** who leads each zone */
  zones: (Side | 'tie')[];
  power: Record<Side, number>;
  /** false while the game is still going: the result is then "if it ended now" */
  final: boolean;
  retreated: Side | null;
}

export function result(s: GameState): GameResult {
  const zones = ZONES.map((z) => zoneLeader(s, z));
  const zonesWon = { you: zones.filter((x) => x === 'you').length, opponent: zones.filter((x) => x === 'opponent').length };
  const total = (side: Side) => ZONES.reduce<number>((t, z) => t + zonePower(s, z, side), 0);
  const power = { you: total('you'), opponent: total('opponent') };
  let winner: Side | 'draw';
  if (s.retreated) winner = other(s.retreated);
  else if (zonesWon.you !== zonesWon.opponent) winner = zonesWon.you > zonesWon.opponent ? 'you' : 'opponent';
  else if (power.you !== power.opponent) winner = power.you > power.opponent ? 'you' : 'opponent';
  else winner = 'draw';
  return { winner, stakes: s.stakes, zonesWon, zones, power, final: s.over, retreated: s.retreated };
}

// ---------------------------------------------------------------- AI

export interface AiMove {
  plays: Play[];
  snap: boolean;
  retreat: boolean;
}

/** Rough worth of a card when choosing what to play, beyond its Power. */
function effectWorth(s: GameState, st: CardStats): number {
  switch (st.effect?.kind) {
    case 'wonderkid':
      return TURNS - s.turn + 1;
    case 'veteran':
      return s.turn >= 5 ? 3 : -2; // hold Veterans for the last two turns
    case 'scout':
      return s.turn < TURNS ? 2 : 0;
    case undefined:
      return 0;
    default:
      return 1;
  }
}

/** Estimated Power a card would add to a zone if it were played there now. */
function estimate(s: GameState, card: PlayerCard, zone: Zone, who: Side): number {
  const st = cardStats(card);
  const cond = zoneCondition(s, zone);
  const mine = count(s, zone, who);
  const foe = s.zones[zone][other(who)];
  let p = st.power;
  if (cond === 'floodlights') p += 1;
  if (cond === 'derby' && mine === 0) p += 2;
  if (cond === 'empty') return p;
  switch (st.effect?.kind) {
    case 'talisman':
      if (s.zones[zone][who].every((o) => pre(o) <= st.power)) p += 2;
      break;
    case 'clinical':
      if (mine === 0) p += 3;
      break;
    case 'penalty':
      if (foe.length > mine + 1) p += 2; // revealed cards only: the other side's queue is hidden
      break;
    case 'playmaker':
      p += s.zones[zone][who].length;
      break;
    case 'finisher':
      p += mine;
      break;
    case 'wonderkid':
      p += TURNS - s.turn + 1;
      break;
    case 'veteran':
      if (s.turn >= 5) p += 3;
      break;
    case 'home':
      if (zone === HOME_ZONE) p += 2;
      break;
    case 'marking':
      // only the first marker in a zone does anything (marking doesn't stack)
      if (!s.zones[zone][who].some((o) => o.stats.effect?.kind === 'marking')) p += foe.length;
      break;
  }
  if (foe.some((o) => o.stats.effect?.kind === 'marking')) p -= 1;
  return Math.max(0, p);
}

/** Power a side can expect to add per energy (the cost table gives 1.7-2; effects and wasted energy pull it down). */
const POWER_PER_ENERGY = 1.5;
/** snap when swinging two zones would take more than this share of the other side's remaining Power */
const SNAP_SAFETY = 1;
/** retreat when winning two zones would take this much more than the side's own remaining Power */
const RETREAT_SLACK = 2;

/** How much a zone lead is worth: steep near level, flat once it's won or lost. */
const worth = (lead: number) => Math.tanh(lead / 5);

/**
 * Greedy AI. Picks the set of cards that spends its energy best, then sends each
 * (strongest first) to the zone where it moves the lead most: level and narrowly
 * lost zones gain the most, zones already won or gone gain little. It reads only
 * the board and its own hand, never the other side's queued plays.
 * Stakes: it snaps on turn 4+ when turning two zones round would cost the other
 * side more Power than it can still add (about 1.5 per energy left in the game,
 * this turn included), and retreats on turn 5-6, once anyone has snapped, when
 * winning two zones would cost it more than it can still add plus a margin.
 */
export function aiPlays(state: GameState, seed: number, who: Side = 'opponent'): AiMove {
  if (state.over) return { plays: [], snap: false, retreat: false };
  const r = rng(seed);
  const foe = other(who);
  const budget = energyLeft(state, who);

  // the subset of hand with the most Power that fits the energy (before Wet pitch)
  const hand = state.hands[who].map((card) => ({ card, st: cardStats(card) }));
  let best: typeof hand = [];
  let bestScore = -Infinity;
  const n = Math.min(hand.length, 12);
  for (let mask = 0; mask < 1 << n; mask++) {
    let cost = 0;
    let value = 0;
    const pick: typeof hand = [];
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      cost += hand[i].st.cost;
      value += hand[i].st.power + effectWorth(state, hand[i].st);
      pick.push(hand[i]);
    }
    if (cost > budget) continue;
    const score = value * 10 + cost; // Power first, then energy used
    if (score > bestScore) {
      bestScore = score;
      best = pick;
    }
  }
  best.sort((a, b) => b.st.power - a.st.power || a.card.id - b.card.id);

  let s = state;
  const lead = ZONES.map((z) => zonePower(state, z, who) - zonePower(state, z, foe));
  const plays: Play[] = [];
  const place = (card: PlayerCard): boolean => {
    let choice: { zone: Zone; gain: number; est: number } | null = null;
    for (const lp of legalPlays(s, who)) {
      if (lp.cardId !== card.id) continue;
      const est = estimate(s, card, lp.zone, who);
      const gain = worth(lead[lp.zone] + est) - worth(lead[lp.zone]) + r() * 0.001;
      if (!choice || gain > choice.gain) choice = { zone: lp.zone, gain, est };
    }
    if (!choice) return false;
    s = play(s, who, card.id, choice.zone);
    lead[choice.zone] += choice.est;
    plays.push({ cardId: card.id, zone: choice.zone });
    return true;
  };
  for (const { card } of best) place(card);
  // energy left over (Wet pitch pushed something out, say): fill with whatever still fits
  for (;;) {
    const fits = s.hands[who].filter((c) => legalPlays(s, who).some((lp) => lp.cardId === c.id));
    if (!fits.length) break;
    fits.sort((a, b) => cardStats(b).power - cardStats(a).power || a.id - b.id);
    if (!place(fits[0])) break;
  }

  // stakes: compare what it would take to swing two zones with the Power the
  // side could still add (about POWER_PER_ENERGY for each energy left in the game)
  const powerLeft = (from: number) => POWER_PER_ENERGY * Array.from({ length: Math.max(0, TURNS - from + 1) }, (_, i) => from + i).reduce((t, e) => t + e, 0);
  const twoCheapest = (costs: number[]) => costs.sort((a, b) => a - b)[0] + costs[1];
  const toFlipForThem = twoCheapest(lead.map((l) => Math.max(0, l + 1))); // they play this turn too
  const toFlipForMe = twoCheapest(lead.map((l) => Math.max(0, 1 - l))); // this turn's plays are already in `lead`
  const stakesNow = state.stakes * 2 ** state.snapsThisTurn.length;
  const doSnap = state.turn >= 4 && canSnap(state, who) && toFlipForThem > SNAP_SAFETY * powerLeft(state.turn);
  const doRetreat = !doSnap && state.turn >= 5 && stakesNow >= 2 && toFlipForMe > powerLeft(state.turn + 1) + RETREAT_SLACK;
  return { plays: doRetreat ? [] : plays, snap: doSnap, retreat: doRetreat };
}
