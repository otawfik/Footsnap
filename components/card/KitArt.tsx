/**
 * The card art for a player with no licensed photo: the back of his club shirt, printed.
 *
 * A shirt seen from behind is the one football image that names a player without a face: the
 * club's colours, the trim in its second colour, the surname across the shoulders and, where
 * the number goes, the surname's initial (the free data has no squad numbers). Goalkeepers wear
 * a keeper's shirt that clashes with both club colours, as the laws require. No drawn face, no
 * invented likeness.
 *
 * Drawn in the cut-outs' 600 × 800 frame and placed in the same box a photo gets, so it sits in
 * the card's art window at every size. The shirt is lighter than the club field behind it and
 * carries a drop shadow and a dark edge, because the field is the same club colour.
 */
import React from 'react';
import { Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { Line } from '../../lib/football';
import { luminance, mix } from '../../lib/colors';
import { font } from '../../constants/design';

/** keeper shirts: the one furthest from both club colours is worn */
const KEEPER = ['#2BD47D', '#FFB000', '#8B6CFF', '#FF5A8A', '#21C4E8'];

const rgb = (h: string) => {
  const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const dist = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

export function kitColors(primary: string, secondary: string, line: Line | null): { shirt: string; trim: string } {
  if (line === 'GK') {
    const far = (k: string) => Math.min(dist(k, primary), dist(k, secondary));
    const shirt = KEEPER.reduce((best, k) => (far(k) > far(best) ? k : best), KEEPER[0]);
    return { shirt, trim: luminance(shirt) > 0.45 ? '#141821' : '#FFFFFF' };
  }
  // a trim that disappears into the shirt reads as no trim: fall back to white or ink
  const trim = dist(primary, secondary) > 70 ? secondary : luminance(primary) > 0.5 ? '#141821' : '#FFFFFF';
  return { shirt: primary, trim };
}

// the shirt from behind: sleeves out, a curved back neck, a slightly flared hem
const SHIRT =
  'M 196 96 C 236 112 364 112 404 96 L 498 128 C 540 142 566 168 582 214 L 598 312 L 500 340 L 486 300 L 492 640 C 400 664 200 664 108 640 L 114 300 L 100 340 L 2 312 L 18 214 C 34 168 60 142 102 128 Z';
const COLLAR = 'M 196 96 C 236 112 364 112 404 96 L 412 108 C 368 132 232 132 188 108 Z';

interface Props {
  id: string;
  /** the box a 600 × 800 cut-out would fill, in the card's own units */
  x: number;
  y: number;
  width: number;
  primary: string;
  secondary: string;
  line: Line | null;
  /** printed where the number goes */
  letter: string;
  /** printed across the shoulders (full-size cards only: it's unreadable smaller) */
  name?: string;
}

export function KitArt({ id, x, y, width, primary, secondary, line, letter, name }: Props) {
  const s = width / 600;
  const { shirt, trim } = kitColors(primary, secondary, line);
  // lighter than the club field behind it, so the shirt separates from a same-colour card
  const top = mix(shirt, '#FFFFFF', luminance(shirt) > 0.6 ? 0.05 : 0.26);
  const mid = mix(shirt, '#FFFFFF', luminance(shirt) > 0.6 ? 0 : 0.1);
  const low = mix(shirt, '#000000', 0.3);
  const k = `kit${id}`;
  const label = name ? name.toUpperCase() : null;
  // fits the back between the side seams (~300 units; the heavy face runs ~0.64 em a letter)
  const nameSize = label ? Math.min(52, 300 / (0.64 * Math.max(5, label.length))) : 0;
  return (
    <G transform={`translate(${x} ${y + 40 * s}) scale(${s}) translate(300 380) scale(0.86) translate(-300 -380)`}>
      <Defs>
        <LinearGradient id={`${k}sh`} x1="0" y1="96" x2="0" y2="660" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={top} />
          <Stop offset="0.45" stopColor={mid} />
          <Stop offset="1" stopColor={low} />
        </LinearGradient>
        <LinearGradient id={`${k}side`} x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#000" stopOpacity={0.45} />
          <Stop offset="0.2" stopColor="#000" stopOpacity={0.06} />
          <Stop offset="0.5" stopColor="#FFF" stopOpacity={0.06} />
          <Stop offset="0.8" stopColor="#000" stopOpacity={0.06} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.45} />
        </LinearGradient>
      </Defs>

      {/* drop shadow, then the shirt, its side shading and a dark edge */}
      <Path d={SHIRT} fill="#000" opacity={0.35} transform="translate(10 18)" />
      <Path d={SHIRT} fill={`url(#${k}sh)`} />
      <Path d={SHIRT} fill={`url(#${k}side)`} />
      <Path d={SHIRT} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={5} strokeLinejoin="round" />

      {/* trim: back of the collar, cuffs, side seams */}
      <Path d={COLLAR} fill={trim} />
      <Path d="M 2 312 L 100 340 L 104 322 L 6 294 Z" fill={trim} />
      <Path d="M 598 312 L 500 340 L 496 322 L 594 294 Z" fill={trim} />
      <Path d="M 116 330 L 110 636" stroke={trim} strokeWidth={8} opacity={0.75} />
      <Path d="M 484 330 L 490 636" stroke={trim} strokeWidth={8} opacity={0.75} />
      {/* folds */}
      <Path d="M 200 380 C 214 470 206 560 196 650" stroke="#000" strokeOpacity={0.12} strokeWidth={16} fill="none" strokeLinecap="round" />
      <Path d="M 404 380 C 390 470 398 560 408 650" stroke="#000" strokeOpacity={0.12} strokeWidth={16} fill="none" strokeLinecap="round" />

      {/* the printing */}
      {label ? (
        <SvgText x={300} y={214} fontSize={nameSize} fontFamily={font.cardHeavy} fontWeight="800" letterSpacing={nameSize * 0.06} textAnchor="middle" fill={trim}>
          {label}
        </SvgText>
      ) : null}
      <SvgText x={300} y={label ? 470 : 440} fontSize={label ? 230 : 280} fontFamily={font.cardHeavy} fontWeight="800" textAnchor="middle" fill="#000" opacity={0.28} dy={7}>
        {letter}
      </SvgText>
      <SvgText x={300} y={label ? 470 : 440} fontSize={label ? 230 : 280} fontFamily={font.cardHeavy} fontWeight="800" textAnchor="middle" fill={trim}>
        {letter}
      </SvgText>
    </G>
  );
}
