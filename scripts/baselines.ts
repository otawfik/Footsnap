/**
 * The shipped model (last-season prior) against baselines, walk-forward, five leagues, two seasons.
 *
 *   npx vite-node scripts/baselines.ts -- <dir of {competition}-{seasonStartYear}.json matches files>
 *
 * Each match is forecast from results before its kick-off day only (lib/model.ts backtestCalls).
 * Baselines: always the home side; the league's H/D/A rates so far; a third each.
 */
import fs from 'node:fs';
import { backtestCalls, brier, pick, seasonPrior, COIN_BRIER } from '../lib/model';
const dir = process.argv.slice(2).filter((a) => a !== '--')[0];
const load = (c: number, y: number) => JSON.parse(fs.readFileSync(`${dir}/${c}-${y}.json`, 'utf8')).matches;
let n = 0, hit = 0, home = 0, rateHit = 0, bm = 0, br = 0, ll = 0, llr = 0;
for (const L of [2021, 2014, 2002, 2019, 2015]) for (const S of [2025, 2026]) {
  const games = load(L, S);
  const prior = seasonPrior(load(L, S - 1), games);
  for (const c of backtestCalls(games, 30, prior)) {
    n++; if (pick(c.p) === c.o) hit++; if (c.o === 'H') home++; if (pick(c.rates) === c.o) rateHit++;
    bm += brier(c.p, c.o); br += brier(c.rates, c.o);
    const q = (p: typeof c.p) => (c.o === 'H' ? p.home : c.o === 'D' ? p.draw : p.away);
    ll += -Math.log(Math.max(1e-9, q(c.p))); llr += -Math.log(Math.max(1e-9, q(c.rates)));
  }
}
const f = (x: number) => (100 * x).toFixed(1) + '%';
console.log(`matches ${n}`);
console.log(`accuracy  model ${f(hit / n)} | always home ${f(home / n)} | league-rate favourite ${f(rateHit / n)} | coin 33.3%`);
console.log(`Brier     model ${(bm / n).toFixed(4)} | league rates ${(br / n).toFixed(4)} | a third each ${COIN_BRIER.toFixed(4)}`);
console.log(`log loss  model ${(ll / n).toFixed(4)} | league rates ${(llr / n).toFixed(4)} | a third each ${Math.log(3).toFixed(4)}`);
console.log(`Brier improvement vs league rates ${f(1 - bm / br)} | vs a third each ${f(1 - bm / n / COIN_BRIER)}`);
