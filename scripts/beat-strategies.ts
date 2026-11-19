/**
 * Beat the model's "last season" table across the five leagues: simple ways of filling in the
 * page against the shipped model, walk-forward (lib/beat.ts strategies on lib/model.ts backtestCalls).
 *
 *   npx vite-node scripts/beat-strategies.ts -- <dir of {competition}-{seasonStartYear}.json matches files> [season]
 *
 * Each match is forecast from results before its kick-off day only, after a league's first 30
 * results; each league starts from the season before, as the app does. The default season is 2025 (2025-26).
 */
import fs from 'node:fs';
import { backtestCalls, seasonPrior, type Call } from '../lib/model';
import { strategies } from '../lib/beat';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dir = args[0];
const S = Number(args[1] ?? 2025);
const load = (c: number, y: number) => JSON.parse(fs.readFileSync(`${dir}/${c}-${y}.json`, 'utf8')).matches;
const all: Call[] = [];
for (const L of [2021, 2014, 2002, 2019, 2015]) {
  const games = load(L, S);
  const calls = backtestCalls(games, 30, seasonPrior(load(L, S - 1), games));
  all.push(...calls);
  console.log(`${L}: ${games.length} matches, ${calls.length} scored | ${strategies(calls).map((s) => `${s.label} ${s.brier.toFixed(3)}`).join(' | ')}`);
}
console.log(`\nfive leagues, ${S}-${String(S + 1).slice(2)}: ${all.length} matches`);
for (const s of strategies(all)) console.log(`  ${s.brier.toFixed(4)}  ${s.label}`);
console.log(`  home win rate ${(100 * all.filter((c) => c.o === 'H').length / all.length).toFixed(1)}%`);
