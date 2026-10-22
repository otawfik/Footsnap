import type { TextStyle } from 'react-native';

/**
 * FootSnap design system: "floodlit night".
 *
 * A pitch-at-night ground (green-black, never pure black), chalk-white type,
 * one house accent (flare: the orange-red of stadium pyro) for live moments,
 * and every club in its own colours (lib/colors.ts). Type is stadium signage:
 * Big Shoulders Display for headlines, Barlow Condensed for scores and numbers
 * (TV score-graphic style), Barlow for reading.
 *
 * Contrast (WCAG), computed against night / pitch / turf:
 *   chalk 17.2 / 16.2 / 14.8   chalk2 11.9 / 11.3 / 10.3   muted 6.4 / 6.1 / 5.5
 *   dim 5.8 / 5.5 / 5.0        flare 6.3 / 5.9 / 5.4       loss 6.9 / 6.6 / 6.0
 *   win, draw, icon, rare all above 7.9 on every surface.
 * Everything clears 4.5:1 on all three grounds. Recompute if you change a colour.
 */

export const C = {
  night: '#0A0E0B', // app ground
  pitch: '#101611', // surfaces
  turf: '#162019', // raised surfaces, pressed states
  line: '#223026', // hairlines
  lineHi: '#2F4034',

  chalk: '#F3F1E7', // primary text: warm white, like pitch markings
  chalk2: '#C9CCC0',
  muted: '#8D978E',
  dim: '#868F88',

  flare: '#FF5A36', // house accent: live, goals, the snap
  flareSoft: 'rgba(255,90,54,0.14)',

  win: '#7BE0A0',
  draw: '#F2C14E',
  loss: '#FF6B5B',

  // card rarities
  icon: '#F5C451',
  elite: '#C9D3DE',
  rare: '#6FB7FF',
  common: '#8D978E',
} as const;

export const F = {
  display: 'BigShouldersDisplay_900Black',
  displayBold: 'BigShouldersDisplay_700Bold',
  num: 'BarlowCondensed_700Bold',
  numHeavy: 'BarlowCondensed_800ExtraBold_Italic',
  /** a card's Cost and Power: the heaviest italic, so every badge matches */
  numBlack: 'BarlowCondensed_900Black_Italic',
  label: 'BarlowCondensed_600SemiBold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodyBold: 'Barlow_600SemiBold',
} as const;

export const S = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Corners are tight: this is a scoreboard, not a bubble UI. */
export const R = { xs: 3, sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const T = {
  hero: { fontFamily: F.display, fontSize: 44, lineHeight: 44, color: C.chalk, letterSpacing: 0.2 },
  h1: { fontFamily: F.display, fontSize: 32, lineHeight: 34, color: C.chalk, letterSpacing: 0.2 },
  h2: { fontFamily: F.display, fontSize: 22, lineHeight: 26, color: C.chalk, letterSpacing: 0.3 },
  kicker: { fontFamily: F.label, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: C.muted },
  label: { fontFamily: F.label, fontSize: 13, letterSpacing: 0.6, color: C.chalk2 },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.chalk2 },
  small: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.muted },
  num: { fontFamily: F.num, fontSize: 16, color: C.chalk, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;
