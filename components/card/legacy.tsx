/**
 * RETIRED card pieces from the v1 (Marvel Snap) card, kept only so screens that still import them
 * compile while they migrate (SPEC.md §6: KitArt, Badges, RARITY_FRAME, frameOf and FRAME_* are retired).
 * Nothing new should use this file; delete it once app/arena.tsx stops importing from it.
 */
import React from 'react';
import Svg, { Defs, LinearGradient as SvgGrad, RadialGradient, Stop, Rect, Circle, Ellipse, Path, Polygon, G, ClipPath, Text as SvgText } from 'react-native-svg';
import { StyleSheet } from 'react-native';
import type { PlayerCard } from '../../lib/cards';
import { cardStats } from '../../lib/game';
import { mix } from '../../lib/colors';
import { C, F } from '../../constants/theme';

const legacyHeight = (w: number) => Math.round(w * 1.42);
const INK = '#120D08';
const DIM = 0.42;

/** @deprecated v1 frame geometry. */
export function frameOf(w: number) {
  const f = Math.max(2, w * 0.026);
  return { f, r: w * 0.04, rIn: w * 0.022, iw: w - f * 2, ih: legacyHeight(w) - f * 2 };
}

type Grad = [string, string, ...string[]];
/** @deprecated v1 rarity frames; the v2 card uses constants/design.ts `metal`. */
export const RARITY_FRAME: Record<PlayerCard['rarity'], Grad> = {
  common: ['#E4E7E3', '#A9B0AA', '#DADFDA', '#8E968F'],
  rare: ['#BFE2FF', '#4C8FD6', '#A9D4FF', '#2C6FB8'],
  elite: ['#FFFFFF', '#B7C1CC', '#F1F4F7', '#8B96A3'],
  icon: ['#FBE8A6', '#D9A441', '#F6DC8A', '#A87420'],
};
/** @deprecated */
export const FRAME_START = { x: 0, y: 0 };
/** @deprecated */
export const FRAME_END = { x: 0, y: 1 };

/**
 * For players without a free photo: a plain shirt in the club's two colours with
 * their position where the number would go, drawn like the comic art: an ink
 * outline and flat cel shading. Deliberately plain, so it never implies a real
 * kit design the club doesn't wear.
 */
/** @deprecated v1 shirt art; photos-off cards now use the sash and medallion. */
export function KitArt({ card, w, h, top = 0.2, silhouette = false, dim = false }: { card: PlayerCard; w: number; h: number; top?: number; silhouette?: boolean; dim?: boolean }) {
  const { primary, secondary } = card.team.colors;
  const sw = w * 1.05;
  const sh = sw * 0.95;
  const x0 = (w - sw) / 2;
  const y0 = h * top;
  const P = (fx: number, fy: number) => `${(x0 + fx * sw).toFixed(1)} ${(y0 + fy * sh).toFixed(1)}`;
  // rounded shoulders, set-in sleeves, a slightly tapered body
  const shirt = [
    `M ${P(0.37, 0.02)}`,
    `C ${P(0.3, 0.03)} ${P(0.2, 0.06)} ${P(0.15, 0.1)}`,
    `C ${P(0.08, 0.16)} ${P(0.03, 0.24)} ${P(0, 0.31)}`,
    `L ${P(0.13, 0.42)}`,
    `L ${P(0.22, 0.35)}`,
    `C ${P(0.23, 0.55)} ${P(0.22, 0.8)} ${P(0.21, 1)}`,
    `Q ${P(0.5, 1.03)} ${P(0.79, 1)}`,
    `C ${P(0.78, 0.8)} ${P(0.77, 0.55)} ${P(0.78, 0.35)}`,
    `L ${P(0.87, 0.42)}`,
    `L ${P(1, 0.31)}`,
    `C ${P(0.97, 0.24)} ${P(0.92, 0.16)} ${P(0.85, 0.1)}`,
    `C ${P(0.8, 0.06)} ${P(0.7, 0.03)} ${P(0.63, 0.02)}`,
    `Q ${P(0.5, 0.13)} ${P(0.37, 0.02)} Z`,
  ].join(' ');
  const id = `kit${card.id}_${Math.round(w)}_${silhouette ? 's' : 'k'}`;
  const sk = Math.max(1, w / 140);
  if (silhouette) {
    const rim = mix(card.team.colors.accent, '#FFFFFF', 0.4);
    return (
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Path d={shirt} fill="none" stroke={rim} strokeWidth={sk * 2.4} opacity={0.85} transform={`translate(0 ${-sk})`} />
        <Path d={shirt} fill="#0B100C" />
      </Svg>
    );
  }
  // cel shading: one hard shadow down the right of the body and the right sleeve, one hard highlight on the left shoulder
  const shade = `M ${P(0.6, -0.05)} Q ${P(0.64, 0.5)} ${P(0.6, 1.1)} L ${P(1.1, 1.1)} L ${P(1.1, -0.05)} Z`;
  const light = `M ${P(0.37, 0.02)} C ${P(0.3, 0.03)} ${P(0.2, 0.06)} ${P(0.15, 0.1)} C ${P(0.1, 0.14)} ${P(0.06, 0.19)} ${P(0.035, 0.24)} Q ${P(0.15, 0.15)} ${P(0.27, 0.12)} Q ${P(0.35, 0.1)} ${P(0.42, 0.06)} Z`;
  const fs = sw * 0.3;
  const letters = { x: w / 2, fontSize: fs, fontFamily: F.display, fontWeight: '900' as const, textAnchor: 'middle' as const, letterSpacing: sw * 0.01 };
  const ly = y0 + sh * 0.64;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
        <ClipPath id={`${id}c`}>
          <Path d={shirt} />
        </ClipPath>
      </Defs>
      {/* floor shadow and a soft drop shadow */}
      <Rect x={x0 + sw * 0.1} y={y0 + sh * 0.93} width={sw * 0.8} height={sh * 0.16} fill={`url(#${id}g)`} />
      <Path d={shirt} fill={C.night} opacity={0.3} transform={`translate(${w * 0.018} ${w * 0.026})`} />
      {/* the ink outline, under the fill so only its outer half shows */}
      <Path d={shirt} fill="none" stroke={INK} strokeWidth={w * 0.014} strokeLinejoin="round" />
      <Path d={shirt} fill={primary} />
      <G clipPath={`url(#${id}c)`}>
        <Path d={shade} fill={mix(primary, C.night, 0.35)} />
        <Path d={light} fill={mix(primary, '#FFFFFF', 0.25)} />
      </G>
      {/* the inside of the back of the neck, so it reads as a garment */}
      <Path d={`M ${P(0.39, 0.025)} Q ${P(0.5, 0.075)} ${P(0.61, 0.025)} Q ${P(0.5, 0.11)} ${P(0.39, 0.025)} Z`} fill={mix(primary, C.night, 0.6)} />
      {/* sleeve cuffs in the second colour */}
      <Path d={`M ${P(0.015, 0.29)} L ${P(0.135, 0.405)} L ${P(0.16, 0.38)} L ${P(0.04, 0.265)} Z`} fill={secondary} />
      <Path d={`M ${P(0.985, 0.29)} L ${P(0.865, 0.405)} L ${P(0.84, 0.38)} L ${P(0.96, 0.265)} Z`} fill={secondary} />
      {/* collar */}
      <Path d={`M ${P(0.37, 0.02)} Q ${P(0.5, 0.13)} ${P(0.63, 0.02)}`} stroke={secondary} strokeWidth={Math.max(2, w / 45)} fill="none" strokeLinecap="round" />
      {/* the player's position where a number would go: real information, not a made-up number.
          Set like the name logo: ink outline, a one-step extrusion, the second colour on top */}
      {[fs * 0.02, 0].map((dx, i) => (
        <SvgText key={i} {...letters} x={w / 2 + dx} y={ly + (dx ? fs * 0.05 : 0)} fill={INK} stroke={INK} strokeWidth={fs * 0.08} strokeLinejoin="round">
          {card.line}
        </SvgText>
      ))}
      <SvgText {...letters} x={w / 2 + fs * 0.02} y={ly + fs * 0.05} fill={mix(secondary, C.night, 0.4)}>
        {card.line}
      </SvgText>
      <SvgText {...letters} y={ly} fill={secondary}>
        {card.line}
      </SvgText>
      {/* the card's dimmer, for the part of the shirt that breaks out over the frame */}
      {dim ? <Path d={shirt} fill={C.night} stroke={C.night} strokeWidth={Math.max(2, w / 45)} strokeLinejoin="round" opacity={DIM} /> : null}
    </Svg>
  );
}

/** A big outlined number: white over a heavy ink outline and a soft drop, like Snap's Cost and Power. */
function BigNumber({ value, size, x, y }: { value: number; size: number; x: number; y: number }) {
  const props = { x, fontSize: size, fontFamily: F.numBlack, textAnchor: 'middle' as const };
  return (
    <>
      <SvgText {...props} y={y + size * 0.06} fill={INK} stroke={INK} strokeWidth={size * 0.16} strokeLinejoin="round" opacity={0.55}>
        {value}
      </SvgText>
      <SvgText {...props} y={y} fill="none" stroke={INK} strokeWidth={size * 0.14} strokeLinejoin="round">
        {value}
      </SvgText>
      <SvgText {...props} y={y} fill="#FFFFFF">
        {value}
      </SvgText>
    </>
  );
}

/** A point-up regular pentagon (a football's panel), as polygon points. */
const pentagon = (cx: number, cy: number, r: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

/** Cost (a glossy blue gem, top-left) and Power (an orange pentagon, top-right), overhanging the corners. */
/** @deprecated v1 cost/power badges. */
export function Badges({ card, w, dim = false }: { card: PlayerCard; w: number; dim?: boolean }) {
  const s = cardStats(card);
  const d = Math.max(28, w * 0.27);
  const id = `${card.id}_${Math.round(w)}`;
  // big cards hang the badges well off the corners; in the grid they overhang by at most 4px so neighbours never touch
  const small = w < 140;
  const inset = small ? d / 2 - 4 : w * 0.055;
  const top = small ? d / 2 - 4 : w * 0.05;
  // one canvas a little bigger than the card's top strip, so nothing clips
  const pad = d * 0.7;
  const cx = pad + inset;
  const cy = pad + top;
  const px = pad + w - inset;
  const py = pad + top + d * 0.04;
  const ink = Math.max(1.5, d * 0.05);
  const rim = Math.max(1, d * 0.03);
  const ps = d * (String(s.power).length > 1 ? 0.56 : 0.62);
  return (
    <Svg width={w + pad * 2} height={py + d * 0.6} style={{ position: 'absolute', left: -pad, top: -pad }} pointerEvents="none">
      <Defs>
        <RadialGradient id={`cost${id}`} cx="38%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#9FD8FF" />
          <Stop offset="0.5" stopColor="#2F7BFF" />
          <Stop offset="1" stopColor="#0E2F8A" />
        </RadialGradient>
        <SvgGrad id={`pow${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFC266" />
          <Stop offset="0.55" stopColor="#F7731C" />
          <Stop offset="1" stopColor="#B9410A" />
        </SvgGrad>
      </Defs>
      {/* Cost: a halo (rings rather than a blur, which native SVG can't do), the gem, an inner rim, a specular */}
      <Circle cx={cx} cy={cy} r={d * 0.56} fill="#4DA3FF" opacity={0.18} />
      <Circle cx={cx} cy={cy} r={d * 0.53} fill="#4DA3FF" opacity={0.3} />
      <Circle cx={cx} cy={cy} r={d / 2} fill={`url(#cost${id})`} stroke={INK} strokeWidth={ink} />
      <Circle cx={cx} cy={cy} r={d / 2 - d * 0.09} fill="none" stroke="#BFE6FF" strokeOpacity={0.8} strokeWidth={rim} />
      <Ellipse cx={cx - d * 0.05} cy={cy - d * 0.2} rx={d * 0.26} ry={d * 0.13} fill="#FFFFFF" opacity={0.35} />
      <BigNumber value={s.cost} size={d * 0.62} x={cx} y={cy + d * 0.21} />
      {/* Power: the pentagon, a bevel, a specular */}
      <Polygon points={pentagon(px, py, d * 0.56)} fill={`url(#pow${id})`} stroke={INK} strokeWidth={ink} strokeLinejoin="round" />
      <Polygon points={pentagon(px, py, d * 0.46)} fill="none" stroke="#FFD9A0" strokeOpacity={0.85} strokeWidth={rim} strokeLinejoin="round" />
      <Ellipse cx={px} cy={py - d * 0.18} rx={d * 0.24} ry={d * 0.1} fill="#FFFFFF" opacity={0.3} />
      <BigNumber value={s.power} size={ps} x={px} y={py + d * 0.25} />
      {/* not collected: the badges hang off the card, so they carry their own share of the card's dimmer */}
      {dim ? (
        <G opacity={DIM}>
          <Circle cx={cx} cy={cy} r={d / 2 + ink / 2} fill={C.night} />
          <Polygon points={pentagon(px, py, d * 0.56)} fill={C.night} stroke={C.night} strokeWidth={ink} strokeLinejoin="round" />
        </G>
      ) : null}
    </Svg>
  );
}

/** Big Shoulders Display 900 advance widths (em), so the logo can be sized to the card before it's laid out. */
const ADVANCE: Record<string, number> = {
  A: 0.478, B: 0.472, C: 0.49, D: 0.495, E: 0.408, F: 0.406, G: 0.493, H: 0.485, I: 0.23, J: 0.453, K: 0.496, L: 0.402, M: 0.745,
  N: 0.543, O: 0.496, P: 0.47, Q: 0.496, R: 0.477, S: 0.474, T: 0.419, U: 0.487, V: 0.494, W: 0.8, X: 0.471, Y: 0.465, Z: 0.418,
  '-': 0.446, "'": 0.203, '.': 0.25, ' ': 0.22,
};
/** Width of an upper-case label in em; accented letters measure as their base letter. */
export const emWidth = (label: string) =>
  [...label.normalize('NFD').replace(/[̀-ͯ]/g, '')].reduce((sum, ch) => sum + (ADVANCE[ch] ?? 0.48), 0);
