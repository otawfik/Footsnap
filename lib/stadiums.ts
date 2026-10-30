/**
 * Duel stadiums: the three zones are real grounds from the competition.
 *
 * Names come only from football-data's team `venue` field (the same one the match
 * pages show); a club with no venue listed simply never hosts. Clubs that list the
 * same venue (Inter and Milan at the Meazza, Roma and Lazio at the Olimpico) share it,
 * so both get the home crowd there. Nothing else about a ground is stated: no
 * capacities, no histories, because the data doesn't hold them.
 *
 * Every stadium gives a HOME CROWD boost (lib/game.ts CROWD_BOOST) to cards of its
 * clubs, and one TWIST from TWIST_POOL, chosen by the venue's name, so a ground always
 * plays the same way. The twist reveals on turn 1, 2 or 3 like a Snap location.
 */
import type { PlayerCard } from './cards';
import { teamCode } from './cards';
import { clubColors, ClubColors } from './colors';
import { hash, rng } from './rng';
import type { TeamDetail } from './types';

export type TwistId = 'cauldron' | 'fortress' | 'floodlights' | 'heavy' | 'roar' | 'counter' | 'tight' | 'tactics' | 'spotlight' | 'neutral';

/** `short` fits the zone plate; `text` is the full rule. */
export const TWISTS: Record<TwistId, { name: string; short: string; text: string }> = {
  cauldron: { name: 'Cauldron', short: 'First card each turn +2', text: 'The first card each side plays here each turn gets +2 Power.' },
  fortress: { name: 'Fortress', short: 'Behind here: +1 energy', text: 'After each turn, the side behind here gets +1 energy next turn.' },
  floodlights: { name: 'Floodlights', short: 'Every card +1', text: 'Every card here has +1 Power.' },
  heavy: { name: 'Heavy pitch', short: 'Costs 1 more here', text: 'Cards cost 1 more to play here.' },
  roar: { name: 'Wall of sound', short: 'Home crowd +6', text: 'The home crowd boost here is +6, not +4.' },
  counter: { name: 'Late drama', short: '4+ behind: +3 (turn 5+)', text: 'From turn 5, a side 4 or more behind here gets +3 Power.' },
  tight: { name: 'Tight pitch', short: '3 cards a side', text: 'Only 3 cards a side fit here.' },
  tactics: { name: 'Tactics board', short: 'No card abilities', text: "Card abilities don't work here. The crowd still does." },
  spotlight: { name: 'Big stage', short: 'Strongest card +2', text: 'The strongest card here, either side, gets +2 Power.' },
  neutral: { name: 'Neutral ground', short: 'Nothing special', text: 'Nothing special.' },
};
/** the twists a real stadium can draw ('neutral' is for tests and tutorials) */
export const TWIST_POOL: TwistId[] = ['cauldron', 'fortress', 'floodlights', 'heavy', 'roar', 'counter', 'tight', 'tactics', 'spotlight'];

export interface Stadium {
  /** the venue as football-data lists it */
  name: string;
  /** clubs that list it as their venue */
  clubs: number[];
  /** their codes ("LIV"), for the plate */
  codes: string[];
  colors: ClubColors[];
  twist: TwistId;
}

/** A venue's twist: fixed by its name, so Anfield always plays the same way. */
export const twistOf = (venue: string): TwistId => TWIST_POOL[hash(`stadium:${venue.trim().toLowerCase()}`) % TWIST_POOL.length];

/** Every ground in the competition, one entry per venue. */
export function stadiumPool(teams: Pick<TeamDetail, 'id' | 'name' | 'shortName' | 'tla' | 'venue' | 'clubColors'>[]): Stadium[] {
  const by = new Map<string, Stadium>();
  for (const t of teams) {
    const v = t.venue?.trim();
    if (!v) continue;
    const st = by.get(v) ?? { name: v, clubs: [], codes: [], colors: [], twist: twistOf(v) };
    if (!st.clubs.includes(t.id)) {
      st.clubs.push(t.id);
      st.codes.push(teamCode(t));
      st.colors.push(clubColors(t.clubColors, t.id));
    }
    by.set(v, st);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Three grounds for a duel, by seed. A ground's chance grows with the cards both decks
 * hold from its clubs (+1 so every ground can come up), so the crowd has someone to
 * cheer; twists don't repeat when the pool allows it.
 */
export function pickStadiums(pool: Stadium[], decks: PlayerCard[][], seed: number): Stadium[] {
  const r = rng(hash(`${seed}:stadiums`));
  const count = new Map<number, number>();
  for (const d of decks) for (const c of d) count.set(c.team.id, (count.get(c.team.id) ?? 0) + 1);
  const left = pool.slice();
  const out: Stadium[] = [];
  while (out.length < 3 && left.length) {
    const fresh = left.filter((s) => !out.some((o) => o.twist === s.twist));
    const from = fresh.length ? fresh : left;
    const w = from.map((s) => 1 + s.clubs.reduce((t, id) => t + (count.get(id) ?? 0), 0));
    let x = r() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < from.length - 1 && (x -= w[i]) > 0) i++;
    const pick = from[i];
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

/** Stand-in grounds when a competition lists no venues (and for tests): no home club. */
export const PLAIN_STADIUMS = (twists: TwistId[] = ['neutral', 'neutral', 'neutral']): Stadium[] =>
  ['Left wing', 'Centre', 'Right wing'].map((name, i) => ({ name, clubs: [], codes: [], colors: [], twist: twists[i] }));
