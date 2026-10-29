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


/**
 * The colours each club actually wears, by football-data.org team id, for every club in the six competitions.
 * The free-text clubColors only says "Red / White", which gave Arsenal, Liverpool, Man United and Sunderland
 * the same red. Clubs not listed fall back to parsing that text. [shirt, second colour]
 */
const KITS: Record<number, [string, string]> = {
  57: ['#EF0107', '#F3F1E7'], 58: ['#670E36', '#95BFE5'], 61: ['#034694', '#F3F1E7'], 62: ['#003399', '#F3F1E7'], 63: ['#F3F1E7', '#141414'],
  64: ['#C8102E', '#F3F1E7'], 65: ['#6CABDD', '#F3F1E7'], 66: ['#DA291C', '#141414'], 67: ['#241F20', '#F3F1E7'], 71: ['#EB172B', '#F3F1E7'],
  73: ['#132257', '#F3F1E7'], 322: ['#F5A12D', '#141414'], 341: ['#F3F1E7', '#1D428A'], 349: ['#3A64A3', '#F3F1E7'], 351: ['#E53233', '#F3F1E7'],
  354: ['#1B458F', '#C4122E'], 397: ['#0057B8', '#F3F1E7'], 402: ['#E30613', '#F3F1E7'], 1044: ['#B50E12', '#141414'], 1076: ['#59CBE8', '#F3F1E7'],
  77: ['#EE2523', '#F3F1E7'], 78: ['#CB3524', '#272E61'], 79: ['#D91A21', '#0A346F'], 80: ['#007FC8', '#F3F1E7'], 81: ['#A50044', '#004D98'],
  82: ['#005999', '#F3F1E7'], 84: ['#0D5EAF', '#F3F1E7'], 86: ['#F3F1E7', '#3D195B'], 87: ['#F3F1E7', '#E53027'], 88: ['#B4053F', '#004D98'],
  90: ['#00954C', '#F3F1E7'], 92: ['#0067B1', '#F3F1E7'], 94: ['#FFE667', '#005187'], 95: ['#F3F1E7', '#F18E00'], 263: ['#0761AF', '#F3F1E7'],
  285: ['#F3F1E7', '#05642C'], 558: ['#8AC3EE', '#F3F1E7'], 559: ['#F3F1E7', '#D71920'], 560: ['#0A4B9B', '#F3F1E7'], 5335: ['#F3F1E7', '#007A3D'],
  1: ['#ED1C24', '#F3F1E7'], 2: ['#1C63B7', '#F3F1E7'], 3: ['#E32221', '#141414'], 4: ['#FDE100', '#141414'], 5: ['#DC052D', '#F3F1E7'],
  6: ['#004D9D', '#F3F1E7'], 7: ['#F3F1E7', '#0A3F86'], 10: ['#F3F1E7', '#E32219'], 12: ['#1D9053', '#F3F1E7'], 15: ['#C3141E', '#F3F1E7'],
  16: ['#BA3733', '#46714D'], 17: ['#D3112D', '#141414'], 18: ['#F3F1E7', '#00A650'], 19: ['#E1000F', '#141414'], 28: ['#EB1923', '#F3F1E7'],
  29: ['#141414', '#0055A4'], 719: ['#141414', '#F3F1E7'], 721: ['#F3F1E7', '#DD0741'], 98: ['#FB090B', '#141414'], 99: ['#482E92', '#F3F1E7'],
  100: ['#8E1F2F', '#F0BC42'], 102: ['#1E71B8', '#141414'], 103: ['#A21C26', '#1A2F48'], 104: ['#A0002C', '#002350'], 107: ['#A81830', '#002B5C'],
  108: ['#010E80', '#141414'], 109: ['#F3F1E7', '#141414'], 110: ['#85C4E8', '#F3F1E7'], 112: ['#F3F1E7', '#141414'], 113: ['#12A0D7', '#F3F1E7'],
  115: ['#F3F1E7', '#141414'], 454: ['#F37021', '#141414'], 470: ['#FFDD00', '#0047AB'], 471: ['#00A752', '#141414'], 586: ['#8A1E03', '#F3F1E7'],
  5890: ['#FFD100', '#D2001F'], 5911: ['#E30613', '#F3F1E7'], 7397: ['#5B9BD5', '#F3F1E7'], 511: ['#3E2C7E', '#F3F1E7'], 512: ['#E30613', '#F3F1E7'],
  516: ['#F3F1E7', '#2FAEE0'], 519: ['#F3F1E7', '#0D5EAF'], 521: ['#D2112A', '#1A2C55'], 522: ['#E2001A', '#141414'], 523: ['#F3F1E7', '#DA0812'],
  524: ['#004170', '#DA291C'], 525: ['#F58113', '#141414'], 529: ['#E13327', '#141414'], 531: ['#005BAC', '#F3F1E7'], 532: ['#141414', '#F3F1E7'],
  533: ['#76B5E4', '#0E2A4E'], 535: ['#DA291C', '#FFD200'], 546: ['#E01E13', '#FFD100'], 548: ['#E51B22', '#F3F1E7'], 576: ['#009FE3', '#F3F1E7'],
  1045: ['#0E2A4E', '#5BC2E7'], 498: ['#008057', '#F3F1E7'], 503: ['#00428C', '#F3F1E7'], 610: ['#A90432', '#FDB912'], 613: ['#FFED00', '#00237A'],
  674: ['#ED1C24', '#F3F1E7'], 675: ['#E30613', '#F3F1E7'], 851: ['#0067B1', '#141414'], 930: ['#E30613', '#F3F1E7'], 1887: ['#F26522', '#141414'],
  1899: ['#FFD200', '#141414'], 2016: ['#141414', '#F3F1E7'], 5720: ['#003E7E', '#F3F1E7'], 5721: ['#FFE500', '#141414'], 7509: ['#6CB4EE', '#F3F1E7'],
};

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

export function clubColors(raw: string | null | undefined, teamId?: number): ClubColors {
  const kit = teamId != null ? KITS[teamId] : undefined;
  const parts = kit ? [...kit] : (raw ?? '').split(/[\/,&]| and /i).map(parseColor).filter((c): c is string => !!c);
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
