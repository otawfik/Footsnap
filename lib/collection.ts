/**
 * The collection system, modelled on Marvel Snap's.
 *
 * Credits are the currency (packs, duplicates, correct picks, correct guesses).
 * Boosters belong to one card; you get them from duplicate pulls and from
 * guessing that player. Spending both upgrades a card through seven tiers, each
 * adding a visible effect, the way Snap upgrades a card from Common to its top tier (here: Legend).
 * Every upgrade, new card and Premium variant raises your Collection Level, and
 * every ten levels pays out a reward.
 *
 * The Premium variant is unlocked by naming the player from a mystery card
 * (app/guess.tsx). Upgrades and variants are cosmetic: the stats and abilities
 * printed on a card never change.
 */
import { hash, rng } from './rng';

export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Finish = 'gold' | 'prism' | 'krackle' | 'stellar';

export interface TierInfo {
  name: string;
  effect: string;
  credits: number;
  boosters: number;
}

/** Index = tier. Costs are to reach that tier from the one below. */
export const TIERS: TierInfo[] = [
  { name: 'Base', effect: 'The standard card.', credits: 0, boosters: 0 },
  { name: 'Breakout', effect: 'The player (or the shirt) breaks out over the top of the frame.', credits: 25, boosters: 5 },
  { name: 'Depth', effect: '3D: the art floats inside the frame as you tilt.', credits: 100, boosters: 10 },
  { name: 'Pulse', effect: 'An animated glow in the club colours.', credits: 200, boosters: 20 },
  { name: 'Crest', effect: "The club's crest (or its name, where crests are off) embossed into the art.", credits: 300, boosters: 30 },
  { name: 'Holo', effect: 'Holographic foil, whatever the rarity.', credits: 400, boosters: 40 },
  { name: 'Legend', effect: 'The black-and-gold Legend frame and a random finish.', credits: 500, boosters: 50 },
];

export const FINISH_NAME: Record<Finish, string> = { gold: 'Gilded', prism: 'Prismatic', krackle: 'Crackle', stellar: 'Starfield' };
const FINISHES: Finish[] = ['gold', 'prism', 'krackle', 'stellar'];

export interface CardState {
  copies: number;
  boosters: number;
  tier: Tier;
  premium: boolean;
  /** show the Premium variant instead of the base art */
  showPremium: boolean;
  /** decided when the card reaches Legend */
  finish: Finish | null;
}

export const REWARDS = {
  packOpened: 20,
  duplicateCredits: 10,
  duplicateBoosters: 5,
  guessCredits: 25,
  guessBoosters: 10,
  pickRight: 10,
} as const;

export const newCard = (): CardState => ({ copies: 1, boosters: 0, tier: 0, premium: false, showPremium: false, finish: null });

/** Add a pulled card. Returns the new state and any credits earned (duplicates pay out). */
export function addPull(state: CardState | undefined): { state: CardState; credits: number; isNew: boolean } {
  if (!state) return { state: newCard(), credits: 0, isNew: true };
  return {
    state: { ...state, copies: state.copies + 1, boosters: state.boosters + REWARDS.duplicateBoosters },
    credits: REWARDS.duplicateCredits,
    isNew: false,
  };
}

export function nextTier(state: CardState): TierInfo | null {
  return state.tier < 6 ? TIERS[state.tier + 1] : null;
}

export function canUpgrade(state: CardState, credits: number): boolean {
  const next = nextTier(state);
  return !!next && credits >= next.credits && state.boosters >= next.boosters;
}

/** Spend credits and boosters to go up one tier; reaching Legend rolls a finish. */
export function upgrade(state: CardState, credits: number, seed: number): { state: CardState; credits: number } {
  const next = nextTier(state);
  if (!next || !canUpgrade(state, credits)) return { state, credits };
  const tier = (state.tier + 1) as Tier;
  const finish = tier === 6 ? FINISHES[Math.floor(rng(seed)() * FINISHES.length)] : state.finish;
  return { state: { ...state, tier, boosters: state.boosters - next.boosters, finish }, credits: credits - next.credits };
}

/** Correctly naming a player unlocks their Premium variant (and adds the card if you didn't have it). */
export function unlockPremium(state: CardState | undefined): CardState {
  const s = state ?? newCard();
  return { ...s, premium: true, showPremium: true, boosters: s.boosters + REWARDS.guessBoosters };
}

/** One point per card owned, per upgrade tier, and two per Premium variant. */
export function collectionLevel(cards: Iterable<CardState>): number {
  let level = 0;
  for (const c of cards) level += 1 + c.tier + (c.premium ? 2 : 0);
  return level;
}

export const MILESTONE_STEP = 10;

/** Reward for reaching a Collection Level milestone: credits, with a bonus pack every 30 levels. */
export function milestoneReward(level: number): { credits: number; bonusPack: boolean } {
  return { credits: 50 + Math.floor(level / 50) * 25, bonusPack: level % 30 === 0 };
}

/** Milestones reached but not yet claimed. */
export function unclaimed(level: number, claimed: number[]): number[] {
  const out: number[] = [];
  for (let m = MILESTONE_STEP; m <= level; m += MILESTONE_STEP) if (!claimed.includes(m)) out.push(m);
  return out;
}

export const upgradeSeed = (playerId: number, tier: number) => hash(`${playerId}:${tier}`);

/** How a card should be drawn, from its state (unowned cards draw as base). */
export const lookOf = (s?: CardState) => ({
  tier: (s?.tier ?? 0) as Tier,
  finish: s?.finish ?? null,
  premium: !!(s?.premium && s.showPremium),
});
