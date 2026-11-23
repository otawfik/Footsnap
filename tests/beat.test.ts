import { describe, expect, it } from 'vitest';
import { applyConfidence, applyOutcome, CALIBRATION_MIN, closer, combine, competitionsOf, leader, LEVELS, ownCalibration, probs, scoreForecasts, strategies, type Forecast } from '../lib/beat';
import { backtestCalls, brier, COIN_BRIER, forecastBefore, outcome } from '../lib/model';
import type { Match } from '../lib/types';
import { season } from './simulate';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const fx = (id: number, iso: string, status: Match['status'] = 'TIMED'): Match => ({
  id,
  utcDate: iso,
  status,
  matchday: 9,
  homeTeam: { id: id * 10, name: `H${id}` },
  awayTeam: { id: id * 10 + 1, name: `A${id}` },
  score: { fullTime: { home: null, away: null } },
});

// a finished season from known strengths: the last few matches carry the forecasts
const matches = season([1.7, 1.5, 1.3, 1.1, 1.0, 0.9, 0.85, 0.8, 0.75, 0.7], [0.7, 0.75, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.25, 1.3], { seed: 9 });
const before = (m: Match) => new Date(m.utcDate).getTime() - 3_600_000;
const forecast = (m: Match, o: Forecast['outcome'], confidence: number, at = before(m)): Forecast => ({ matchId: m.id, competitionId: 2021, outcome: o, confidence, at });

describe('your forecast', () => {
  it('puts your confidence on the call and splits the rest evenly', () => {
    for (const { p } of LEVELS) {
      for (const o of ['H', 'D', 'A'] as const) {
        const f = probs(o, p);
        expect(f.home + f.draw + f.away).toBeCloseTo(1);
        expect(o === 'H' ? f.home : o === 'D' ? f.draw : f.away).toBe(p);
      }
    }
    expect(probs('A', 0.7)).toEqual({ home: 0.15000000000000002, draw: 0.15000000000000002, away: 0.7 });
  });

  it('is scored with the Brier score: Lean right 0.375, Lean wrong 0.875, Sure right 0.015, Sure wrong 1.715', () => {
    expect(brier(probs('H', 0.5), 'H')).toBeCloseTo(0.375);
    expect(brier(probs('H', 0.5), 'A')).toBeCloseTo(0.875);
    expect(brier(probs('H', 0.9), 'H')).toBeCloseTo(0.015);
    expect(brier(probs('H', 0.9), 'D')).toBeCloseTo(1.715);
  });
});

describe('making a forecast', () => {
  const open = fx(1, '2026-10-31T15:00:00Z');
  const started = fx(2, '2026-10-28T11:00:00Z', 'IN_PLAY');
  const kickedOffNoUpdate = fx(3, '2026-10-28T11:00:00Z', 'TIMED');

  it('calls, re-calls keeping the confidence, changes confidence, and clears on the same call', () => {
    let all: Record<string, Forecast> = {};
    all = applyOutcome(all, open, 2021, 'H', NOW);
    expect(all['1']).toEqual({ matchId: 1, competitionId: 2021, outcome: 'H', confidence: 0.5, at: NOW });
    all = applyConfidence(all, open, 0.9, NOW + 1);
    expect(all['1'].confidence).toBe(0.9);
    expect(all['1'].at).toBe(NOW + 1);
    all = applyOutcome(all, open, 2021, 'A', NOW + 2);
    expect(all['1']).toMatchObject({ outcome: 'A', confidence: 0.9, at: NOW + 2 });
    all = applyOutcome(all, open, 2021, 'A', NOW + 3);
    expect(all['1']).toBeUndefined();
  });

  it('needs a call before a confidence', () => {
    const all = {};
    expect(applyConfidence(all, open, 0.7, NOW)).toBe(all);
  });

  it('locks at kick-off, whether or not the feed has caught up', () => {
    const all: Record<string, Forecast> = { '2': forecast(started, 'H', 0.5, NOW - 7_200_000) };
    expect(applyOutcome(all, started, 2021, 'A', NOW)).toBe(all);
    expect(applyConfidence(all, started, 0.9, NOW)).toBe(all);
    expect(applyOutcome({}, kickedOffNoUpdate, 2021, 'H', NOW)).toEqual({});
    expect(applyOutcome({}, open, 2021, 'H', Date.parse(open.utcDate))).toEqual({});
  });
});

describe('scoring you against the model', () => {
  const late = matches.slice(-8);

  it('scores only finished matches forecast before kick-off, with the same model forecast the backtest uses', () => {
    const upcoming = { ...fx(999, '2030-01-01T15:00:00Z'), id: 999 };
    const elsewhere: Forecast = { matchId: 123456, competitionId: 2014, outcome: 'H', confidence: 0.5, at: 0 };
    const fs = [
      ...late.slice(0, 6).map((m, i) => forecast(m, (['H', 'D', 'A'] as const)[i % 3], LEVELS[i % 3].p)),
      forecast(late[6], 'H', 0.9, new Date(late[6].utcDate).getTime()), // made at kick-off: not scored
      { ...forecast(upcoming, 'H', 0.5), at: NOW },
      elsewhere,
    ];
    const r = scoreForecasts(fs, [...matches, upcoming]);
    expect(r.n).toBe(6);
    expect(r.late).toBe(1);
    expect(r.waiting).toBe(1);
    expect(r.noModel).toBe(0);
    expect(r.youCloser + r.modelCloser + r.level).toBe(6);

    // the model side is exactly what "How good is the model?" scores for the same match
    const calls = new Map(backtestCalls(matches, 30).map((c) => [c.match.id, c]));
    for (const row of r.rows) {
      const c = calls.get(row.match.id)!;
      expect(row.model.home).toBeCloseTo(c.p.home, 9);
      expect(row.model.away).toBeCloseTo(c.p.away, 9);
      expect(row.modelBrier).toBeCloseTo(brier(c.p, c.o), 9);
      expect(row.o).toBe(outcome(row.match));
    }
    const mean = r.rows.reduce((s, x) => s + x.youBrier, 0) / 6;
    expect(r.you).toBeCloseTo(mean);
    // newest first
    expect(r.rows.map((x) => x.match.utcDate)).toEqual([...r.rows.map((x) => x.match.utcDate)].sort().reverse());
  });

  it("doesn't score a match the model couldn't forecast yet", () => {
    const first = matches.slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate))[0];
    expect(forecastBefore(matches, first)).toBeNull();
    const r = scoreForecasts([forecast(first, 'H', 0.5)], matches);
    expect(r).toMatchObject({ n: 0, noModel: 1, you: null, model: null });
    expect(leader(r)).toBeNull();
  });

  it('names the leader by the lower mean Brier', () => {
    expect(leader({ you: 0.5, model: 0.6 })).toBe('you');
    expect(leader({ you: 0.6, model: 0.5 })).toBe('model');
    expect(leader({ you: 0.5, model: 0.5 })).toBe('level');
  });
});

describe('simple strategies on a past season', () => {
  const calls = backtestCalls(matches, 30);
  const s = strategies(calls);

  it('scores each strategy with the Brier score, best first', () => {
    expect(s.map((x) => x.brier)).toEqual([...s.map((x) => x.brier)].sort((a, b) => a - b));
    const homeRate = calls.filter((c) => c.o === 'H').length / calls.length;
    expect(s.find((x) => x.label.startsWith('Home win, Lean'))!.brier).toBeCloseTo(0.375 * homeRate + 0.875 * (1 - homeRate));
    expect(s.find((x) => x.label === 'A third each')!.brier).toBe(COIN_BRIER);
    expect(s.filter((x) => x.model)).toHaveLength(1);
  });

  it('the model beats knowing nothing when teams differ', () => {
    expect(s.find((x) => x.model)!.brier).toBeLessThan(COIN_BRIER);
  });

  it('is empty with no calls', () => {
    expect(strategies([])).toEqual([]);
  });
});

describe('one record across competitions', () => {
  // a second competition: the same kind of season with other ids, so nothing collides
  const other = season([1.4, 1.2, 1.0, 0.9, 0.8, 0.7], [0.8, 0.9, 1.0, 1.0, 1.1, 1.2], { seed: 4 }).map((m) => ({
    ...m,
    id: m.id + 5000,
    homeTeam: { ...m.homeTeam, id: m.homeTeam.id + 500 },
    awayTeam: { ...m.awayTeam, id: m.awayTeam.id + 500 },
  }));
  const here = matches.slice(-6).map((m, i) => forecast(m, (['H', 'D', 'A'] as const)[i % 3], LEVELS[i % 3].p));
  const there = other.slice(-3).map((m) => ({ ...forecast(m, 'H', 0.9), competitionId: 2014 }));
  const all = [...here, ...there, forecast(fx(999, '2030-01-01T15:00:00Z'), 'H', 0.5, NOW)];
  const a = scoreForecasts(all, [...matches, fx(999, '2030-01-01T15:00:00Z')]);
  const b = scoreForecasts(all, other);

  it('scores each competition on its own matches only', () => {
    expect(a.n).toBe(6);
    expect(b.n).toBe(3);
    expect(a.waiting).toBe(1);
  });

  it('counts every scored match once: the averages are over matches, not over competitions', () => {
    const r = combine([a, b]);
    expect(r.n).toBe(9);
    expect(r.you).toBeCloseTo((a.you! * 6 + b.you! * 3) / 9);
    expect(r.model).toBeCloseTo((a.model! * 6 + b.model! * 3) / 9);
    expect(r.you).not.toBeCloseTo((a.you! + b.you!) / 2, 6);
    expect(r.youCloser).toBe(a.youCloser + b.youCloser);
    expect(r.modelCloser).toBe(a.modelCloser + b.modelCloser);
    expect(r.youCloser + r.modelCloser + r.level).toBe(9);
    expect(r.waiting).toBe(1);
    expect(r.rows.map((x) => x.match.utcDate)).toEqual([...r.rows.map((x) => x.match.utcDate)].sort().reverse());
  });

  it('is the one record when there is one, and empty with none', () => {
    expect(combine([a])).toEqual(a);
    expect(combine([])).toMatchObject({ n: 0, you: null, model: null, rows: [], waiting: 0 });
    expect(leader(combine([]))).toBeNull();
  });

  it('lists the competitions you have calls in, in the app\'s order, ignoring ones it doesn\'t know', () => {
    expect(competitionsOf([...there, ...here, { ...here[0], competitionId: 77 }], [2021, 2014, 2002])).toEqual([2021, 2014]);
    expect(competitionsOf([], [2021, 2014])).toEqual([]);
  });

  it('says who was closer on a match, level within rounding', () => {
    expect(closer({ youBrier: 0.375, modelBrier: 0.5 })).toBe('you');
    expect(closer({ youBrier: 0.875, modelBrier: 0.5 })).toBe('model');
    expect(closer({ youBrier: 0.1 + 0.2, modelBrier: 0.3 })).toBe('level');
  });
});

describe('how often your calls came true', () => {
  const row = (confidence: number, right: boolean) => ({ call: 'H' as const, confidence, o: right ? ('H' as const) : ('A' as const) });
  const rows = [
    ...Array.from({ length: 9 }, (_, i) => row(0.9, i < 6)),
    ...Array.from({ length: 4 }, (_, i) => row(0.5, i < 1)),
  ];

  it('counts right calls at each confidence used: Sure right 6 of 9', () => {
    expect(ownCalibration(rows)).toEqual([
      { label: 'Lean', p: 0.5, n: 4, right: 1 },
      { label: 'Sure', p: 0.9, n: 9, right: 6 },
    ]);
  });

  it('says nothing until enough calls are scored', () => {
    expect(ownCalibration(rows.slice(0, CALIBRATION_MIN - 1))).toBeNull();
    expect(ownCalibration(rows.slice(0, CALIBRATION_MIN))).not.toBeNull();
    expect(ownCalibration([])).toBeNull();
  });

  it('reads the call and confidence scoreForecasts recorded', () => {
    const fs = matches.slice(-CALIBRATION_MIN).map((m) => forecast(m, outcome(m), 0.7));
    const r = scoreForecasts(fs, matches);
    expect(r.rows.every((x) => x.call === x.o && x.confidence === 0.7)).toBe(true);
    expect(ownCalibration(r.rows)).toEqual([{ label: 'Likely', p: 0.7, n: CALIBRATION_MIN, right: CALIBRATION_MIN }]);
  });
});
