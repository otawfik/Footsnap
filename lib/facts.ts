/**
 * Facts about players from Wikidata (scripts/facts/wikidata.py), matched to the squad
 * lists on name AND exact date of birth. Used only by the Duel abilities, and only for
 * what Wikidata states: position words, height and senior caps.
 */
import raw from './facts.json';

export type PositionWord = 'gk' | 'wg' | 'fb' | 'dm' | 'am' | 'st' | 'cb' | 'cm' | 'fw';

export interface Facts {
  /** Wikidata item */
  q: string;
  /** listed positions, most specific first */
  pos?: PositionWord[];
  /** height in cm */
  cm?: number;
  /** senior caps for his country */
  caps?: number;
}

const FACTS = raw as Record<string, Facts>;

export const factsOf = (playerId: number): Facts | undefined => FACTS[String(playerId)];
