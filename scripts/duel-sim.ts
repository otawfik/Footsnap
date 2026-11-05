/**
 * Duel balance simulation: AI against AI over thousands of seeded games, on real
 * competition data (football-data teams + scorers JSON, as the app's proxy serves it).
 *
 *   npx vite-node scripts/duel-sim.ts -- <data dir> [games per competition]
 *
 * The data dir holds teams_<id>.json and scorers_<id>.json. Each pair of games: a random
 * 70-card "collection" from the competition, decks built the way the lobby builds them
 * (buildDeck / opponentDeck), three stadiums picked the way the lobby picks them, both
 * seats played by aiPlays; then the same seed again with the decks swapped, so deck
 * quality cancels out and what's left is the seat. Reports win rates by seat, by who
 * reveals first, by archetype and ability role (per card revealed), by stadium twist
 * (and archetype at each twist), and for home cards. It also checks every real card's
 * ability "why" line against its data. Target: everything within 50 ± 8%.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCards, PlayerCard } from '../lib/cards';
import { buildDeck, opponentDeck } from '../lib/decks';
import { aiPlays, canSnap, cardStats, endTurn, firstToReveal, GameState, Side, isHome, newGame, play, result, retreat, snap, ZONES } from '../lib/game';
import { pickStadiums, stadiumPool, TwistId, TWISTS } from '../lib/stadiums';
import { hash, rng } from '../lib/rng';
import { checkWhy } from '../lib/abilities';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dir = args[0];
const per = Number(args[1] ?? 1000);
const COMPS: [number, string, string | undefined][] = [
  [2021, 'Premier League', 'England'],
  [2014, 'La Liga', 'Spain'],
  [2002, 'Bundesliga', 'Germany'],
  [2019, 'Serie A', 'Italy'],
  [2015, 'Ligue 1', 'France'],
];

type Tally = { n: number; w: number };
const add = (m: Map<string, Tally>, k: string, w: number) => {
  const t = m.get(k) ?? { n: 0, w: 0 };
  t.n++;
  t.w += w;
  m.set(k, t);
};
const pct = (t: Tally) => (100 * t.w) / t.n;

const seat: Tally = { n: 0, w: 0 };
const first1: Tally = { n: 0, w: 0 };
const first6: Tally = { n: 0, w: 0 };
const firstMost: Tally = { n: 0, w: 0 };
const byTwistFirst = new Map<string, Tally>();
const byTwistArch = new Map<string, Tally>();
const byRole = new Map<string, Tally>();
const byArch = new Map<string, Tally>();
const byTwistSeat = new Map<string, Tally>();
const byTwistHome = new Map<string, Tally>();
const home: Tally = { n: 0, w: 0 };
let draws = 0;
let retreats = 0;
let crowdFires = 0;
let games = 0;
let whyBad = 0;
let whyChecked = 0;
const t0 = Date.now();

function playAi(s: GameState, seed: number, firsts: Side[]): GameState {
  while (!s.over) {
    firsts.push(firstToReveal(s));
    const m = aiPlays(s, hash(`${seed}:you:${s.turn}`), 'you');
    if (m.retreat) return retreat(s, 'you');
    if (m.snap && canSnap(s, 'you')) s = snap(s, 'you');
    for (const p of m.plays) s = play(s, 'you', p.cardId, p.zone);
    s = endTurn(s);
  }
  return s;
}

for (const [id, name, nation] of COMPS) {
  const teams = JSON.parse(fs.readFileSync(path.join(dir, `teams_${id}.json`), 'utf8')).teams;
  const scorers = JSON.parse(fs.readFileSync(path.join(dir, `scorers_${id}.json`), 'utf8')).scorers ?? [];
  const list = [...buildCards(teams, scorers, name, nation).values()];
  for (const c of list) {
    whyChecked++;
    const bad = checkWhy(c, cardStats(c).effect!);
    if (bad) {
      whyBad++;
      if (whyBad <= 5) console.log('WHY MISMATCH', c.name, bad);
    }
  }
  const pool = stadiumPool(teams);
  for (let g = 0; g < per; g++) {
    const seed = hash(`${id}:${g}`);
    const r = rng(seed);
    const own = list.filter(() => r() < 70 / list.length);
    const you = buildDeck(own, list, seed).cards;
    const opp = opponentDeck(you, list, seed);
    if (you.length !== 12 || opp.length !== 12) continue;
    const stadiums = pickStadiums(pool, [you, opp], seed);
    for (const [a, b] of [[you, opp], [opp, you]]) {
    const firsts: Side[] = [];
    const s = playAi(newGame({ you: a, opponent: b, seed, stadiums }), seed, firsts);
    const res = result(s);
    games++;
    const w = res.winner === 'you' ? 1 : res.winner === 'draw' ? 0.5 : 0;
    if (res.winner === 'draw') draws++;
    if (res.retreated) retreats++;
    seat.n++;
    seat.w += w;
    const sideW = (x: Side) => (x === 'you' ? w : 1 - w);
    first1.n++;
    first1.w += sideW(firsts[0]);
    if (firsts.length >= 6) {
      first6.n++;
      first6.w += sideW(firsts[5]);
    }
    const youFirst = firsts.filter((x) => x === 'you').length;
    if (youFirst * 2 !== firsts.length) {
      firstMost.n++;
      firstMost.w += sideW(youFirst * 2 > firsts.length ? 'you' : 'opponent');
    }
    for (const z of ZONES) {
      const tw = s.stadiums[z].twist;
      add(byTwistSeat, tw, w);
      add(byTwistFirst, tw, sideW(firsts[0]));
      for (const side of ['you', 'opponent'] as const) {
        const sw = side === 'you' ? w : 1 - w;
        const homes = s.zones[z][side].filter((c) => isHome(s, z, c.card)).length;
        const foeHomes = s.zones[z][side === 'you' ? 'opponent' : 'you'].filter((c) => isHome(s, z, c.card)).length;
        crowdFires += homes;
        if (homes > foeHomes) {
          const zw = res.zones[z] === side ? 1 : res.zones[z] === 'tie' ? 0.5 : 0;
          add(byTwistHome, tw, zw);
          home.n++;
          home.w += zw;
        }
        for (const c of s.zones[z][side]) {
          const e = c.stats.effect!;
          add(byRole, e.signature ? 'signature' : `${e.role} (${e.title.replace(/^(Golden Boot leader|Joint top scorer)$/, 'Top scorer')})`.replace(/-variant \(.*\)$/, `-variant: ${e.title}`), sw);
          add(byArch, e.archetype, sw);
          add(byTwistArch, `${tw}:${e.archetype}`, res.zones[z] === side ? 1 : res.zones[z] === 'tie' ? 0.5 : 0);
        }
      }
    }
    }
  }
}

const line = (k: string, t: Tally) => `  ${k.padEnd(44)} ${pct(t).toFixed(1).padStart(5)}%   n=${t.n}`;
console.log(`\n${games} games in ${((Date.now() - t0) / 1000).toFixed(0)} s · draws ${((100 * draws) / games).toFixed(1)}% · retreats ${((100 * retreats) / games).toFixed(1)}% · home cards played per game ${(crowdFires / games).toFixed(2)}`);
console.log(`ability "why" lines checked against the data: ${whyChecked}, mismatches ${whyBad}`);
console.log(`\nSeat ('you', decks mirrored): ${pct(seat).toFixed(1)}%`);
console.log(`First to reveal on turn 1 (a coin toss): ${pct(first1).toFixed(1)}%   n=${first1.n}`);
console.log(`First to reveal on turn 6 (the side ahead): ${pct(first6).toFixed(1)}%   n=${first6.n}`);
console.log(`First to reveal on most turns: ${pct(firstMost).toFixed(1)}%   n=${firstMost.n}`);
console.log('\nBy archetype (win rate of the side, per card revealed):');
for (const [k, t] of [...byArch].sort()) console.log(line(k, t));
console.log('\nBy ability role (per card revealed):');
for (const [k, t] of [...byRole].sort((a, b) => pct(b[1]) - pct(a[1]))) console.log(line(k, t));
console.log('\nBy stadium twist: win rate of the turn-1 first revealer in games with it, then zone win rate there by archetype (per card):');
const ARCHS = ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'];
console.log(`  ${''.padEnd(16)} ${'1st'.padStart(6)} ${ARCHS.map((a) => a.slice(0, 3).padStart(6)).join(' ')}`);
for (const [k, t] of [...byTwistFirst].sort()) {
  const cells = ARCHS.map((a) => {
    const x = byTwistArch.get(`${k}:${a}`);
    return (x ? pct(x).toFixed(1) : '-').padStart(6);
  });
  console.log(`  ${TWISTS[k as TwistId].name.padEnd(16)} ${pct(t).toFixed(1).padStart(6)} ${cells.join(' ')}   n=${t.n}`);
}
console.log('\nHome crowd: zone win rate of the side with more home cards there:');
console.log(line('all stadiums', home));
for (const [k, t] of [...byTwistHome].sort()) console.log(line(`  at a ${TWISTS[k as TwistId].name} ground`, t));
