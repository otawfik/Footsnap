/**
 * How long "What this result means" takes, and whether it behaves, on every finished league match
 * of the season so far (lib/impact.ts, 2 × 2,000 simulated seasons per match).
 *
 *   npx vite-node scripts/impact-timing.ts -- <dir of {competition}-{seasonStartYear}.json matches files> [season]
 *
 * Each match uses the fit the match page uses: results before its day, last season as the prior.
 * Reports the time per match page (median, 90th percentile, worst) and counts any side whose
 * chances moved the wrong way (a winner's title or top-four chance falling, its relegation chance rising).
 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fitSeason, seasonPrior } from '../lib/model';
import { isFinished } from '../lib/football';
import { hasImpact, resultImpact, IMPACT_RUNS } from '../lib/impact';
import type { Match } from '../lib/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dir = args[0];
const S = Number(args[1] ?? 2026);
const load = (c: number, y: number): Match[] => JSON.parse(fs.readFileSync(`${dir}/${c}-${y}.json`, 'utf8')).matches;
const times: number[] = [];
let wrong = 0, decided = 0, biggest = { d: 0, what: '' };
for (const L of [2021, 2014, 2002, 2019, 2015, 2001]) {
  const games = load(L, S);
  const prior = L === 2001 ? null : seasonPrior(load(L, S - 1), games);
  for (const m of games.filter((g) => hasImpact(g, L))) {
    const day = m.utcDate.slice(0, 10);
    const ratings = fitSeason(games.filter((g) => isFinished(g) && g.utcDate.slice(0, 10) < day), prior);
    if (!ratings) continue;
    const t0 = performance.now();
    const r = resultImpact(m, games, ratings, L)!;
    times.push(performance.now() - t0);
    const o = Math.sign(m.score.fullTime.home! - m.score.fullTime.away!);
    if (!o) continue;
    decided++;
    const [w, l] = o > 0 ? [r.home, r.away] : [r.away, r.home];
    const pc = (x: number) => (100 * x).toFixed(2);
    const say = (s: typeof w) => console.log(`  wrong way: ${L} ${m.homeTeam.name} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.name}, ${s.team.name}: title ${pc(s.before.title)}->${pc(s.after.title)}, top ${pc(s.before.top)}->${pc(s.after.top)}, relegation ${pc(s.before.relegation)}->${pc(s.after.relegation)}`);
    if (w.after.title < w.before.title || w.after.top < w.before.top || w.after.relegation > w.before.relegation) (wrong++, say(w));
    if (l.after.title > l.before.title || l.after.relegation < l.before.relegation) (wrong++, say(l));
    for (const s of [w, l]) for (const k of ['title', 'top', 'relegation'] as const) {
      const d = Math.abs(s.after[k] - s.before[k]);
      if (d > biggest.d) biggest = { d, what: `${L} md${m.matchday} ${m.homeTeam.name} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.name}: ${s.team.name} ${k} ${(100 * s.before[k]).toFixed(1)}% -> ${(100 * s.after[k]).toFixed(1)}%` };
    }
  }
}
times.sort((a, b) => a - b);
const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(0);
console.log(`matches ${times.length}, ${IMPACT_RUNS} runs each way`);
console.log(`ms per match page: median ${q(0.5)}, p90 ${q(0.9)}, worst ${times[times.length - 1].toFixed(0)}`);
console.log(`decided matches ${decided}, sides moved the wrong way ${wrong}`);
console.log(`biggest swing: ${biggest.what}`);
