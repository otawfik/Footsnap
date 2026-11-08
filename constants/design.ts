import type { TextStyle } from 'react-native';

/**
 * FootSnap design system v3: "floodlit royal" (docs/redesign/SPEC.md §2).
 *
 * v2.1 sat on near-black ink with club colour only in thin stripes; the owner found it "too dark,
 * AI vibes". v3 lifts the ground to a lighter, more saturated royal ink, lets club colour fill
 * whole surfaces (fixture tiles and market headers are gradients from one kit to the other,
 * like a broadcast graphic), gives each tab a colour of its own at the top of the screen, and
 * warms the state colours. Text is still warm chalk. Every kit colour goes through clubTone() /
 * deepTone() / solidFill() / onFill() in components/ui.tsx, which keep text at 4.5:1.
 *
 * WCAG contrast, computed against bg / surface / raised:
 *   text   14.31 / 12.40 / 10.29     text2  8.79 / 7.61 / 6.32     text3  6.88 / 5.96 / 4.95
 *   accent (pitch green) 8.67 / 7.51 / 6.24     loss 6.33 / 5.48 / 4.55     gold 9.77 / 8.47 / 7.03
 *   live   5.76 / 4.99 (text on bg and surface only; on raised it's 4.14, so never there)
 *   on the pitch / its stripe: text 13.00 / 11.73 · text2 7.98 / 7.21 · text3 6.25 / 5.64
 *   onChalk (ink) on chalk 14.31 · onAccent (ink) on accent 8.67
 * Every text colour clears 4.5:1 where it's used. Recompute if you change one.
 */

export const color = {
  // grounds: royal ink, lifted in two steps (no near-black anywhere in the shell)
  bg: '#102040', // app ground
  surface: '#172B52', // market bodies, sheets, promo tiles, tab bar
  raised: '#203864', // chips, segmented track, pressed rows, % pills
  hairline: '#253C68', // separators (decorative, 1 px)
  hairlineStrong: '#35507F', // bar tracks, outlines (non-text)

  // text: warm chalk
  text: '#F6F1E6',
  text2: '#C4BFB3',
  text3: '#AEA99E', // captions, metadata; never below 12 pt

  // the primary action: chalk on ink (buttons, selected segment, selected chip)
  chalk: '#F6F1E6',
  onChalk: '#102040',

  // brand accent: pitch green (links, progress, your side in the duel)
  accent: '#4BD68C', // fills
  accentText: '#4BD68C', // as text or thin lines
  accentSoft: 'rgba(75,214,140,0.16)',
  onAccent: '#102040',

  // states: warm and saturated
  win: '#4BD68C',
  winSoft: 'rgba(75,214,140,0.16)',
  loss: '#FF7A6B',
  lossSoft: 'rgba(255,122,107,0.16)',
  live: '#FF6B5B', // live dot, minute and score-bug centre (text on bg / surface only)
  gold: '#F2C35B', // credits, packs, the Cards tab's colour

  /** a floodlit-pitch green, for game surfaces only (Play hero, duel board); stripe #13362A */
  pitch: '#0F2E22',
  pitchStripe: '#13362A',
  pitchLine: 'rgba(246,241,230,0.08)',

  /** each tab's colour, washed across the top of its screen (Screen `tint`) */
  tabTint: { home: '#1E9E5F', matches: '#2F6FE0', cards: '#D9A43A', play: '#1E9E5F' },

  scrim: 'rgba(6,12,26,0.66)',
} as const;

/** Card metals. Rim gradients run top-left to bottom-right (start {0,0} end {1,1}). */
export type Metal = 'common' | 'rare' | 'elite' | 'icon' | 'legend';
export const METAL_NAME: Record<Metal, string> = { common: 'Bronze', rare: 'Silver', elite: 'Gold', icon: 'Icon', legend: 'Legend' };

type Stops = { colors: [string, string, ...string[]]; locations: [number, number, ...number[]] };
const L7: [number, number, ...number[]] = [0, 0.18, 0.38, 0.52, 0.7, 0.86, 1];

export const metal: Record<
  Metal,
  {
    rim: Stops;
    /** text-gradient for the Power number: top to bottom */
    numeral: [string, string, ...string[]];
    faceTop: string;
    faceMid: string;
    faceBottom: string;
    /** the light behind the player's head, as rgb */
    glow: string;
    glowAlpha: number;
    /** position, nation, club code, stat labels */
    ink: string;
    name: string;
    stat: string;
    line: string;
  }
> = {
  common: {
    rim: { colors: ['#F3C9A0', '#9A5E37', '#E7AF80', '#7A4527', '#D59A6A', '#6B3B21', '#C88A5C'], locations: L7 },
    numeral: ['#FFE2C6', '#E3A877', '#B5703F', '#F5C79F'],
    faceTop: '#2E1C11', faceMid: '#150E0A', faceBottom: '#0B0705',
    glow: '222,150,96', glowAlpha: 0.26,
    ink: '#EDC29C', name: '#FBE7D6', stat: '#FFF3E8', line: 'rgba(215,155,105,0.6)',
  },
  rare: {
    rim: { colors: ['#FFFFFF', '#8E959D', '#EEF1F4', '#6F767E', '#D9DDE2', '#5D636B', '#C6CBD1'], locations: L7 },
    numeral: ['#FFFFFF', '#DDE2E7', '#9AA2AB', '#F1F4F7'],
    faceTop: '#20252B', faceMid: '#0F1114', faceBottom: '#08090B',
    glow: '205,215,228', glowAlpha: 0.2,
    ink: '#D3D9E0', name: '#FFFFFF', stat: '#FFFFFF', line: 'rgba(200,208,218,0.55)',
  },
  elite: {
    rim: { colors: ['#FFF3C4', '#B08A3E', '#FBE39A', '#8F6A26', '#EBCB78', '#7C5A1E', '#E2BE65'], locations: L7 },
    numeral: ['#FFF4CF', '#F1D27E', '#B98A2E', '#FBE6A6'],
    faceTop: '#2C2010', faceMid: '#120E08', faceBottom: '#0A0805',
    glow: '240,196,100', glowAlpha: 0.28,
    ink: '#EFD48B', name: '#FBEBC0', stat: '#FFF8E6', line: 'rgba(230,195,110,0.6)',
  },
  icon: {
    rim: { colors: ['#FFFFFF', '#B9B4CC', '#F7F4FF', '#A6B9C8', '#FFF6E2', '#9C98B4', '#EDEAF7'], locations: [0, 0.16, 0.34, 0.5, 0.66, 0.84, 1] },
    numeral: ['#FFFFFF', '#E9E6FA', '#B7B3D2', '#FFFFFF'],
    faceTop: '#1F1E36', faceMid: '#0E0E16', faceBottom: '#08080D',
    glow: '200,210,255', glowAlpha: 0.24,
    ink: '#DCDAF2', name: '#FFFFFF', stat: '#FFFFFF', line: 'rgba(214,210,240,0.55)',
  },
  legend: {
    rim: { colors: ['#3A3A3E', '#0B0B0C', '#2B2B2F', '#050505', '#26262A', '#0A0A0B'], locations: [0, 0.2, 0.42, 0.55, 0.75, 1] },
    numeral: ['#FFF4CF', '#F1D27E', '#B98A2E', '#FBE6A6'],
    faceTop: '#17130B', faceMid: '#08080A', faceBottom: '#050506',
    glow: '236,196,110', glowAlpha: 0.2,
    ink: '#EFD48B', name: '#FBEBC0', stat: '#FFF8E6', line: 'rgba(230,195,110,0.7)',
  },
};

/** The cost gem (Snap energy): the accent, lit from the top-left. */
export const gem = { hi: '#8DB3FF', mid: '#2C64E8', low: '#2350C8', edge: '#17337F' } as const; // number sits on mid: white 5.13:1

/**
 * Card geometry. Everything on a card is a fraction of its width w (see SPEC.md §6).
 * The silhouette is defined in a 300 × 420 box; cardPath(inset) returns it inset by
 * `inset` box units, scaled to width w.
 */
export const CARD_RATIO = 1.4;
export const CARD = { full: 300, grid: 110, hand: 74, board: 56 } as const;
export const cardH = (w: number) => Math.round(w * CARD_RATIO);
const CH = 20; // chamfer
const YB = 388; // where the sides turn into the shield point
function offsetPoly(d: number): [number, number][] {
  const poly: [number, number][] = [[CH, 0], [300 - CH, 0], [300, CH], [300, YB], [150, 420], [0, YB], [0, CH]];
  const n = poly.length;
  const edge = (i: number) => {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    let nx = -(by - ay) / len;
    let ny = (bx - ax) / len;
    if (nx * (150 - ax) + ny * (210 - ay) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [ax + nx * d, ay + ny * d, bx + nx * d, by + ny * d];
  };
  const hit = (e: number[], g: number[]): [number, number] => {
    const [x1, y1, x2, y2] = e;
    const [x3, y3, x4, y4] = g;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  return poly.map((_, i) => hit(edge((i - 1 + n) % n), edge(i)));
}
/** SVG path of the card silhouette at width w, inset by `inset` (box units of a 300-wide card), corners rounded by r. */
export function cardPath(w: number, inset = 0, r = 5): string {
  const k = w / 300;
  const pts = offsetPoly(inset);
  const n = pts.length;
  let out = '';
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const lp = Math.hypot(prev[0] - p[0], prev[1] - p[1]);
    const ln = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const rr = Math.min(r, lp / 2, ln / 2);
    const a = [p[0] + ((prev[0] - p[0]) / lp) * rr, p[1] + ((prev[1] - p[1]) / lp) * rr];
    const b = [p[0] + ((next[0] - p[0]) / ln) * rr, p[1] + ((next[1] - p[1]) / ln) * rr];
    out += `${i ? 'L' : 'M'} ${(a[0] * k).toFixed(2)} ${(a[1] * k).toFixed(2)} Q ${(p[0] * k).toFixed(2)} ${(p[1] * k).toFixed(2)} ${(b[0] * k).toFixed(2)} ${(b[1] * k).toFixed(2)} `;
  });
  return `${out}Z`;
}
/** Rim = outer path; face window = inset 7; engraved hairline = inset 11.5. */
export const CARD_INSET = { face: 7, hair: 11.5 } as const;

// ---------------------------------------------------------------- type

/** Font family names as registered in app/_layout.tsx (useFonts keys). */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
  // card numerals and names only
  cardBold: 'InterTight_700Bold',
  cardHeavy: 'InterTight_800ExtraBold',
} as const;

const tab: TextStyle['fontVariant'] = ['tabular-nums'];

/** Type scale (pt). Every style that can show a number uses tabular figures. */
export const type = {
  largeTitle: { fontFamily: font.cardHeavy, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: color.text },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: color.text },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: color.text },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.text2 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, color: color.text },
  callout: { fontFamily: font.medium, fontSize: 14, lineHeight: 19, color: color.text },
  footnote: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.text3 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: color.text3 },
  overline: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase', color: color.text3 },
  tab: { fontFamily: font.medium, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.1 },
  // numbers
  numHero: { fontFamily: font.cardHeavy, fontSize: 44, lineHeight: 48, letterSpacing: -1.4, color: color.text, fontVariant: tab },
  numLarge: { fontFamily: font.cardHeavy, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: color.text, fontVariant: tab },
  num: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: color.text, fontVariant: tab },
  numSmall: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16, color: color.text, fontVariant: tab },
  // broadcast moments (TV graphics, matchday programme): Inter Tight, caps, tracked
  /** club codes on score-bug tabs, "MATCHDAY 9" straps */
  strap: { fontFamily: font.cardHeavy, fontSize: 13, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase', color: color.text },
  /** kick-off time / score inside the score bug */
  bug: { fontFamily: font.cardHeavy, fontSize: 22, lineHeight: 26, letterSpacing: -0.2, color: color.onChalk, fontVariant: tab },
  /** a club's name set big (club page header, match hero) */
  clubName: { fontFamily: font.cardHeavy, fontSize: 30, lineHeight: 32, letterSpacing: -0.4, textTransform: 'uppercase', color: color.text },
} satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------- space, radii, motion

/** 4-pt grid. Screen gutter is `gutter`; list rows are 52 tall (min hit 44). */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, x3: 32, x4: 40, x5: 56, gutter: 20 } as const;
export const radius = { xs: 6, sm: 10, md: 14, lg: 20, sheet: 28, pill: 999 } as const;
export const size = { row: 52, rowCompact: 44, hit: 44, button: 50, buttonSm: 34, tabBar: 49, kit: 20, kitLarge: 52, hairline: 1 } as const;

/**
 * Motion. Durations in ms; easing as cubic-bezier control points for Easing.bezier.
 * Under reduced motion (useReducedMotion): every duration becomes 0 except opacity fades
 * (kept, ≤ 200 ms), no tilt, no idle sheen, no flips (crossfade), no confetti.
 */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  flip: 480,
  sheenIdle: 7000,
  easeOut: [0.2, 0, 0, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,
  spring: { damping: 18, stiffness: 220, mass: 1 },
  tiltMaxDeg: 9,
} as const;

/** Club kit chip (replaces crests when EXPO_PUBLIC_SHOW_CRESTS=false and in all list rows). */
export const kitChip = { ring: 'rgba(255,255,255,0.14)', split: 135 } as const;
