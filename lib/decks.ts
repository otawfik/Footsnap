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
/** cost-1 cards every deck carries, when the competition has them */
export const MIN_ONE_DROPS = 2;

const fitsCurve = (deck: PlayerCard[], c: PlayerCard) => {
  const cost = cardStats(c).cost;
  return CURVE.every(([min, most]) => cost < min || deck.filter((d) => cardStats(d).cost >= min).length < most);
};

export function buildDeck(owned: PlayerCard[], pool: PlayerCard[], seed: number): Deck {
  const byPower = owned.slice().sort((a, b) => cardStats(b).power - cardStats(a).power || a.id - b.id);
  const picked: PlayerCard[] = [];
  for (const c of byPower) if (picked.length < DECK_SIZE && fitsCurve(picked, c)) picked.push(c);

  const loans = new Set<number>();
  const r = rng(seed);
  const has = (c: PlayerCard) => picked.some((p) => p.id === c.id);
  if (picked.length < DECK_SIZE) {
    // loans: one-drops first if the deck is short of them, then any cheap common
    const cheap = shuffle(pool.filter((c) => c.rarity === 'common' && cardStats(c).cost <= 2 && !has(c)), r);
    const ones = cheap.filter((c) => cardStats(c).cost === 1);
    const need = Math.max(0, MIN_ONE_DROPS - picked.filter((c) => cardStats(c).cost === 1).length);
    for (const c of [...ones.slice(0, need), ...cheap]) {
      if (picked.length >= DECK_SIZE) break;
      if (has(c)) continue;
      picked.push(c);
      loans.add(c.id);
    }
  }
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

/** The Duel record as label/value pairs: W 7 · D 1 · L 4 · Best ×8 (Best only once something's been won). */
export function recordLine(r: { played: number; won: number; drawn: number; best: number }): [string, string][] {
  const lost = Math.max(0, r.played - r.won - r.drawn);
  const out: [string, string][] = [['W', String(r.won)], ['D', String(r.drawn)], ['L', String(lost)]];
  if (r.best > 0) out.push(['Best', `×${r.best}`]);
  return out;
}
