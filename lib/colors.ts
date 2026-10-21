/**
 * Club colours from football-data.org's free-text `clubColors` ("Sky Blue / White",
 * "Claret / Sky Blue", "Navy Blue / White") to hex, plus an accent that reads on
 * the night ground. Unknown or missing colours fall back to a neutral chalk.
 */

const NAMED: [string, string][] = [
  // longest names first so "sky blue" wins over "blue"
  ['royal blue', '#1D4ED8'], ['navy blue', '#1B2A5A'], ['sky blue', '#6CABDD'], ['light blue', '#7FB8E6'],
  ['dark blue', '#1E3A8A'], ['blue', '#2563EB'], ['navy', '#1B2A5A'], ['claret', '#7A263A'],
  ['maroon', '#7A1F2B'], ['burgundy', '#7A1F2B'], ['wine', '#6B1E2E'], ['red', '#DA291C'],
  ['white', '#F3F1E7'], ['black', '#141414'], ['yellow', '#FDE100'], ['gold', '#D4A72C'],
  ['amber', '#FFB000'], ['orange', '#F36C21'], ['green', '#1F8F4E'], ['purple', '#5B2C83'],
  ['violet', '#6A3FA0'], ['lilac', '#B19CD9'], ['pink', '#F4A6C6'], ['grey', '#8A8D91'],
  ['gray', '#8A8D91'], ['silver', '#B9BEC4'], ['brown', '#7B4B2A'], ['cherry', '#B11E3A'],
];

export interface ClubColors {
  primary: string;
  secondary: string;
  /** a colour from the club's palette that's readable on the dark ground */
  accent: string;
}

const FALLBACK: ClubColors = { primary: '#2F4034', secondary: '#F3F1E7', accent: '#C9CCC0' };

export function parseColor(word: string): string | null {
  const w = word.toLowerCase().trim();
  for (const [name, hex] of NAMED) if (w.includes(name)) return hex;
  return null;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const NIGHT = '#0A0E0B';

export function clubColors(raw: string | null | undefined): ClubColors {
  if (!raw) return FALLBACK;
  const parts = raw.split(/[\/,&]| and /i).map(parseColor).filter((c): c is string => !!c);
  if (!parts.length) return FALLBACK;
  const primary = parts[0];
  const secondary = parts.find((c) => c !== primary) ?? '#F3F1E7';
  // graphics accents need ~3:1 on the ground; white-kit clubs get their other colour
  const candidates = [primary, secondary, ...parts].filter((c) => c !== '#F3F1E7');
  const accent = candidates.find((c) => contrast(c, NIGHT) >= 3) ?? (contrast(primary, NIGHT) >= 3 ? primary : '#C9CCC0');
  return { primary, secondary, accent };
}

/** hex + alpha (0-1) as #RRGGBBAA */
export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(Math.min(Math.max(a, 0), 1) * 255).toString(16).padStart(2, '0')}`;

/** Blend two #RRGGBB colours: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A backdrop for a shirt drawn in `shirt`: the first candidate that keeps the shirt readable
 * (at least 1.8:1), so a black shirt never sits on near-black or a blue one on navy.
 */
export function backdropFor(shirt: string, secondary: string, night: string): string {
  const candidates = [mix(shirt, night, 0.62), mix(secondary, night, 0.3), '#26302A', '#5A645E', '#8A938C'];
  return candidates.find((c) => contrast(shirt, c) >= 1.8) ?? '#8A938C';
}
