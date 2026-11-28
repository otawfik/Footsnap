/**
 * Download the seasons the model evaluation runs on, through the app's own football-data.org proxy.
 *
 *   npx vite-node scripts/fetch-seasons.ts -- [dir=.cache/fd] [firstSeason=2023] [lastSeason=2026]
 *
 * Writes {competition}-{seasonStartYear}.json, the layout scripts/baselines.ts, beat-strategies.ts
 * and model-eval.ts read. Files already on disk are kept (finished seasons never change; delete the
 * current season's files to refresh them). One request every 7 seconds: the free tier allows ten a
 * minute, and the proxy's edge cache means most of these never reach football-data.org at all.
 * Seasons the free tier doesn't serve (403: anything before 2023-24) are reported and skipped.
 *
 * The free tier's three and a bit seasons are too few to tune anything on and still have matches
 * left to test with, so the development seasons come from football-data.co.uk's free results files
 * (the source scripts/inplay-backtest.ts already uses): {E0,SP1,D1,I1,F1}-{1314..2324}.csv go to
 * <dir>/../couk. Nothing from 2024-25 on is downloaded from there: those seasons are the test set,
 * and they're read from the app's own data.
 *
 * The cache directory is git-ignored: the data belongs to its sources, not to this repository.
 */
import fs from 'node:fs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dir = args[0] ?? '.cache/fd';
const first = Number(args[1] ?? 2023);
const last = Number(args[2] ?? 2026);
const BASE = process.env.FD_PROXY ?? 'https://footsnap-app.vercel.app/api/fd';
const LEAGUES = [2021, 2014, 2002, 2019, 2015];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  for (let y = first; y <= last; y++) {
    for (const L of LEAGUES) {
      const file = `${dir}/${L}-${y}.json`;
      if (fs.existsSync(file)) { console.log(`${L}-${y}: cached`); continue; }
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(`${BASE}?path=competitions/${L}/matches&season=${y}`);
        if (res.status === 429 && attempt < 5) { await sleep(30000); continue; }
        if (!res.ok) { console.log(`${L}-${y}: HTTP ${res.status}, skipped`); break; }
        const body = await res.json();
        fs.writeFileSync(file, JSON.stringify(body));
        const done = body.matches.filter((m: { status: string }) => m.status === 'FINISHED').length;
        console.log(`${L}-${y}: ${body.matches.length} matches, ${done} finished`);
        break;
      }
      await sleep(7000);
    }
  }
  const couk = `${dir}/../couk`;
  fs.mkdirSync(couk, { recursive: true });
  for (let y = 13; y <= 23; y++) {
    for (const L of ['E0', 'SP1', 'D1', 'I1', 'F1']) {
      const code = `${y}${y + 1}`;
      const file = `${couk}/${L}-${code}.csv`;
      if (fs.existsSync(file)) continue;
      const res = await fetch(`https://www.football-data.co.uk/mmz4281/${code}/${L}.csv`);
      if (!res.ok) { console.log(`${L}-${code}: HTTP ${res.status}, skipped`); continue; }
      const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
      fs.writeFileSync(file, text);
      console.log(`${L}-${code}: ${text.split(/\r?\n/).filter((l) => /^\w+,\d/.test(l)).length} rows`);
      await sleep(1500);
    }
  }
}
main();
