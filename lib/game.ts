/**
 * Duel: a Marvel Snap-inspired card game played with FootSnap's player cards, at
 * three real stadiums. Pure and deterministic: no React Native, no clock, no
 * Math.random. Every exported function takes a state and returns a new one;
 * inputs are never mutated. Randomness comes only from the game's seed (lib/rng).
 *
 * CARDS (cardStats), derived only from the real card:
 *   cost    icon 6 · elite 5 if rank <= 6, else 4 · rare 3 ·
 *           common forwards/midfielders 2, defenders/keepers 1 (unknown line 2)
 *   power   by cost {1: 2, 2: 3, 3: 5, 4: 6, 5: 8, 6: 10}, plus floor(goals / 4) up
 *           to +3 for players with season stats
 *   ability lib/abilities.ts: a signature, a season role, a trait or a line variant,
 *           one or two parts, each with a trigger (Kick-off, While here, Every turn,
 *           Full time)
 *
 * STADIUMS (lib/stadiums.ts): the three zones are real grounds from the competition.
 *   HOME CROWD: a card of a club that plays there has +CROWD_BOOST Power there,
 *   always. TWIST: each ground's twist reveals at the start of turn zone + 1 and
 *   does nothing before that.
 *
 * FLOW: 6 turns, energy = turn number (+1 from a Fortress). 12-card decks are
 *   shuffled, each side draws 3, then 1 more at the start of turns 2-6. During a
 *   turn each side queues plays (hand → zone, at most 4 a side per zone, 3 on a
 *   Tight pitch) within its energy. resolveTurn reveals them: the side winning more
 *   zones reveals all its cards first (tie: you first), each side in the order it
 *   queued them. Kick-off parts resolve as each card lands; then Every turn parts.
 *   After turn 6, Full time parts resolve once. Card Power never drops below 0.
 *   "Cards here" counts revealed cards plus cards still waiting to reveal this turn.
 *
 * WINNING: after turn 6 a side wins a zone with more Power there. More zones won
 *   wins; level on zones → more total Power; still level → draw.
 *
 * PRIZE: ×1 to start. Each side may press once, during a turn: the prize doubles
 *   when that turn ends, and again after the final turn. Retreating ends the game
 *   at the current prize. A win pays CREDITS_PER_PRIZE per ×1; nothing is ever taken.
 *
 * REVEALS: resolveTurn() returns every intermediate state of a turn (the AI's cards
 *   queued, one state per card landing, end-of-turn growth, Full time) so the board
 *   can animate the engine's own order; endTurn() is its last state.
 */
import type { PlayerCard } from './cards';
import { hash, rng } from './rng';
import { duelAbility, DuelAbility, Part, PartKind, PART_TRIGGER, Trigger } from './abilities';
import { PLAIN_STADIUMS, Stadium, TwistId, TWISTS } from './stadiums';

export type Side = 'you' | 'opponent';
export type Zone = 0 | 1 | 2;

export const ZONES: Zone[] = [0, 1, 2];
export const TURNS = 6;
export const DECK_SIZE = 12;
export const START_HAND = 3;
export const MAX_PER_ZONE = 4;
export const TIGHT_MAX = 3;
/** home crowd: +4 for a card of a club that plays at the ground (+6 under Wall of sound) */
export const CROWD_BOOST = 4;
export const ROAR_BOOST = 6;
/** credits a win pays per ×1 of prize (a ×4 win pays 40); a loss or a retreat costs nothing */
export const CREDITS_PER_PRIZE = 10;

export const other = (s: Side): Side => (s === 'you' ? 'opponent' : 'you');

// ---------------------------------------------------------------- card stats

export interface Effect extends DuelAbility {
  /** the first part's kind and trigger, for screens that show one line */
  kind: PartKind;
  trigger: Trigger;
}

export interface CardStats {
  cost: number;
  power: number;
  effect: Effect | null;
}

const POWER_BY_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 8, 6: 10 };
export const MAX_POWER = 14;
export const GOAL_BONUS_CAP = 3;

const statsCache = new WeakMap<PlayerCard, CardStats>();

export function cardStats(card: PlayerCard): CardStats {
  const hit = statsCache.get(card);
  if (hit) return hit;
  let cost: number;
  if (card.rarity === 'icon') cost = 6;
  else if (card.rarity === 'elite') cost = card.rank !== null && card.rank <= 6 ? 5 : 4;
  else if (card.rarity === 'rare') cost = 3;
  else cost = card.line === 'DF' || card.line === 'GK' ? 1 : 2;
  const power = Math.min(MAX_POWER, POWER_BY_COST[cost] + (card.stats ? Math.min(GOAL_BONUS_CAP, Math.floor(card.stats.goals / 4)) : 0));
  const a = duelAbility(card);
  const out = { cost, power, effect: { ...a, kind: a.parts[0].kind, trigger: PART_TRIGGER[a.parts[0].kind] } };
  statsCache.set(card, out);
  return out;
}

/** Give a card a chosen ability (tests and tutorials): parts in, a full Effect out. */
export function withParts(base: CardStats, parts: Part[], title = 'Test'): CardStats {
  return { ...base, effect: { title, text: '', why: '', parts, archetype: 'Forward', role: 'test', kind: parts[0].kind, trigger: PART_TRIGGER[parts[0].kind] } };
}

// ---------------------------------------------------------------- state

/** A revealed card on the board. */
export interface Placed {
  card: PlayerCard;
  stats: CardStats;
  side: Side;
  zone: Zone;
  /** the turn it was played */
  turn: number;
  /** permanent Power gained or lost from Kick-off, Every turn and Full time parts */
  bonus: number;
}

/** A play queued this turn, waiting to reveal. */
export interface Pending {
  card: PlayerCard;
  zone: Zone;
  /** what it cost, Heavy pitch included */
  cost: number;
}

export interface GameState {
  seed: number;
  /** 1-6; stays 6 once the game is over */
  turn: number;
  over: boolean;
  /** the prize multiplier (×1, ×2, ×4 …) */
  prize: number;
  snapped: Record<Side, boolean>;
  /** presses made this turn: they double the prize when the turn ends */
  snapsThisTurn: Side[];
  retreated: Side | null;
  /** the three grounds; read twists through zoneTwist() so unrevealed ones stay hidden */
  stadiums: Stadium[];
  /** energy on top of the turn number this turn (Fortress) */
  extra: Record<Side, number>;
  decks: Record<Side, PlayerCard[]>;
  hands: Record<Side, PlayerCard[]>;
  pending: Record<Side, Pending[]>;
  /** per zone, each side's revealed cards in reveal order */
  zones: Record<Side, Placed[]>[];
  /** abilities swapped in by id (tests, tutorials); absent in real games */
  overrides?: Record<number, Part[]>;
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
  extra: { ...s.extra },
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

/** A card's stats in this game (an override replaces its ability). */
export function statsIn(s: GameState, card: PlayerCard): CardStats {
  const o = s.overrides?.[card.id];
  return o ? withParts(cardStats(card), o) : cardStats(card);
}

/** The stadium's name. */
export const zoneName = (s: GameState, z: Zone) => s.stadiums[z].name;
/** The zone's twist once it has revealed (turn zone + 1), else null. */
export const zoneTwist = (s: GameState, zone: Zone): TwistId | null => (s.turn >= zone + 1 ? s.stadiums[zone].twist : null);
/** Is this card a home player at this ground? */
export const isHome = (s: GameState, zone: Zone, card: PlayerCard) => s.stadiums[zone].clubs.includes(card.team.id);
/** The crowd boost a home card gets here right now. */
export const crowdBoost = (s: GameState, zone: Zone) => (zoneTwist(s, zone) === 'roar' ? ROAR_BOOST : CROWD_BOOST);
const effectsWork = (s: GameState, zone: Zone) => zoneTwist(s, zone) !== 'tactics';
export const maxHere = (s: GameState, zone: Zone) => (zoneTwist(s, zone) === 'tight' ? TIGHT_MAX : MAX_PER_ZONE);

const label = (side: Side, card: PlayerCard) => (side === 'you' ? card.banner : `AI · ${card.banner}`);

function draw(s: GameState, side: Side): PlayerCard | null {
  const c = s.decks[side].shift() ?? null;
  if (c) s.hands[side].push(c);
  return c;
}

function logDraw(s: GameState, side: Side, c: PlayerCard | null) {
  if (!c) s.log.push(side === 'you' ? 'Your deck is empty.' : "AI Manager's deck is empty.");
  else s.log.push(side === 'you' ? `You drew ${c.banner}.` : 'AI Manager drew a card.');
}

function logTwist(s: GameState) {
  const z = (s.turn - 1) as Zone;
  if (z > 2) return;
  const t = TWISTS[s.stadiums[z].twist];
  s.log.push(`${s.stadiums[z].name} revealed: ${t.name}. ${t.text}`);
}

export interface NewGameOptions {
  you: PlayerCard[];
  opponent: PlayerCard[];
  seed: number;
  /** the three grounds (lib/stadiums pickStadiums); plain zones when absent */
  stadiums?: Stadium[];
  /** keep the decks in the order given (index 0 drawn first), for tutorials and tests */
  shuffle?: boolean;
  /** replace the grounds' twists, for tests */
  twists?: TwistId[];
  /** replace abilities by card id, for tests and tutorials */
  overrides?: Record<number, Part[]>;
}

export function newGame(o: NewGameOptions): GameState {
  if (o.you.length !== DECK_SIZE || o.opponent.length !== DECK_SIZE) throw new Error(`Each deck needs exactly ${DECK_SIZE} cards.`);
  const keep = o.shuffle === false;
  let stadiums = (o.stadiums && o.stadiums.length === 3 ? o.stadiums : PLAIN_STADIUMS()).map((x) => ({ ...x }));
  if (o.twists) {
    if (o.twists.length !== 3) throw new Error('Exactly three twists.');
    stadiums = stadiums.map((x, i) => ({ ...x, twist: o.twists![i] }));
  } else if (!o.stadiums) {
    // plain zones still get twists, drawn by seed
    const pool: TwistId[] = ['cauldron', 'fortress', 'floodlights', 'heavy', 'counter', 'tight', 'tactics', 'spotlight'];
    const t = shuffle(pool, rng(hash(`${o.seed}:zones`)));
    stadiums = stadiums.map((x, i) => ({ ...x, twist: t[i] }));
  }
  const s: GameState = {
    seed: o.seed,
    turn: 1,
    over: false,
    prize: 1,
    snapped: { you: false, opponent: false },
    snapsThisTurn: [],
    retreated: null,
    stadiums,
    extra: { you: 0, opponent: 0 },
    decks: {
      you: keep ? o.you.slice() : shuffle(o.you, rng(hash(`${o.seed}:you`))),
      opponent: keep ? o.opponent.slice() : shuffle(o.opponent, rng(hash(`${o.seed}:opponent`))),
    },
    hands: { you: [], opponent: [] },
    pending: { you: [], opponent: [] },
    zones: ZONES.map(() => ({ you: [], opponent: [] })),
    overrides: o.overrides,
    log: [],
  };
  for (let i = 0; i < START_HAND; i++) {
    draw(s, 'you');
    draw(s, 'opponent');
  }
  s.log.push('Turn 1.');
  logTwist(s);
  return s;
}
