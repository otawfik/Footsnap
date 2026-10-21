/**
 * "Who's this?": a mystery card with the name and face hidden, and four names
 * to choose from. Get it right and the Premium variant of that card unlocks.
 *
 * The answer is usually one of the competition's top-20 scorers (players a fan
 * can know), sometimes a squad player. The three wrong options play the same
 * line where possible, so position alone doesn't give it away. Puzzles are
 * seeded by day, competition and number, so they're the same all day.
 */
import type { PlayerCard } from './cards';
import { hash, rng } from './rng';

export const GUESSES_PER_DAY = 5;

export interface Puzzle {
  answer: PlayerCard;
  options: PlayerCard[];
}

export function puzzle(cards: PlayerCard[], day: string, competitionId: number, n: number): Puzzle | null {
  if (cards.length < 4) return null;
  const r = rng(hash(`${day}:${competitionId}:${n}`));
  const stars = cards.filter((c) => c.rank !== null);
  const rest = cards.filter((c) => c.rank === null);
  const pool = stars.length && (r() < 0.7 || !rest.length) ? stars : rest;
  const answer = pool[Math.floor(r() * pool.length)];
  const sameLine = cards.filter((c) => c.id !== answer.id && c.line === answer.line && c.team.id !== answer.team.id);
  const others = cards.filter((c) => c.id !== answer.id && !sameLine.includes(c));
  const decoys: PlayerCard[] = [];
  const from = (list: PlayerCard[]) => {
    const copy = list.slice();
    while (decoys.length < 3 && copy.length) {
      const c = copy.splice(Math.floor(r() * copy.length), 1)[0];
      if (!decoys.some((d) => d.name === c.name) && c.name !== answer.name) decoys.push(c);
    }
  };
  from(sameLine);
  from(others);
  const options = [answer, ...decoys];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { answer, options };
}

/** The clues shown, in the order they unlock. */
export function clues(c: PlayerCard): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  out.push({ label: 'Position', value: c.position });
  if (c.age !== null) out.push({ label: 'Age', value: String(c.age) });
  // no nationality: with few players from a country in the league, it named the answer outright
  if (c.stats) out.push({ label: 'This season', value: `${c.stats.goals} goals${c.stats.assists !== null ? `, ${c.stats.assists} assists` : ''}` });
  return out;
}
