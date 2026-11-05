/**
 * Building Duel decks.
 *
 * Yours: your strongest owned cards (by Duel Power), within a curve, so a
 * collection of stars still has something to play on the early turns: at most
 * 3 cards costing 5+, 5 costing 4+, 8 costing 3+ (so at least 4 cost 1-2), and
 * at least 2 costing 1 (defenders and keepers), so turn 1 usually has a play.
 * Slots your collection can't fill go to "loan" players: cheap commons from
 * the competition, marked as loans in the lobby.
 *
 * Or your own: the deck editor saves the owned cards you chose (up to 12) per
 * competition. Loans only ever fill the slots you left empty, and never replace a
 * card you picked. Auto-fill is the automatic deck above.
 *
 * The opponent's: for every card in your deck, a different player from the
 * same competition at the same cost, so its curve matches yours card for card
 * (the same player only when nobody else at that cost is left). It mirrors your home
 * players too: a home player at the duel's grounds for each of yours, an away player
 * for each of your others, where the league has one at that cost. The crowd is +4 a
 * card, so a deck stacked for the grounds would otherwise beat an AI that never plays
 * to them 93% of the time (scripts/deck-sim.ts).
 */
import type { PlayerCard } from './cards';
import { cardStats, DECK_SIZE } from './game';
import { hash, rng } from './rng';
import type { Stadium } from './stadiums';

export interface Deck {
  cards: PlayerCard[];
  /** ids of loan cards (not in your collection) */
  loans: Set<number>;
}

const shuffle = <T>(xs: T[], r: () => number) => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** [minimum cost, most cards at or above it] */
export const CURVE: [number, number][] = [[5, 3], [4, 5], [3, 8]];
/** cost-1 cards every deck carries, when the competition has them */
export const MIN_ONE_DROPS = 2;

const fitsCurve = (deck: PlayerCard[], c: PlayerCard) => {
  const cost = cardStats(c).cost;
  return CURVE.every(([min, most]) => cost < min || deck.filter((d) => cardStats(d).cost >= min).length < most);
};

/**
 * Fill `picked`'s empty slots (in place) with loans: one-drops first while the deck is
 * short of them, then any cheap common. Returns the loans' ids.
 */
function fillLoans(picked: PlayerCard[], pool: PlayerCard[], r: () => number): Set<number> {
  const loans = new Set<number>();
  if (picked.length >= DECK_SIZE) return loans;
  const has = (c: PlayerCard) => picked.some((p) => p.id === c.id);
  const cheap = shuffle(pool.filter((c) => c.rarity === 'common' && cardStats(c).cost <= 2 && !has(c)), r);
  const ones = cheap.filter((c) => cardStats(c).cost === 1);
  const need = Math.max(0, MIN_ONE_DROPS - picked.filter((c) => cardStats(c).cost === 1).length);
  for (const c of [...ones.slice(0, need), ...cheap]) {
    if (picked.length >= DECK_SIZE) break;
    if (has(c)) continue;
    picked.push(c);
    loans.add(c.id);
  }
  return loans;
}

export function buildDeck(owned: PlayerCard[], pool: PlayerCard[], seed: number): Deck {
  const byPower = owned.slice().sort((a, b) => cardStats(b).power - cardStats(a).power || a.id - b.id);
  const picked: PlayerCard[] = [];
  for (const c of byPower) if (picked.length < DECK_SIZE && fitsCurve(picked, c)) picked.push(c);

  const r = rng(seed);
  const loans = fillLoans(picked, pool, r);
  const has = (c: PlayerCard) => picked.some((p) => p.id === c.id);
  // a full deck of stars and twos: swap the weakest 2-cost cards for one-drops (owned first, then loans)
  const oneDrops = () => picked.filter((c) => cardStats(c).cost === 1).length;
  const spare = [
    ...owned.filter((c) => cardStats(c).cost === 1 && !has(c)).sort((a, b) => cardStats(b).power - cardStats(a).power || a.id - b.id),
    ...shuffle(pool.filter((c) => c.rarity === 'common' && cardStats(c).cost === 1 && !has(c)), r),
  ];
  const ownedIds = new Set(owned.map((c) => c.id));
  while (oneDrops() < MIN_ONE_DROPS && spare.length) {
    const twos = picked.filter((c) => cardStats(c).cost === 2).sort((a, b) => cardStats(a).power - cardStats(b).power || b.id - a.id);
    if (!twos.length) break;
    const add = spare.shift()!;
    if (has(add)) continue;
    const out = twos[0];
    picked.splice(picked.indexOf(out), 1, add);
    loans.delete(out.id);
    if (!ownedIds.has(add.id)) loans.add(add.id);
  }
  return { cards: picked, loans };
}

export function opponentDeck(yours: PlayerCard[], pool: PlayerCard[], seed: number, grounds?: Stadium[] | null): PlayerCard[] {
  const r = rng(seed ^ 0x5bd1e995);
  const used = new Set(yours.map((c) => c.id));
  const home = (c: PlayerCard) => !!grounds?.some((g) => g.clubs.includes(c.team.id));
  const out: PlayerCard[] = [];
  const taken = new Set<number>();
  for (const c of yours) {
    const cost = cardStats(c).cost;
    const fresh = pool.filter((p) => !used.has(p.id) && !taken.has(p.id) && cardStats(p).cost === cost);
    // each league has only three Icons: when they're all yours, the opponent may field the same
    // player at that cost, as Snap lets both sides run the same card
    const mirror = pool.filter((p) => !taken.has(p.id) && cardStats(p).cost === cost);
    const any = fresh.length ? fresh : mirror;
    // home for home, away for away, so it brings exactly as many crowd cards as you do
    const alike = any.filter((p) => home(p) === home(c));
    const options = alike.length ? alike : any;
    const pick = options.length ? options[Math.floor(r() * options.length)] : pool.find((p) => !taken.has(p.id));
    if (pick) {
      taken.add(pick.id);
      out.push(pick);
    }
  }
  return out;
}

// ---------------------------------------------------------------- your own deck

/**
 * Your deck from the cards you chose: the owned ones you picked, in order (ids you no
 * longer own, repeats and anything past 12 are dropped), then loans in the empty slots.
 */
export function resolveDeck(ids: number[], owned: PlayerCard[], pool: PlayerCard[], seed: number): Deck {
  const byId = new Map(owned.map((c) => [c.id, c]));
  const picked: PlayerCard[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (c && !picked.includes(c) && picked.length < DECK_SIZE) picked.push(c);
  }
  const loans = fillLoans(picked, pool, rng(seed));
  return { cards: picked, loans };
}

/** The owned cards Auto-fill picks: the automatic deck, without its loans. */
export const autoIds = (owned: PlayerCard[], pool: PlayerCard[], seed: number): number[] => {
  const d = buildDeck(owned, pool, seed);
  return d.cards.filter((c) => !d.loans.has(c.id)).map((c) => c.id);
};

/** Why a deck can't be played, or null: exactly 12 cards, each player once. */
export function validateDeck(cards: PlayerCard[]): string | null {
  const seen = new Set<number>();
  for (const c of cards) {
    if (seen.has(c.id)) return `${c.name} is in the deck twice.`;
    seen.add(c.id);
  }
  if (cards.length !== DECK_SIZE) return `A deck needs ${DECK_SIZE} cards; this one has ${cards.length}.`;
  return null;
}

/** Tap a collection card in the editor: in the deck → out; out → in, if there's room. */
export function toggleInDeck(ids: number[], id: number): { ids: number[]; error: string | null } {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), error: null };
  if (ids.length >= DECK_SIZE) return { ids, error: `Your deck is full. Take a card out to make room.` };
  return { ids: [...ids, id], error: null };
}

/** Cards per cost 1-6 (index 0 = cost 1) and total Power. */
export function deckSummary(cards: PlayerCard[]): { curve: number[]; power: number } {
  const curve = [0, 0, 0, 0, 0, 0];
  let power = 0;
  for (const c of cards) {
    const st = cardStats(c);
    curve[Math.min(6, Math.max(1, st.cost)) - 1]++;
    power += st.power;
  }
  return { curve, power };
}

// ---------------------------------------------------------------- saved decks

/** The owned cards you chose for one competition (loans are never saved: they're worked out). */
export interface SavedDeck {
  ids: number[];
}
export const DECK_SAVE_VERSION = 2;
/** competition id → your deck; no entry means the automatic deck */
export interface DeckSaves {
  version: typeof DECK_SAVE_VERSION;
  decks: Record<string, SavedDeck>;
}
export const NO_SAVES: DeckSaves = { version: DECK_SAVE_VERSION, decks: {} };

const cleanIds = (xs: unknown): number[] => {
  if (!Array.isArray(xs)) return [];
  const out: number[] = [];
  for (const x of xs) if (Number.isInteger(x) && !out.includes(x as number) && out.length < DECK_SIZE) out.push(x as number);
  return out;
};

/**
 * Read whatever is saved into the current shape. Version 1 was a bare
 * `{ [competition]: number[] }`; anything unreadable becomes "no saved decks"
 * (so every competition falls back to the automatic deck) rather than an error.
 */
export function migrateDeckSaves(raw: unknown): DeckSaves {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...NO_SAVES, decks: {} };
  const o = raw as Record<string, unknown>;
  const decks: Record<string, SavedDeck> = {};
  if (o.version === DECK_SAVE_VERSION && o.decks && typeof o.decks === 'object') {
    for (const [k, v] of Object.entries(o.decks as Record<string, unknown>)) decks[k] = { ids: cleanIds((v as { ids?: unknown })?.ids) };
  } else if (o.version === undefined) {
    for (const [k, v] of Object.entries(o)) if (Array.isArray(v)) decks[k] = { ids: cleanIds(v) };
  }
  return { version: DECK_SAVE_VERSION, decks };
}

// ---------------------------------------------------------------- the next duel

/**
 * The next duel's seed per competition. It's drawn once and kept until a duel starts,
 * so the grounds the lobby and the deck editor show are the ones you'll play at, however
 * often you go back and forth.
 */
const nextSeeds = new Map<number, number>();
export function nextDuelSeed(competition: number, now = Date.now()): number {
  let s = nextSeeds.get(competition);
  if (!s) {
    s = hash(`${now}:${competition}`) || 1;
    nextSeeds.set(competition, s);
  }
  return s;
}
/** A duel started: the next visit draws a new one. */
export const usedDuelSeed = (competition: number) => {
  nextSeeds.delete(competition);
};

/** The match being set up: the lobby writes it, the arena reads it. */
let next: { you: PlayerCard[]; opponent: PlayerCard[]; seed: number; loans: Set<number>; stadiums?: Stadium[] } | null = null;
export const setMatch = (m: typeof next) => {
  next = m;
};
export const getMatch = () => next;

/** The Duel record as label/value pairs: W 7 · D 1 · L 4 · Best ×8 (Best only once something's been won). */
export function recordLine(r: { played: number; won: number; drawn: number; best: number }): [string, string][] {
  const lost = Math.max(0, r.played - r.won - r.drawn);
  const out: [string, string][] = [['W', String(r.won)], ['D', String(r.drawn)], ['L', String(lost)]];
  if (r.best > 0) out.push(['Best', `×${r.best}`]);
  return out;
}
