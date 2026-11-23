import { describe, expect, it } from 'vitest';
import { LEVELS, scoreForecasts, type Forecast } from '../lib/beat';
import { brier3, closerLine, headline, shareCard, shareText } from '../lib/share';
import { cardHeight } from '../lib/shareImage';
import type { Match } from '../lib/types';
import { season } from './simulate';

const matches = season([1.7, 1.5, 1.3, 1.1, 1.0, 0.9, 0.85, 0.8, 0.75, 0.7], [0.7, 0.75, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.25, 1.3], { seed: 9 });
const forecasts: Forecast[] = matches.slice(-12).map((m, i) => ({
  matchId: m.id,
  competitionId: 2021,
  outcome: (['H', 'D', 'A'] as const)[i % 3],
  confidence: LEVELS[i % 3].p,
  at: new Date(m.utcDate).getTime() - 3_600_000,
}));
const record = scoreForecasts(forecasts, matches);
const tones = (m: Match): [string, string] => [`#${String(m.homeTeam.id).padStart(6, '0')}`, `#${String(m.awayTeam.id).padStart(6, '0')}`];
const URL = 'https://example.test/beat';

describe('the share card', () => {
  const card = shareCard(record.rows, 'Premier League · Matchday 9', tones)!;

  it('carries the record of exactly these matches: the same averages and counts the page shows', () => {
    expect(card.n).toBe(12);
    expect(card.you).toBeCloseTo(record.you!, 12);
    expect(card.model).toBeCloseTo(record.model!, 12);
    expect([card.youCloser, card.modelCloser, card.level]).toEqual([record.youCloser, record.modelCloser, record.level]);
    expect(card.lead).toBe(record.you! < record.model! ? 'you' : 'model');
    expect(card.title).toBe('Premier League · Matchday 9');
  });

  it('lists matches in kick-off order with their real score and both Brier scores, in kit colours', () => {
    const byKickOff = record.rows.slice().reverse();
    expect(card.rows).toHaveLength(10);
    expect(card.more).toBe(2);
    card.rows.forEach((r, i) => {
      const s = byKickOff[i];
      expect(r).toEqual({
        home: s.match.homeTeam.name,
        away: s.match.awayTeam.name,
        score: `${s.match.score.fullTime.home}–${s.match.score.fullTime.away}`,
        you: s.youBrier,
        model: s.modelBrier,
        closer: s.youBrier < s.modelBrier ? 'you' : 'model',
        tones: tones(s.match),
      });
    });
  });

  it('a subset is averaged over that subset only', () => {
    const three = record.rows.slice(0, 3);
    const c = shareCard(three, 'T', tones)!;
    expect(c.n).toBe(3);
    expect(c.more).toBe(0);
    expect(c.you).toBeCloseTo(three.reduce((s, r) => s + r.youBrier, 0) / 3, 12);
    expect(c.model).toBeCloseTo(three.reduce((s, r) => s + r.modelBrier, 0) / 3, 12);
  });

  it("isn't made from nothing", () => {
    expect(shareCard([], 'T', tones)).toBeNull();
  });

  it('uses short club names when the feed has them', () => {
    const r = { ...record.rows[0], match: { ...record.rows[0].match, homeTeam: { ...record.rows[0].match.homeTeam, shortName: 'Short' } } };
    expect(shareCard([r], 'T', tones)!.rows[0].home).toBe('Short');
  });

  it('says it in words with the same numbers, and never claims a win it isn\'t', () => {
    const t = shareText(card, URL);
    expect(t).toContain(brier3(card.you));
    expect(t).toContain(brier3(card.model));
    expect(t).toContain('on 12 matches');
    expect(t).toContain(closerLine(card));
    expect(t.endsWith(URL)).toBe(true);
    expect(headline({ lead: 'you' })).toBe('I beat the model');
    expect(headline({ lead: 'model' })).toBe('The model beat me');
    expect(headline({ lead: 'level' })).toBe('Level with the model');
    expect(t.toLowerCase()).toContain(headline(card).toLowerCase());
    expect(shareText({ ...card, n: 1 }, URL)).toContain('on 1 match (');
    expect(closerLine({ youCloser: 4, modelCloser: 2, level: 1 })).toBe('I was closer on 4, the model on 2, 1 level.');
  });

  it('the image grows with its rows', () => {
    const one = shareCard(record.rows.slice(0, 1), 'T', tones)!;
    expect(cardHeight(card)).toBeGreaterThan(cardHeight(one));
    expect(cardHeight(card) - cardHeight({ rows: card.rows, more: 0 })).toBe(64);
  });
});
