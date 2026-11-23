/**
 * The share card for a Beat the model matchday: what the image (lib/shareImage.ts) and the text
 * say. Built only from scored matches (lib/beat.ts ScoredMatch), so every number on it is one the
 * page already shows: your average Brier score and the model's on those matches, and each match.
 * Clubs appear as names and kit colours only: no crests, no photos.
 */
import { closer, type ScoredMatch } from './beat';
import type { Match } from './types';

export interface ShareRow {
  home: string;
  away: string;
  /** "2–1" */
  score: string;
  you: number;
  model: number;
  closer: 'you' | 'model' | 'level';
  /** home and away kit colours, already readable on the card's ground */
  tones: [string, string];
}

export interface ShareCard {
  /** "Premier League · Matchday 9" */
  title: string;
  /** scored matches behind the averages: all of them, including any not listed in `rows` */
  n: number;
  you: number;
  model: number;
  lead: 'you' | 'model' | 'level';
  youCloser: number;
  modelCloser: number;
  level: number;
  /** oldest kick-off first, at most `max` */
  rows: ShareRow[];
  /** scored matches counted in the averages but not listed */
  more: number;
}

const EPS = 1e-9;
const name = (t: Match['homeTeam']) => t.shortName ?? t.name;
export const brier3 = (x: number) => x.toFixed(3);

/** The card for these scored matches; null when there are none. */
export function shareCard(scored: ScoredMatch[], title: string, tones: (m: Match) => [string, string], max = 10): ShareCard | null {
  const n = scored.length;
  if (!n) return null;
  const sorted = scored.slice().sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate) || a.match.id - b.match.id);
  const you = sorted.reduce((s, r) => s + r.youBrier, 0) / n;
  const model = sorted.reduce((s, r) => s + r.modelBrier, 0) / n;
  const count = (who: ShareRow['closer']) => sorted.filter((r) => closer(r) === who).length;
  return {
    title,
    n,
    you,
    model,
    lead: Math.abs(you - model) <= EPS ? 'level' : you < model ? 'you' : 'model',
    youCloser: count('you'),
    modelCloser: count('model'),
    level: count('level'),
    rows: sorted.slice(0, max).map((r) => ({
      home: name(r.match.homeTeam),
      away: name(r.match.awayTeam),
      score: `${r.match.score.fullTime.home}–${r.match.score.fullTime.away}`,
      you: r.youBrier,
      model: r.modelBrier,
      closer: closer(r),
      tones: tones(r.match),
    })),
    more: Math.max(0, n - max),
  };
}

export const headline = (c: Pick<ShareCard, 'lead'>) => (c.lead === 'you' ? 'I beat the model' : c.lead === 'model' ? 'The model beat me' : 'Level with the model');

/** "I was closer on 4, the model on 2, 1 level." */
export const closerLine = (c: Pick<ShareCard, 'youCloser' | 'modelCloser' | 'level'>) =>
  `I was closer on ${c.youCloser}, the model on ${c.modelCloser}${c.level ? `, ${c.level} level` : ''}.`;

/** The card as a message, for sharing without an image and as the image's caption. */
export function shareText(c: ShareCard, url: string): string {
  return `${c.title}: ${headline(c).toLowerCase()}. My Brier score ${brier3(c.you)}, the FootSnap model's ${brier3(c.model)}, on ${c.n} ${c.n === 1 ? 'match' : 'matches'} (lower is better). ${closerLine(c)} ${url}`;
}
