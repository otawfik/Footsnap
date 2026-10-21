/**
 * Building Duel decks.
 *
 * Yours: your strongest owned cards (by Duel Power), within a curve, so a
 * collection of stars still has something to play on the early turns: at most
 * 3 cards costing 5+, 5 costing 4+, 8 costing 3+ (so at least 4 cost 1-2).
 * Slots your collection can't fill go to "loan" players: cheap commons from
 * the competition, marked as loans in the lobby.
 *
 * The opponent's: for every card in your deck, a different player from the
 * same competition at the same cost, so its curve matches yours card for card
 * (the same player only when nobody else at that cost is left).
 */
import type { PlayerCard } from './cards';
import { cardStats, DECK_SIZE } from './game';
import { rng } from './rng';

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

const fitsCurve = (deck: PlayerCard[], c: PlayerCard) => {
  const cost = cardStats(c).cost;
  return CURVE.every(([min, most]) => cost < min || deck.filter((d) => cardStats(d).cost >= min).length < most);
};

export function buildDeck(owned: PlayerCard[], pool: PlayerCard[], seed: number): Deck {
  const byPower = owned.slice().sort((a, b) => cardStats(b).power - cardStats(a).power || a.id - b.id);
  const picked: PlayerCard[] = [];
  for (const c of byPower) if (picked.length < DECK_SIZE && fitsCurve(picked, c)) picked.push(c);

  const loans = new Set<number>();
  if (picked.length < DECK_SIZE) {
    const r = rng(seed);
    const cheapPool = shuffle(pool.filter((c) => c.rarity === 'common' && cardStats(c).cost <= 2 && !picked.some((p) => p.id === c.id)), r);
    for (const c of cheapPool) {
      if (picked.length >= DECK_SIZE) break;
      picked.push(c);
      loans.add(c.id);
    }
  }
  return { cards: picked, loans };
}

export function opponentDeck(yours: PlayerCard[], pool: PlayerCard[], seed: number): PlayerCard[] {
  const r = rng(seed ^ 0x5bd1e995);
  const used = new Set(yours.map((c) => c.id));
  const out: PlayerCard[] = [];
  const taken = new Set<number>();
  for (const c of yours) {
    const cost = cardStats(c).cost;
    const fresh = pool.filter((p) => !used.has(p.id) && !taken.has(p.id) && cardStats(p).cost === cost);
    // each league has only three Icons: when they're all yours, the opponent may field the same
    // player at that cost, as Snap lets both sides run the same card
    const mirror = pool.filter((p) => !taken.has(p.id) && cardStats(p).cost === cost);
    const options = fresh.length ? fresh : mirror;
    const pick = options.length ? options[Math.floor(r() * options.length)] : pool.find((p) => !taken.has(p.id));
    if (pick) {
      taken.add(pick.id);
      out.push(pick);
    }
  }
  return out;
}

/** The match being set up: the lobby writes it, the arena reads it. */
let next: { you: PlayerCard[]; opponent: PlayerCard[]; seed: number; loans: Set<number> } | null = null;
export const setMatch = (m: typeof next) => {
  next = m;
};
export const getMatch = () => next;
