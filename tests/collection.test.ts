import { describe, expect, it } from 'vitest';
import { addPull, canUpgrade, collectionLevel, milestoneReward, newCard, nextTier, REWARDS, TIERS, unclaimed, unlockPremium, upgrade } from '../lib/collection';

describe('pulls', () => {
  it('adds a new card, then pays out boosters and credits for duplicates', () => {
    const first = addPull(undefined);
    expect(first.isNew).toBe(true);
    expect(first.credits).toBe(0);
    const dup = addPull(first.state);
    expect(dup.isNew).toBe(false);
    expect(dup.state.copies).toBe(2);
    expect(dup.state.boosters).toBe(REWARDS.duplicateBoosters);
    expect(dup.credits).toBe(REWARDS.duplicateCredits);
  });
});

describe('upgrades', () => {
  it('needs both credits and boosters', () => {
    const s = { ...newCard(), boosters: 5 };
    expect(canUpgrade(s, 24)).toBe(false);
    expect(canUpgrade({ ...s, boosters: 4 }, 100)).toBe(false);
    expect(canUpgrade(s, 25)).toBe(true);
  });

  it('spends the cost and moves up exactly one tier', () => {
    const r = upgrade({ ...newCard(), boosters: 7 }, 30, 1);
    expect(r.state.tier).toBe(1);
    expect(r.state.boosters).toBe(2);
    expect(r.credits).toBe(5);
  });

  it('refuses when it can’t afford it, and stops at Infinity', () => {
    const s = { ...newCard(), boosters: 0 };
    expect(upgrade(s, 1000, 1)).toEqual({ state: s, credits: 1000 });
    const top = { ...newCard(), tier: 6 as const, boosters: 999, finish: 'gold' as const };
    expect(nextTier(top)).toBeNull();
    expect(upgrade(top, 9999, 1).state).toBe(top);
  });

  it('rolls a finish on reaching Infinity, reproducibly', () => {
    const s = { ...newCard(), tier: 5 as const, boosters: 50 };
    const a = upgrade(s, 500, 42).state;
    expect(a.tier).toBe(6);
    expect(a.finish).not.toBeNull();
    expect(upgrade(s, 500, 42).state.finish).toBe(a.finish);
  });

  it('has rising costs across seven tiers', () => {
    expect(TIERS).toHaveLength(7);
    for (let t = 2; t < 7; t++) expect(TIERS[t].credits).toBeGreaterThan(TIERS[t - 1].credits);
  });
});

describe('premium and collection level', () => {
  it('unlocks Premium, adding the card if needed', () => {
    const p = unlockPremium(undefined);
    expect(p.premium && p.showPremium).toBe(true);
    expect(p.copies).toBe(1);
    expect(p.boosters).toBe(REWARDS.guessBoosters);
  });

  it('counts cards, tiers and Premium variants', () => {
    expect(collectionLevel([newCard(), { ...newCard(), tier: 3 }, { ...newCard(), premium: true }])).toBe(1 + 4 + 3);
  });

  it('lists unclaimed milestones every ten levels', () => {
    expect(unclaimed(35, [10])).toEqual([20, 30]);
    expect(milestoneReward(30).bonusPack).toBe(true);
    expect(milestoneReward(20).bonusPack).toBe(false);
  });
});

import { puzzle, clues } from '../lib/guess';
import type { PlayerCard } from '../lib/cards';

const mk = (id: number, line: 'GK' | 'DF' | 'MF' | 'FW', team: number, rank: number | null): PlayerCard => ({
  id, name: `Player ${id}`, banner: `P${id}`, line, position: line, age: 20 + (id % 15), dateOfBirth: null, nationality: 'Spain',
  team: { id: team, name: `T${team}`, shortName: `T${team}`, colors: { primary: '#000000', secondary: '#ffffff', accent: '#ffffff' } },
  rarity: rank && rank <= 3 ? 'icon' : rank ? 'rare' : 'common', rank, stats: rank ? { goals: 5, assists: 2, penalties: 0, played: 8 } : null, power: rank ? 12 : null, abilities: [],
});
const deck = Array.from({ length: 80 }, (_, i) => mk(i + 1, (['GK', 'DF', 'MF', 'FW'] as const)[i % 4], (i % 10) + 1, i < 20 ? i + 1 : null));

describe('guess the player', () => {
  it('builds a four-option puzzle containing the answer, the same all day', () => {
    const p = puzzle(deck, '2026-10-20', 2021, 0)!;
    expect(p.options).toHaveLength(4);
    expect(p.options.map((o) => o.id)).toContain(p.answer.id);
    expect(new Set(p.options.map((o) => o.id)).size).toBe(4);
    expect(puzzle(deck, '2026-10-20', 2021, 0)!.answer.id).toBe(p.answer.id);
  });

  it('uses decoys from the same line and other clubs', () => {
    for (let n = 0; n < 20; n++) {
      const p = puzzle(deck, 'd', 1, n)!;
      for (const o of p.options) if (o.id !== p.answer.id) {
        expect(o.line).toBe(p.answer.line);
        expect(o.team.id).not.toBe(p.answer.team.id);
      }
    }
  });

  it('mostly asks about the top scorers', () => {
    let stars = 0;
    for (let n = 0; n < 200; n++) if (puzzle(deck, 'x', 2, n)!.answer.rank !== null) stars++;
    expect(stars / 200).toBeGreaterThan(0.55);
  });

  it('never puts the name in the clues', () => {
    const p = puzzle(deck, 'y', 3, 1)!;
    for (const c of clues(p.answer)) expect(c.value).not.toContain(p.answer.name);
  });

  it('needs at least four cards', () => {
    expect(puzzle(deck.slice(0, 3), 'z', 1, 0)).toBeNull();
  });
});
