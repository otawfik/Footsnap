/**
 * Club colours for every squad player, for the Premium poster art: {playerId: {primary, secondary}}.
 * Uses the app's own colour parser so the art matches the cards. Reads through the app's proxy.
 *
 *   npx tsx scripts/art/colors.mts [baseUrl] > art-colors.json
 */
import { clubColors } from '../../lib/colors.ts';
import { LEAGUES } from '../../constants/leagues.ts';

const base = process.argv[2] ?? 'https://footsnap-app.vercel.app';
const out: Record<string, { primary: string; secondary: string }> = {};
for (const league of LEAGUES) {
  const r = await fetch(`${base}/api/fd/competitions/${league.id}/teams`);
  if (!r.ok) throw new Error(`teams ${league.id}: HTTP ${r.status}`);
  const d = await r.json();
  for (const t of d.teams) {
    const c = clubColors(t.clubColors);
    // a player in a league and the Champions League has the same club either way; the league wins
    for (const p of t.squad ?? []) out[String(p.id)] ??= { primary: c.primary, secondary: c.secondary };
  }
  await new Promise((done) => setTimeout(done, 7000)); // the free data tier allows 10 requests a minute
}
process.stdout.write(JSON.stringify(out));
