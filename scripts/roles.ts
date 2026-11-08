/**
 * How the Duel abilities spread over every card: npx vite-node scripts/roles.ts -- <data dir>
 * Prints each role's share, a few examples, and any card whose "why" fails checkWhy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCards } from '../lib/cards';
import { duelAbility, checkWhy } from '../lib/abilities';
const dir = process.argv[2];
const COMPS: [number, string, string | undefined][] = [[2021, 'Premier League', 'England'], [2014, 'La Liga', 'Spain'], [2002, 'Bundesliga', 'Germany'], [2019, 'Serie A', 'Italy'], [2015, 'Ligue 1', 'France']];
const roles = new Map<string, number>(); let n = 0, bad = 0; const ex: string[] = [];
for (const [id, name, nation] of COMPS) {
  const teams = JSON.parse(fs.readFileSync(path.join(dir, `teams_${id}.json`), 'utf8')).teams;
  const scorers = JSON.parse(fs.readFileSync(path.join(dir, `scorers_${id}.json`), 'utf8')).scorers ?? [];
  for (const c of buildCards(teams, scorers, name, nation).values()) {
    const a = duelAbility(c); n++;
    const g = a.role.startsWith('profile') || a.role.startsWith('trait') ? a.role : a.role.split('-')[0] + (a.role.endsWith('variant') ? '-variant' : '');
    roles.set(g, (roles.get(g) ?? 0) + 1);
    const w = checkWhy(c, a); if (w) { bad++; if (bad < 4) console.log('BAD', c.name, w); }
    if (a.role.startsWith('profile') && ex.length < 8) ex.push(`${c.name} (${c.team.shortName}): ${a.why}`);
  }
}
console.log(n, 'cards,', bad, 'failing checkWhy');
for (const [k, v] of [...roles].sort((a, b) => b[1] - a[1])) console.log(k.padEnd(20), v, ((100 * v) / n).toFixed(1) + '%');
console.log(ex.join('\n'));
