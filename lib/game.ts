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

// ---------------------------------------------------------------- power

const pre = (c: Placed) => c.stats.power + c.bonus;
const partsOf = (c: Placed, t?: Trigger): Part[] => (c.stats.effect?.parts ?? []).filter((p) => !t || PART_TRIGGER[p.kind] === t);
const sumN = (c: Placed, kind: PartKind) => (c.stats.effect?.parts ?? []).reduce((t, p) => t + (p.kind === kind ? p.n : 0), 0);

/** A revealed card's Power right now: base + bonuses + crowd + twist + While here parts, floored at 0. */
export function cardPower(s: GameState, c: Placed): number {
  const z = c.zone;
  const own = s.zones[z][c.side];
  const foe = s.zones[z][other(c.side)];
  const twist = zoneTwist(s, z);
  let p = pre(c);
  if (isHome(s, z, c.card)) p += crowdBoost(s, z);
  if (twist === 'floodlights') p += 1;
  if (twist === 'spotlight') {
    const top = Math.max(...own.map(pre), ...foe.map(pre));
    if (pre(c) === top) p += 2;
  }
  if (effectsWork(s, z)) {
    for (const part of partsOf(c, 'while')) {
      switch (part.kind) {
        case 'highest':
          if (own.every((o) => o === c || pre(o) <= pre(c))) p += part.n;
          break;
        case 'withMates':
          p += part.n * (own.length - 1);
          break;
        case 'late':
          if (c.turn >= 5) p += part.n;
          break;
        case 'pairDef':
          if (own.some((o) => o !== c && o.card.line === 'DF')) p += part.n;
          break;
        case 'homeHero':
          if (isHome(s, z, c.card)) p += part.n;
          break;
        case 'roamer':
          if (!isHome(s, z, c.card)) p += part.n;
          break;
        case 'spread':
          if (ZONES.every((zz) => s.zones[zz][c.side].length > 0)) p += part.n;
          break;
        case 'clubmates': {
          const mates = ZONES.flatMap((zz) => s.zones[zz][c.side]).filter((o) => o !== c && o.card.team.id === c.card.team.id).length;
          p += part.n * Math.min(3, mates);
          break;
        }
        case 'countrymen':
          if (c.card.nationality) p += part.n * own.filter((o) => o !== c && o.card.nationality === c.card.nationality).length;
          break;
      }
    }
    // captains lift the other cards on their side here
    for (const o of own) if (o !== c) p += sumN(o, 'captain');
    // marking doesn't stack: the biggest marker here counts
    p -= Math.max(0, ...foe.map((o) => sumN(o, 'mark')));
  }
  return Math.max(0, p);
}

const COUNTER_GAP = 4;
const rawPower = (s: GameState, zone: Zone, who: Side) => s.zones[zone][who].reduce((t, c) => t + cardPower(s, c), 0);

/** A side's total Power in a zone, Late drama included. */
export function zonePower(s: GameState, zone: Zone, who: Side): number {
  const mine = rawPower(s, zone, who);
  if (zoneTwist(s, zone) === 'counter' && s.turn >= 5 && rawPower(s, zone, other(who)) - mine >= COUNTER_GAP) return mine + 3;
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

export const playCost = (s: GameState, card: PlayerCard, zone: Zone) => statsIn(s, card).cost + (zoneTwist(s, zone) === 'heavy' ? 1 : 0);

/** Energy this turn: the turn number plus any Fortress energy. */
export const energyOf = (s: GameState, who: Side) => s.turn + s.extra[who];
/** Energy a side has left this turn after its queued plays. */
export const energyLeft = (s: GameState, who: Side) => energyOf(s, who) - s.pending[who].reduce((t, p) => t + p.cost, 0);

/** Why a play is illegal, or null if it's fine. */
function illegal(s: GameState, who: Side, cardId: number, zone: number): string | null {
  if (s.over) return 'The game is over.';
  if (!ZONES.includes(zone as Zone)) return `No zone ${zone}.`;
  const card = s.hands[who].find((c) => c.id === cardId);
  if (!card) return `Card ${cardId} is not in hand.`;
  if (count(s, zone as Zone, who) >= maxHere(s, zone as Zone)) return `${zoneName(s, zone as Zone)} is full.`;
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
    if (seen.has(card.id)) continue;
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

// ---------------------------------------------------------------- prize

export const canSnap = (s: GameState, who: Side) => !s.over && !s.snapped[who];

export function snap(state: GameState, who: Side): GameState {
  if (!canSnap(state, who)) throw new Error(state.over ? 'The game is over.' : 'Already pressed this game.');
  const s = clone(state);
  s.snapped[who] = true;
  s.snapsThisTurn.push(who);
  const next = s.prize * 2 ** s.snapsThisTurn.length;
  s.log.push(`${who === 'you' ? 'You' : 'AI Manager'} pressed: the prize goes to ×${next} when this turn ends.`);
  return s;
}

/** Concede now, at the current prize. */
export function retreat(state: GameState, who: Side): GameState {
  if (state.over) throw new Error('The game is over.');
  const s = clone(state);
  s.over = true;
  s.retreated = who;
  s.snapsThisTurn = [];
  s.log.push(`${who === 'you' ? 'You' : 'AI Manager'} retreated at prize ×${s.prize}.`);
  return s;
}

// ---------------------------------------------------------------- turn

/** your strongest revealed card in a zone, or null */
const strongest = (cs: Placed[]) => cs.reduce<Placed | null>((b, c) => (!b || pre(c) > pre(b) ? c : b), null);

function reveal(s: GameState, side: Side, p: Pending): string[] {
  const foe = other(side);
  const z = p.zone;
  const behindBefore = zonePower(s, z, side) < zonePower(s, z, foe);
  const c: Placed = { card: p.card, stats: statsIn(s, p.card), side, zone: z, turn: s.turn, bonus: 0 };
  const firstThisTurn = !s.zones[z][side].some((o) => o.turn === s.turn);
  s.zones[z][side].push(c);
  const notes: string[] = [];
  if (isHome(s, z, c.card)) notes.push(`home crowd +${crowdBoost(s, z)}`);
  if (zoneTwist(s, z) === 'cauldron' && firstThisTurn) {
    c.bonus += 2;
    notes.push('Cauldron +2');
  }
  if (effectsWork(s, z)) {
    for (const part of partsOf(c, 'kickoff')) {
      const n = part.n;
      switch (part.kind) {
        case 'alone':
          if (count(s, z, side) === 1) {
            c.bonus += n;
            notes.push(`+${n}, alone here`);
          }
          break;
        case 'outnumbered':
          if (count(s, z, foe) > count(s, z, side)) {
            c.bonus += n;
            notes.push(`+${n}, outnumbered`);
          }
          break;
        case 'behind':
          if (behindBefore) {
            c.bonus += n;
            notes.push(`+${n}, from behind`);
          }
          break;
        case 'emptyHere':
          if (count(s, z, foe) === 0) {
            c.bonus += n;
            notes.push(`+${n}, first here`);
          }
          break;
        case 'boostHere': {
          const mates = s.zones[z][side].filter((o) => o !== c);
          for (const o of mates) o.bonus += n;
          if (mates.length) notes.push(`+${n} to ${side === 'you' ? 'your' : 'their'} other cards here`);
          break;
        }
        case 'boostOthers': {
          let hit = 0;
          for (const zz of ZONES) {
            if (zz === z) continue;
            const t = strongest(s.zones[zz][side]);
            if (t) {
              t.bonus += n;
              hit++;
            }
          }
          if (hit) notes.push(`+${n} at ${hit === 1 ? 'one other stadium' : 'the other stadiums'}`);
          break;
        }
        case 'draw':
          for (let i = 0; i < n; i++) {
            const d = draw(s, side);
            notes.push(d ? (side === 'you' ? `drew ${d.banner}` : 'drew a card') : 'deck is empty');
          }
          break;
        case 'tackle': {
          const t = strongest(s.zones[z][foe]);
          if (t) {
            t.bonus -= n;
            notes.push(`−${n} to ${label(foe, t.card)}`);
          }
          break;
        }
        case 'stop':
          if (s.zones[z][foe].length) {
            for (const o of s.zones[z][foe]) o.bonus -= n;
            notes.push(`−${n} to every enemy card here`);
          }
          break;
      }
    }
  }
  s.log.push(`${label(side, c.card)} revealed at ${zoneName(s, z)}${notes.length ? `: ${notes.join(', ')}` : ''}.`);
  return notes;
}

export interface EndTurnOptions {
  /** let aiPlays choose the opponent's plays, press and retreat (default true); false uses the opponent's queued plays as they are */
  ai?: boolean;
}

/** One moment of a resolving turn, for the board to animate. */
export interface TurnStep {
  /** 'queued': the AI's plays sit face down; 'reveal': one card landed; 'grow': Every turn parts; 'fulltime': Full time parts */
  kind: 'queued' | 'reveal' | 'grow' | 'fulltime';
  state: GameState;
  /** the card that just landed (kind 'reveal') */
  card?: { side: Side; zone: Zone; id: number };
  /** it landed at its own club's ground: the crowd boost fired */
  crowd?: boolean;
  /** an ability part did something as it landed */
  ability?: boolean;
}

export interface TurnResolution {
  /** in order; empty when the AI retreats */
  steps: TurnStep[];
  /** the state after the turn: the next turn started, or the game over */
  final: GameState;
}

/**
 * Resolve the turn: AI moves, both sides reveal, Kick-off and Every turn parts
 * resolve, Fortress energy and the prize update, then the next turn starts or,
 * after turn 6, Full time parts resolve and the game ends. Returns every step.
 */
export function resolveTurn(state: GameState, opts: EndTurnOptions = {}): TurnResolution {
  if (state.over) return { steps: [], final: state };
  let s = clone(state);
  const steps: TurnStep[] = [];

  if (opts.ai !== false) {
    const move = aiPlays(s, hash(`${s.seed}:ai:${s.turn}`), 'opponent');
    if (move.retreat) return { steps, final: retreat(s, 'opponent') };
    if (move.snap && canSnap(s, 'opponent')) s = snap(s, 'opponent');
    for (const p of move.plays) s = play(s, 'opponent', p.cardId, p.zone);
  }
  steps.push({ kind: 'queued', state: clone(s) });

  const won = (side: Side) => ZONES.filter((z) => zoneLeader(s, z) === side).length;
  const first: Side = won('opponent') > won('you') ? 'opponent' : 'you';
  const order: Side[] = [first, other(first)];
  for (const side of order) {
    while (s.pending[side].length) {
      const p = s.pending[side].shift()!;
      const notes = reveal(s, side, p);
      const crowd = isHome(s, p.zone, p.card);
      steps.push({ kind: 'reveal', state: clone(s), card: { side, zone: p.zone, id: p.card.id }, crowd, ability: notes.length > (crowd ? 1 : 0) });
    }
  }

  // Every turn parts
  let grew = false;
  for (const z of ZONES) {
    if (!effectsWork(s, z)) continue;
    for (const side of order) {
      for (const c of s.zones[z][side]) {
        const n = sumN(c, 'grow');
        if (!n) continue;
        c.bonus += n;
        grew = true;
        s.log.push(`${label(side, c.card)} grew to ${cardPower(s, c)} Power.`);
      }
    }
  }
  if (grew) steps.push({ kind: 'grow', state: clone(s) });

  // Fortress: the side behind there gets +1 energy next turn
  s.extra = { you: 0, opponent: 0 };
  for (const z of ZONES) {
    if (zoneTwist(s, z) !== 'fortress') continue;
    const lead = zoneLeader(s, z);
    if (lead === 'tie') continue;
    const behind = other(lead);
    s.extra[behind] += 1;
    if (s.turn < TURNS) s.log.push(`Fortress at ${zoneName(s, z)}: ${behind === 'you' ? 'you get' : 'AI Manager gets'} +1 energy next turn.`);
  }

  s.prize *= 2 ** s.snapsThisTurn.length;
  s.snapsThisTurn = [];

  if (s.turn >= TURNS) {
    // Full time parts, once, in reveal order
    let fired = false;
    for (const z of ZONES) {
      if (!effectsWork(s, z)) continue;
      for (const side of order) {
        for (const c of s.zones[z][side]) {
          for (const part of partsOf(c, 'fulltime')) {
            if (part.kind === 'pens' || (part.kind === 'lastDitch' && zonePower(s, z, side) < zonePower(s, z, other(side)))) {
              c.bonus += part.n;
              fired = true;
              s.log.push(`Full time: ${label(side, c.card)} +${part.n} at ${zoneName(s, z)}.`);
            }
          }
        }
      }
    }
    if (fired) steps.push({ kind: 'fulltime', state: clone(s) });
    s.over = true;
    s.prize *= 2;
    const r = result(s);
    const zones = ZONES.map((z) => `${zoneName(s, z)} ${zonePower(s, z, 'you')}-${zonePower(s, z, 'opponent')}`).join(', ');
    s.log.push(`Full time. ${zones}. ${r.winner === 'draw' ? 'Draw' : r.winner === 'you' ? 'You win' : 'AI Manager wins'} (prize ×${s.prize}).`);
    return { steps, final: s };
  }

  s.turn += 1;
  s.log.push(`Turn ${s.turn}.`);
  logTwist(s);
  logDraw(s, 'you', draw(s, 'you'));
  logDraw(s, 'opponent', draw(s, 'opponent'));
  return { steps, final: s };
}

/** Resolve the turn and return the state after it (see resolveTurn for the steps). */
export function endTurn(state: GameState, opts: EndTurnOptions = {}): GameState {
  return resolveTurn(state, opts).final;
}

/** The state if `who`'s queued cards revealed now, in queue order (the other side's queue untouched). */
function revealOwn(state: GameState, who: Side): GameState {
  const s = clone(state);
  s.log = [];
  while (s.pending[who].length) reveal(s, who, s.pending[who].shift()!);
  return s;
}

/**
 * A side's Power in a zone if its queued cards revealed now, before the other side's
 * (the "+5" on the zone plate: the real order and the other side's plays can change it).
 */
export function projectedPower(state: GameState, zone: Zone, who: Side): number {
  if (!state.pending[who].length) return zonePower(state, zone, who);
  return zonePower(revealOwn(state, who), zone, who);
}

// ---------------------------------------------------------------- result

export interface GameResult {
  winner: Side | 'draw';
  /** the final prize if the game is over (the current one on a retreat); the current prize otherwise */
  prize: number;
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
  return { winner, prize: s.prize, zonesWon, zones, power, final: s.over, retreated: s.retreated };
}

// ---------------------------------------------------------------- AI

export interface AiMove {
  plays: Play[];
  snap: boolean;
  retreat: boolean;
}

/** Power a side can expect to add per energy (the cost table gives 1.7-2; effects and wasted energy pull it down). */
const POWER_PER_ENERGY = 1.5;
/** snap when swinging two zones would take more than this share of the other side's remaining Power */
const SNAP_SAFETY = 1;
/** retreat when winning two zones would take this much more than the side's own remaining Power */
const RETREAT_SLACK = 2;

/** How much a zone lead is worth: steep near level, flat once it's won or lost. */
const worth = (lead: number) => Math.tanh(lead / 5);

/** Each zone's lead for `who` once its own queue has revealed. */
const leads = (s: GameState, who: Side) => {
  const r = s.pending[who].length ? revealOwn(s, who) : s;
  return ZONES.map((z) => zonePower(r, z, who) - zonePower(r, z, other(who)));
};

/** What a card is worth later on that the board can't show yet (Every turn, Full time, a card drawn). */
function laterWorth(s: GameState, st: CardStats, zone: Zone, who: Side): number {
  if (zoneTwist(s, zone) === 'tactics') return 0;
  let v = 0;
  for (const p of st.effect?.parts ?? []) {
    if (p.kind === 'grow') v += p.n * (TURNS - s.turn) * 0.8;
    if (p.kind === 'pens') v += p.n * 0.9;
    if (p.kind === 'lastDitch') v += p.n * 0.4;
    if (p.kind === 'draw' && s.turn < TURNS) v += 1.5 * p.n;
    if (p.kind === 'late' && s.turn < 5) v -= 2; // hold it for the last two turns
  }
  return v;
}

/**
 * The AI. It reads the board and its own hand only (never the other side's queue).
 * Every candidate play is tried on a copy of the board, with the AI's own queue
 * revealed, so crowd boosts, twists and every ability count exactly as the engine
 * scores them. It picks the set of cards with the most value that fits its energy,
 * then sends each (strongest first) where it moves the zone leads most: level and
 * narrowly lost zones gain the most, zones already won or gone gain little.
 * Prize: it presses on turn 4+ when turning two zones round would cost the other side
 * more Power than it can still add, and retreats on turn 5-6, once the prize is up,
 * when winning two zones would cost it more than it can still add plus a margin.
 */
export function aiPlays(state: GameState, seed: number, who: Side = 'opponent'): AiMove {
  if (state.over) return { plays: [], snap: false, retreat: false };
  const r = rng(seed);
  const foe = other(who);
  // hide the other side's queue from it
  const view: GameState = { ...state, pending: { ...state.pending, [foe]: [] } as Record<Side, Pending[]> };
  const budget = energyLeft(view, who);
  const base = leads(view, who);
  const total = (ls: number[]) => ls.reduce((t, l) => t + worth(l), 0);

  // value of each card in hand: its best single play on the board as it stands
  const hand = view.hands[who].slice(0, 10).map((card) => {
    const st = statsIn(view, card);
    let best = -Infinity;
    for (const lp of legalPlays(view, who)) {
      if (lp.cardId !== card.id) continue;
      const after = leads(play(view, who, card.id, lp.zone), who);
      const gained = after.reduce((t, l, z) => t + l - base[z], 0) + laterWorth(view, st, lp.zone, who);
      best = Math.max(best, gained);
    }
    return { card, st, value: best === -Infinity ? 0 : best };
  });

  let pick: typeof hand = [];
  let bestScore = -Infinity;
  const n = hand.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let cost = 0;
    let value = 0;
    const set: typeof hand = [];
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      cost += hand[i].st.cost;
      value += hand[i].value;
      set.push(hand[i]);
    }
    if (cost > budget) continue;
    const score = value * 10 + cost;
    if (score > bestScore) {
      bestScore = score;
      pick = set;
    }
  }
  pick.sort((a, b) => b.value - a.value || a.card.id - b.card.id);

  let s = view;
  const plays: Play[] = [];
  const place = (card: PlayerCard): boolean => {
    const now = leads(s, who);
    const st = statsIn(s, card);
    let choice: { zone: Zone; gain: number } | null = null;
    for (const lp of legalPlays(s, who)) {
      if (lp.cardId !== card.id) continue;
      const after = leads(play(s, who, card.id, lp.zone), who);
      const gain = total(after) - total(now) + worth(laterWorth(s, st, lp.zone, who)) * 0.5 + r() * 0.001;
      if (!choice || gain > choice.gain) choice = { zone: lp.zone, gain };
    }
    if (!choice) return false;
    s = play(s, who, card.id, choice.zone);
    plays.push({ cardId: card.id, zone: choice.zone });
    return true;
  };
  for (const { card } of pick) place(card);
  // energy left over (a Heavy pitch pushed something out, say): fill with whatever still fits
  for (;;) {
    const fits = s.hands[who].filter((c) => legalPlays(s, who).some((lp) => lp.cardId === c.id));
    if (!fits.length) break;
    fits.sort((a, b) => statsIn(s, b).power - statsIn(s, a).power || a.id - b.id);
    if (!place(fits[0])) break;
  }

  const lead = leads(s, who);
  const powerLeft = (from: number) => POWER_PER_ENERGY * Array.from({ length: Math.max(0, TURNS - from + 1) }, (_, i) => from + i).reduce((t, e) => t + e, 0);
  const twoCheapest = (costs: number[]) => costs.sort((a, b) => a - b)[0] + costs[1];
  const toFlipForThem = twoCheapest(lead.map((l) => Math.max(0, l + 1)));
  const toFlipForMe = twoCheapest(lead.map((l) => Math.max(0, 1 - l)));
  const prizeNow = state.prize * 2 ** state.snapsThisTurn.length;
  const doSnap = state.turn >= 4 && canSnap(state, who) && toFlipForThem > SNAP_SAFETY * powerLeft(state.turn);
  const doRetreat = !doSnap && state.turn >= 5 && prizeNow >= 2 && toFlipForMe > powerLeft(state.turn + 1) + RETREAT_SLACK;
  return { plays: doRetreat ? [] : plays, snap: doSnap, retreat: doRetreat };
}
