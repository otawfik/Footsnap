/**
 * The in-play model at half-time, backtested on football-data.co.uk results (free CSVs with
 * half-time scores, https://www.football-data.co.uk/data.php).
 *
 *   npx vite-node scripts/inplay-backtest.ts -- <dir of {E0,SP1,D1,I1,F1}-{2122..2627}.csv>
 *
 * Training seasons (2021-22 to 2023-24) give the first-half share of goals, the score-state
 * multipliers (second-half goals scored against expected, for the side ahead and the side behind
 * at half-time, from walk-forward forecasts in 2022-23 and 2023-24) and, for a baseline, how often
 * each half-time goal difference ended in a home win, draw or away win. Test seasons
 * (2024-25, 2025-26, 2026-27 to date): every match gets the shipped pre-match forecast, walk-forward
 * (lib/model.ts backtestCalls, last season's prior), then the in-play forecast at half-time from
 * that forecast and the half-time score. Scored against the 90-minute result.
 */
import fs from 'node:fs';
import { backtestCalls, brier, seasonPrior, type Outcome, type Prediction } from '../lib/model';
import { goalsLeft, inPlay, IN_PLAY, type Chances, type InPlayParams } from '../lib/inplay';
import type { Match } from '../lib/types';

const dir = process.argv.slice(2).filter((a) => a !== '--')[0];
const LEAGUES = ['E0', 'SP1', 'D1', 'I1', 'F1'];
const TRAIN = ['2122', '2223', '2324'];
const TEST = ['2425', '2526', '2627'];
const prev = (s: string) => `${String(Number(s.slice(0, 2)) - 1).padStart(2, '0')}${String(Number(s.slice(2)) - 1).padStart(2, '0')}`;

interface Row { home: string; away: string; date: string; fh: number; fa: number; hh: number; ha: number }
function rows(league: string, season: string): Row[] {
  const file = `${dir}/${league}-${season}.csv`;
  if (!fs.existsSync(file)) return [];
  const [head, ...lines] = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const cols = head.split(',');
  const ix = (k: string) => cols.indexOf(k);
  const out: Row[] = [];
  for (const line of lines) {
    const c = line.split(',');
    const [d, mo, y] = (c[ix('Date')] ?? '').split('/');
    const n = [c[ix('FTHG')], c[ix('FTAG')], c[ix('HTHG')], c[ix('HTAG')]].map(Number);
    if (!y || n.some((x) => !Number.isFinite(x)) || c[ix('FTHG')] === '') continue;
    const year = y.length === 2 ? `20${y}` : y;
    out.push({ home: c[ix('HomeTeam')], away: c[ix('AwayTeam')], date: `${year}-${mo}-${d}T${c[ix('Time')] || '15:00'}:00Z`, fh: n[0], fa: n[1], hh: n[2], ha: n[3] });
  }
  return out;
}

// team ids by name, shared across seasons so last season's strengths carry over
const ids = new Map<string, number>();
const id = (name: string) => ids.get(name) ?? (ids.set(name, ids.size + 1), ids.size);
let mid = 0;
const half = new Map<number, { hh: number; ha: number }>();
const toMatches = (rs: Row[]): Match[] =>
  rs.map((r) => {
    const m: Match = {
      id: ++mid,
      utcDate: r.date,
      status: 'FINISHED',
      homeTeam: { id: id(r.home), name: r.home },
      awayTeam: { id: id(r.away), name: r.away },
      score: { fullTime: { home: r.fh, away: r.fa }, halfTime: { home: r.hh, away: r.ha } },
    };
    half.set(m.id, { hh: r.hh, ha: r.ha });
    return m;
  });

// ---- training: the first-half share, and FT outcome rates by half-time goal difference
let firstHalfGoals = 0, goals = 0;
const byDiff = new Map<number, { H: number; D: number; A: number; n: number }>();
const clampDiff = (d: number) => Math.max(-3, Math.min(3, d));
for (const L of LEAGUES) for (const S of TRAIN) for (const r of rows(L, S)) {
  firstHalfGoals += r.hh + r.ha;
  goals += r.fh + r.fa;
  const d = clampDiff(r.hh - r.ha);
  const b = byDiff.get(d) ?? { H: 0, D: 0, A: 0, n: 0 };
  b[r.fh > r.fa ? 'H' : r.fh < r.fa ? 'A' : 'D']++;
  b.n++;
  byDiff.set(d, b);
}
const share = firstHalfGoals / goals;

// score state: walk-forward pre-match forecasts in the training seasons with a prior from the season before
const exposure = { ahead: { exp: 0, got: 0 }, behind: { exp: 0, got: 0 } };
for (const L of LEAGUES) for (const S of TRAIN.slice(1)) {
  const games = toMatches(rows(L, S));
  const prior = seasonPrior(toMatches(rows(L, prev(S))), games);
  for (const c of backtestCalls(games, 30, prior)) {
    const ht = half.get(c.match.id)!;
    if (ht.hh === ht.ha) continue;
    const left = goalsLeft(45, share);
    const [ahead, behind] = ht.hh > ht.ha ? ['home', 'away'] : ['away', 'home'];
    const got = (k: string) => (k === 'home' ? c.match.score.fullTime.home! - ht.hh : c.match.score.fullTime.away! - ht.ha);
    const exp = (k: string) => (k === 'home' ? c.p.xgHome : c.p.xgAway) * left;
    exposure.ahead.exp += exp(ahead); exposure.ahead.got += got(ahead);
    exposure.behind.exp += exp(behind); exposure.behind.got += got(behind);
  }
}
const fitted: InPlayParams = { firstHalfShare: share, ahead: exposure.ahead.got / exposure.ahead.exp, behind: exposure.behind.got / exposure.behind.exp };
const shipped = IN_PLAY;

// ---- test
const asPrediction = (c: Chances): Prediction => ({ ...c, xgHome: 0, xgAway: 0, score: [0, 0] });
const q = (p: Chances, o: Outcome) => (o === 'H' ? p.home : o === 'D' ? p.draw : p.away);
const models = [
  'pre-match model',
  'half-time score only (training rates)',
  'in-play: flat rate, 50/50 halves',
  'in-play: + first-half share',
  'in-play: + first-half share + score state',
  'in-play: shipped constants (lib/inplay.ts)',
] as const;
const score = models.map(() => ({ brier: 0, log: 0 }));
let n = 0;
// calibration of the shipped in-play model at half-time, binned; and by half-time state
const bins = Array.from({ length: 10 }, () => ({ said: 0, hit: 0, n: 0 }));
const state = new Map<string, { said: number; hit: number; n: number }>();
// second-half goals, expected vs scored, by who led at half-time (a score-state check)
const second = new Map<string, { exp: number; got: number; n: number }>();

for (const L of LEAGUES) for (const S of TEST) {
  const games = toMatches(rows(L, S));
  if (!games.length) continue;
  const prior = seasonPrior(toMatches(rows(L, prev(S))), games);
  for (const c of backtestCalls(games, 30, prior)) {
    const ht = half.get(c.match.id)!;
    const s = { home: ht.hh, away: ht.ha };
    const rate = byDiff.get(clampDiff(ht.hh - ht.ha))!;
    const forecasts: Chances[] = [
      c.p,
      { home: rate.H / rate.n, draw: rate.D / rate.n, away: rate.A / rate.n },
      inPlay(c.p, 45, s, { firstHalfShare: 0.5, ahead: 1, behind: 1 }),
      inPlay(c.p, 45, s, { firstHalfShare: share, ahead: 1, behind: 1 }),
      inPlay(c.p, 45, s, fitted),
      inPlay(c.p, 45, s, shipped),
    ];
    forecasts.forEach((f, k) => {
      score[k].brier += brier(asPrediction(f), c.o);
      score[k].log += -Math.log(Math.max(1e-9, q(f, c.o)));
    });
    n++;
    const f = forecasts[5];
    for (const o of ['H', 'D', 'A'] as Outcome[]) {
      const b = bins[Math.min(9, Math.floor(q(f, o) * 10))];
      b.said += q(f, o); b.n++; if (c.o === o) b.hit++;
    }
    const lead = ht.hh > ht.ha ? 'home ahead' : ht.hh < ht.ha ? 'away ahead' : 'level';
    const st = state.get(lead) ?? { said: 0, hit: 0, n: 0 };
    // the chance given to the side ahead winning (or, level, to the draw)
    const o: Outcome = lead === 'home ahead' ? 'H' : lead === 'away ahead' ? 'A' : 'D';
    st.said += q(f, o); st.n++; if (c.o === o) st.hit++;
    state.set(lead, st);
    const left = goalsLeft(45, shipped.firstHalfShare) ;
    const sideAhead = (k: 'home' | 'away') => (k === 'home' ? ht.hh > ht.ha : ht.ha > ht.hh) ? 'ahead' : (ht.hh === ht.ha ? 'level' : 'behind');
    for (const k of ['home', 'away'] as const) {
      const key = sideAhead(k);
      const g = second.get(key) ?? { exp: 0, got: 0, n: 0 };
      g.exp += (k === 'home' ? c.p.xgHome : c.p.xgAway) * left;
      g.got += k === 'home' ? c.match.score.fullTime.home! - ht.hh : c.match.score.fullTime.away! - ht.ha;
      g.n++;
      second.set(key, g);
    }
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`first-half share of goals, training seasons: ${pct(share)} (${goals} goals)`);
console.log(`score state, training: side ahead x${fitted.ahead.toFixed(3)}, side behind x${fitted.behind.toFixed(3)}`);
console.log(`shipped: ${JSON.stringify(shipped)}`);
console.log(`test matches (walk-forward, 30 results into each league season): ${n}\n`);
console.log('forecast'.padEnd(46), 'Brier'.padStart(7), 'log loss'.padStart(9));
models.forEach((m, k) => console.log(m.padEnd(46), (score[k].brier / n).toFixed(4).padStart(7), (score[k].log / n).toFixed(4).padStart(9)));
console.log('\ncalibration of the shipped in-play forecast at half-time (every H/D/A forecast, binned):');
for (const [i, b] of bins.entries()) if (b.n) console.log(`  ${(i * 10).toString().padStart(2)}-${i * 10 + 10}%  said ${pct(b.said / b.n).padStart(6)}  happened ${pct(b.hit / b.n).padStart(6)}  n=${b.n}`);
console.log('\nby half-time state (chance the leader wins / of a draw when level):');
for (const [k, s] of state) console.log(`  ${k.padEnd(11)} said ${pct(s.said / s.n)}  happened ${pct(s.hit / s.n)}  n=${s.n}`);
console.log('\nsecond-half goals per team, expected (before the score-state factors) vs scored, by half-time state:');
for (const [k, g] of second) console.log(`  ${k.padEnd(7)} expected ${(g.exp / g.n).toFixed(3)}  scored ${(g.got / g.n).toFixed(3)}  n=${g.n}`);
