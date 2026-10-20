/**
 * The free daily pack: five cards from the selected competition's real players.
 * Seeded by date and competition, so a day's pack is fixed (reopening the app
 * can't reroll it). No purchases exist; the odds are published in the app anyway.
 */
import type { PlayerCard, Rarity } from './cards';
import { hash, rng } from './rng';

export const PACK_SIZE = 5;
export const ODDS: [Rarity, number][] = [['icon', 0.04], ['elite', 0.12], ['rare', 0.24], ['common', 0.6]];

export const packSeed = (day: string, competitionId: number) => hash(`${day}:${competitionId}`);

export function drawPack(cards: PlayerCard[], seed: number): PlayerCard[] {
  const r = rng(seed);
  const byRarity = new Map<Rarity, PlayerCard[]>();
  for (const c of cards) byRarity.set(c.rarity, [...(byRarity.get(c.rarity) ?? []), c]);
  const taken = new Set<number>();
  const fallback: Rarity[] = ['icon', 'elite', 'rare', 'common'];
  const out: PlayerCard[] = [];
  for (let slot = 0; slot < PACK_SIZE && taken.size < cards.length; slot++) {
    let roll = r();
    let rarity: Rarity = 'common';
    for (const [rar, p] of ODDS) {
      if (roll < p) { rarity = rar; break; }
      roll -= p;
    }
    // if that tier is used up, step down (then up) to the nearest tier with cards left
    const tiers = [rarity, ...fallback.slice(fallback.indexOf(rarity) + 1), ...fallback.slice(0, fallback.indexOf(rarity)).reverse()];
    for (const t of tiers) {
      const pool = (byRarity.get(t) ?? []).filter((c) => !taken.has(c.id));
      if (pool.length) {
        const c = pool[Math.floor(r() * pool.length)];
        taken.add(c.id);
        out.push(c);
        break;
      }
    }
  }
  // reveal order: commons first, the best card last
  const rank = { common: 0, rare: 1, elite: 2, icon: 3 } as const;
  return out.sort((a, b) => rank[a.rarity] - rank[b.rarity]);
}
