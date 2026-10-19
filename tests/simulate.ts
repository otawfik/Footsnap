/** A simulated double round-robin season from known team strengths (test data only). */
import type { Match } from '../lib/types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function poissonDraw(lambda: number, r: () => number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

export function season(attack: number[], defence: number[], { seed = 1, muHome = 1.5, muAway = 1.15, start = Date.UTC(2025, 7, 1) } = {}): Match[] {
  const r = rng(seed);
  const n = attack.length;
  const out: Match[] = [];
  let id = 1;
  let day = 0;
  for (let leg = 0; leg < 2; leg++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || (leg === 0 ? i > j : i < j)) continue;
        const h = poissonDraw(muHome * attack[i] * defence[j], r);
        const a = poissonDraw(muAway * attack[j] * defence[i], r);
        out.push({
          id: id++,
          utcDate: new Date(start + day++ * 86_400_000 / 4).toISOString(),
          status: 'FINISHED',
          homeTeam: { id: i + 1, name: `Team ${i + 1}` },
          awayTeam: { id: j + 1, name: `Team ${j + 1}` },
          score: { winner: h > a ? 'HOME_TEAM' : h < a ? 'AWAY_TEAM' : 'DRAW', fullTime: { home: h, away: a } },
        });
      }
    }
  }
  return out;
}
