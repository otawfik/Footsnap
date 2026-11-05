/**
 * Custom decks against the AI: does opponentDeck still balance against decks people
 * build, and is Auto-fill neither strictly dominated nor dominant?
 *
 *   npx vite-node scripts/deck-sim.ts -- <data dir> [seeds per competition]
 *
 * For each seed: a random 70-card collection, the next duel's grounds picked the way
 * the lobby picks them (leaning on the collection), and four decks from it, each resolved
 * the way the editor resolves them (your picks, loans in the empty slots):
 *   auto    Auto-fill (buildDeck)
 *   random  12 random owned cards: any legal deck, no thought
 *   home    the ground stacker: owned cards that play at the next grounds first (by
 *           Power), then the strongest of the rest, no curve
 *   greedy  the 12 strongest owned cards, no curve
 * Then (a) each deck against opponentDeck of itself (the real AI matchup), and (b) each
 * custom deck head to head against Auto-fill. Every game is played twice with the seats
 * swapped, both seats by aiPlays. Target: (a) within 50 ± 8% for every deck; (b) Auto-fill
 * within 50 ± 8% against the sensible custom decks (home, greedy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCards, PlayerCard } from '../lib/cards';
import { buildDeck, opponentDeck, resolveDeck } from '../lib/decks';
import { aiPlays, canSnap, cardStats, endTurn, GameState, newGame, play, result, retreat } from '../lib/game';
import { pickStadiums, Stadium, stadiumPool } from '../lib/stadiums';
import { hash, rng } from '../lib/rng';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dir = args[0];
const per = Number(args[1] ?? 400);
const COMPS: [number, string, string | undefined][] = [
  [2021, 'Premier League', 'England'],
  [2014, 'La Liga', 'Spain'],
  [2002, 'Bundesliga', 'Germany'],
  [2019, 'Serie A', 'Italy'],
  [2015, 'Ligue 1', 'France'],
];

function playAi(s: GameState, seed: number): GameState {
  while (!s.over) {
    const m = aiPlays(s, hash(`${seed}:you:${s.turn}`), 'you');
    if (m.retreat) return retreat(s, 'you');
    if (m.snap && canSnap(s, 'you')) s = snap(s);
    for (const p of m.plays) s = play(s, 'you', p.cardId, p.zone);
    s = endTurn(s);
  }
  return s;
}
// local alias so the loop above reads plainly
import { snap as snapFor } from '../lib/game';
const snap = (s: GameState) => snapFor(s, 'you');

/** a's score (1 win, ½ draw) over both seatings */
function pair(a: PlayerCard[], b: PlayerCard[], seed: number, stadiums: Stadium[] | undefined): number {
  let t = 0;
  for (const flip of [false, true]) {
    const s = playAi(newGame({ you: flip ? b : a, opponent: flip ? a : b, seed, stadiums }), seed);
    const w = result(s).winner;
    const aWon = w === (flip ? 'opponent' : 'you');
    t += w === 'draw' ? 0.5 : aWon ? 1 : 0;
  }
  return t;
}

const KINDS = ['auto', 'random', 'home', 'greedy'] as const;
type Kind = (typeof KINDS)[number];
const vsAi: Record<Kind, { n: number; w: number }> = { auto: { n: 0, w: 0 }, random: { n: 0, w: 0 }, home: { n: 0, w: 0 }, greedy: { n: 0, w: 0 } };
const vsAuto: Record<Kind, { n: number; w: number }> = { auto: { n: 0, w: 0 }, random: { n: 0, w: 0 }, home: { n: 0, w: 0 }, greedy: { n: 0, w: 0 } };
const homeCards: Record<Kind, number> = { auto: 0, random: 0, home: 0, greedy: 0 };
const power: Record<Kind, number> = { auto: 0, random: 0, home: 0, greedy: 0 };
let seeds = 0;
const t0 = Date.now();

for (const [id, name, nation] of COMPS) {
  const teams = JSON.parse(fs.readFileSync(path.join(dir, `teams_${id}.json`), 'utf8')).teams;
  const scorers = JSON.parse(fs.readFileSync(path.join(dir, `scorers_${id}.json`), 'utf8')).scorers ?? [];
  const list = [...buildCards(teams, scorers, name, nation).values()];
  const pool = stadiumPool(teams);
  for (let g = 0; g < per; g++) {
    const seed = hash(`decks:${id}:${g}`);
    const r = rng(seed);
    const own = list.filter(() => r() < 70 / list.length);
    if (own.length < 12) continue;
    const grounds = pool.length >= 3 ? pickStadiums(pool, [own], seed) : undefined;
    const isHome = (c: PlayerCard) => !!grounds?.some((st) => st.clubs.includes(c.team.id));
    const byPower = own.slice().sort((a, b) => cardStats(b).power - cardStats(a).power || a.id - b.id);
    const deckSeed = hash(`deck:${id}`);
    const picks: Record<Kind, number[]> = {
      auto: [],
      random: own
        .map((c) => ({ c, k: r() }))
        .sort((a, b) => a.k - b.k)
        .slice(0, 12)
        .map((x) => x.c.id),
      home: [...byPower.filter(isHome), ...byPower.filter((c) => !isHome(c))].slice(0, 12).map((c) => c.id),
      greedy: byPower.slice(0, 12).map((c) => c.id),
    };
    const decks = {} as Record<Kind, PlayerCard[]>;
    for (const k of KINDS) decks[k] = k === 'auto' ? buildDeck(own, list, deckSeed).cards : resolveDeck(picks[k], own, list, deckSeed).cards;
    if (KINDS.some((k) => decks[k].length !== 12)) continue;
    seeds++;
    for (const k of KINDS) {
      homeCards[k] += decks[k].filter(isHome).length;
      power[k] += decks[k].reduce((t, c) => t + cardStats(c).power, 0);
      const opp = opponentDeck(decks[k], list, seed, grounds);
      vsAi[k].w += pair(decks[k], opp, seed, grounds);
      vsAi[k].n += 2;
      if (k !== 'auto') {
        vsAuto[k].w += pair(decks[k], decks.auto, seed, grounds);
        vsAuto[k].n += 2;
      }
    }
  }
}

const pct = (t: { n: number; w: number }) => ((100 * t.w) / t.n).toFixed(1).padStart(5);
console.log(`\n${seeds} collections, ${KINDS.length * 2 * seeds + 3 * 2 * seeds} games in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('\ndeck      avg Power  home cards   vs AI (opponentDeck)   vs Auto-fill');
for (const k of KINDS) {
  console.log(
    `  ${k.padEnd(8)} ${(power[k] / seeds).toFixed(1).padStart(8)} ${(homeCards[k] / seeds).toFixed(2).padStart(10)}   ${pct(vsAi[k])}%  n=${vsAi[k].n}   ${k === 'auto' ? '      -' : `${pct(vsAuto[k])}%  n=${vsAuto[k].n}`}`
  );
}
console.log('\nAuto-fill vs each custom deck = 100 − the last column.');
