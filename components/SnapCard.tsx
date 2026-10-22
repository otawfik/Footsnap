/**
 * The player card, built the way Marvel Snap builds its cards:
 *
 *   - the art is the card: a cut-out of the player (background removed, from a
 *     freely licensed Wikimedia photo) in front of a comic-book halo burst in the
 *     club's colours, with a soft shadow behind them
 *   - Cost top-left and Power top-right (the Duel game's stats, derived from
 *     real data in lib/game.ts), and the name set big at the bottom, where the
 *     art fades out; nothing else on the face
 *   - rarer cards come alive: Elite and Icon backgrounds rotate and sparkle, and
 *     their player breaks out over the top of the frame
 *   - upgrades work like Snap's: the frame colour follows the upgrade tier, and
 *     each tier adds an effect (frame break, 3D parallax, sparks, crest, holo,
 *     Legend with a finish)
 *
 * The real stats and abilities are on the back and in the card view.
 * Players with no free photo get a kit in their club's colours instead.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image, Platform, Pressable, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGrad, RadialGradient, Stop, Rect, Circle, Ellipse, Path, Polygon, G, ClipPath, Text as SvgText } from 'react-native-svg';
import { DeviceMotion } from 'expo-sensors';
import type { PlayerCard } from '../lib/cards';
import { RARITY_NAME, bannerName } from '../lib/cards';
import type { Finish, Tier } from '../lib/collection';
import { cardStats } from '../lib/game';
import { useArt } from '../lib/art';
import { alpha, backdropFor, contrast, luminance, mix } from '../lib/colors';
import { C, F } from '../constants/theme';

export type CardSize = 'sm' | 'md' | 'lg';
const WIDTH: Record<CardSize, number> = { sm: 108, md: 168, lg: 300 };
export const cardHeight = (w: number) => Math.round(w * 1.42);

export interface Look {
  tier: Tier;
  finish: Finish | null;
  premium: boolean;
}
export const BASE_LOOK: Look = { tier: 0, finish: null, premium: false };

/** The ink every outline on the face is drawn in: warmer than the night ground, like printed line work. */
const INK = '#120D08';
/** How far a card you don't own yet is dimmed (never see-through). */
const DIM = 0.42;

/**
 * The frame's geometry, shared by the face, the back, the foil and the dimmer so their
 * corners always line up: a thin band of metal, tight corners, a slightly tighter window.
 */
export function frameOf(w: number) {
  const f = Math.max(2, w * 0.026);
  return { f, r: w * 0.04, rIn: w * 0.022, iw: w - f * 2, ih: cardHeight(w) - f * 2 };
}

type Grad = [string, string, ...string[]];
/** Base cards wear their rarity; upgraded cards wear their upgrade tier, the way Snap colours frames. Flat metal, lit from above. */
export const RARITY_FRAME: Record<PlayerCard['rarity'], Grad> = {
  common: ['#E4E7E3', '#A9B0AA', '#DADFDA', '#8E968F'],
  rare: ['#BFE2FF', '#4C8FD6', '#A9D4FF', '#2C6FB8'],
  elite: ['#FFFFFF', '#B7C1CC', '#F1F4F7', '#8B96A3'],
  icon: ['#FBE8A6', '#D9A441', '#F6DC8A', '#A87420'],
};
const TIER_FRAME: Record<number, Grad> = {
  1: ['#7DF0A6', '#1F8A47', '#B8FFD2', '#1F8A47'],
  2: ['#7FC2FF', '#1D5FB0', '#C2E3FF', '#1D5FB0'],
  3: ['#C9A2FF', '#6331B5', '#E5D3FF', '#6331B5'],
  4: ['#FFC170', '#B4560F', '#FFE1B0', '#B4560F'],
  5: ['#7FF5EE', '#138C93', '#C9FFFB', '#138C93', '#FFD1F0'],
  6: ['#151515', '#D9B24C', '#0B0B0B', '#F6DC8A', '#151515'],
};
/** Frames are lit from above only: a vertical gradient, no diagonal sheen. */
export const FRAME_START = { x: 0, y: 0 };
export const FRAME_END = { x: 0, y: 1 };
const RARITY_COLOR = { common: C.common, rare: C.rare, elite: C.elite, icon: C.icon } as const;

const OUTLINE: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

export const breaksFrame = (card: PlayerCard, look: Look) => look.tier >= 1 || card.rarity === 'icon' || card.rarity === 'elite';

// ---------------------------------------------------------------------------
// Background: a halo burst in the club's colours, alive on rarer cards
// ---------------------------------------------------------------------------

function Rays({ size, color, count }: { size: number; color: string; count: number }) {
  const c = size / 2;
  const wedges = Array.from({ length: count }, (_, i) => {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = a0 + Math.PI / count;
    return `M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`;
  });
  return (
    <Svg width={size} height={size}>
      {wedges.map((d, i) => (
        <Path key={i} d={d} fill={color} />
      ))}
    </Svg>
  );
}

function Background({
  card,
  w,
  h,
  cardW,
  fx,
  fy,
  look,
  animate,
  kit,
}: {
  card: PlayerCard;
  w: number;
  h: number;
  cardW: number;
  /** where the face is, in window coordinates: the halo and the burst centre on it */
  fx: number;
  fy: number;
  look: Look;
  animate: boolean;
  kit: boolean;
}) {
  const { primary, secondary } = card.team.colors;
  const legend = look.tier === 6;
  const lively = card.rarity === 'icon' || look.tier >= 3 || look.premium;
  const spin = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (animate && lively && !reduced) spin.value = withRepeat(withTiming(1, { duration: 60000, easing: Easing.linear }), -1);
  }, [animate, lively, reduced, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const id = `bg${card.id}_${Math.round(w)}`;
  // the colour the halo is built from: the club's, or the shirt's backdrop on kit cards;
  // Legend and Premium keep their own darker grounds through the same layers
  const club = legend ? '#2B2412' : kit ? backdropFor(primary, secondary, C.night) : look.premium ? mix(primary, C.night, 0.55) : primary;
  // pale kits (white, yellow, sky) would wash out to white at the core: hold the core back, sink the edges
  const pale = luminance(club) > 0.45;
  const base = mix(club, C.night, pale ? 0.65 : 0.55);
  const core = mix(club, '#FFFFFF', pale ? 0.15 : 0.35);
  const S = Math.hypot(w, h) * 2.2;
  // halftone: dots that grow toward the window's edges, one path so a card is one element, not thousands
  const dots = useMemo(() => {
    if (cardW < 140) return '';
    const cell = Math.max(3, cardW * 0.022);
    let d = '';
    for (let y = cell / 2; y < h; y += cell) {
      for (let x = cell / 2; x < w; x += cell) {
        const r = Math.min(Math.max((Math.hypot((x - fx) / w, (y - fy) / h) - 0.38) * cell * 1.1, 0), cell * 0.48);
        if (r > 0.25) d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(r * 2).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-r * 2).toFixed(2)} 0`;
      }
    }
    return d;
  }, [cardW, w, h, fx, fy]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* the club colour, brightest in a halo behind the player's head */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}halo`} cx={fx} cy={fy} r={w * 0.62} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={core} />
            <Stop offset="0.45" stopColor={club} />
            <Stop offset="1" stopColor={club} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill={base} />
        <Rect width={w} height={h} fill={`url(#${id}halo)`} />
      </Svg>
      {/* a comic-book sunburst from the face; it turns slowly on livelier cards */}
      <Animated.View style={[{ position: 'absolute', width: S, height: S, left: fx - S / 2, top: fy - S / 2 }, lively ? spinStyle : null]}>
        <Rays size={S} color={alpha(legend ? '#F6DC8A' : '#FFFFFF', 0.13)} count={16} />
      </Animated.View>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}vig`} cx="50%" cy="40%" r="75%">
            <Stop offset="0.55" stopColor={C.night} stopOpacity="0" />
            <Stop offset="1" stopColor={C.night} stopOpacity="0.65" />
          </RadialGradient>
        </Defs>
        {dots ? <Path d={dots} fill={C.night} opacity={0.35} /> : null}
        <Rect width={w} height={h} fill={`url(#${id}vig)`} />
      </Svg>
      {look.tier >= 4 && card.team.crest ? (
        <Image source={{ uri: card.team.crest }} style={{ position: 'absolute', width: w * 0.9, height: w * 0.9, left: w * 0.05, top: h * 0.08, opacity: 0.12 }} resizeMode="contain" />
      ) : look.tier >= 4 ? (
        // no crest in this build: the club's name, embossed, instead
        <Text style={{ position: 'absolute', top: h * 0.3, left: 0, right: 0, textAlign: 'center', fontFamily: F.display, fontSize: Math.min(w * 0.3, (w * 1.55) / Math.max(4, card.team.shortName.length)), color: '#FFFFFF', opacity: 0.12 }}>
          {card.team.shortName.toUpperCase()}
        </Text>
      ) : null}
      {animate && (card.rarity === 'icon' || look.tier >= 3) ? <Sparks w={w} h={h} color={legend ? '#F6DC8A' : '#FFFFFF'} seed={card.id} /> : null}
    </View>
  );
}

/** Small sparks drifting upward behind the player. */
function Spark({ x, h, size, delay, color }: { x: number; h: number; size: number; delay: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3200, easing: Easing.out(Easing.quad) }), -1));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0, 1], [h * 0.75, h * 0.12]) }],
    opacity: interpolate(t.value, [0, 0.15, 0.8, 1], [0, 0.9, 0.5, 0]),
  }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: size, height: size, borderRadius: size, backgroundColor: color }, st]} />;
}

function Sparks({ w, h, color, seed }: { w: number; h: number; color: string; seed: number }) {
  const reduced = useReducedMotion();
  const sparks = useMemo(() => {
    let x = seed;
    const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 6 }, (_, i) => ({ x: rand() * w, size: 1.5 + rand() * (w / 120), delay: i * 520 }));
  }, [w, seed]);
  if (reduced) return null;
  return (
    <>
      {sparks.map((s, i) => (
        <Spark key={i} x={s.x} h={h} size={s.size} delay={s.delay} color={color} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Art: the cut-out, or a kit in the club's colours
// ---------------------------------------------------------------------------

/**
 * For players without a free photo: a plain shirt in the club's two colours with
 * their position where the number would go, drawn like the comic art: an ink
 * outline and flat cel shading. Deliberately plain, so it never implies a real
 * kit design the club doesn't wear.
 */
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

// ---------------------------------------------------------------------------
// Numbers and name, Snap-style
// ---------------------------------------------------------------------------

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

/** The logo's face, top to bottom, by rarity; Premium shares the Icon gold, Legend has its own old gold. */
const LOGO_FILL: Record<PlayerCard['rarity'], [string, string, string]> = {
  icon: ['#FFF6C4', '#FFD23F', '#F29A16'],
  elite: ['#FFFFFF', '#E9EEF3', '#A9B6C4'],
  rare: ['#FFFFFF', '#E3F2FF', '#8FC8FF'],
  common: ['#FFFFFF', '#F1F3EF', '#BFC7C0'],
};
const LEGEND_FILL: [string, string, string] = ['#FFF1C2', '#F6DC8A', '#C8952B'];

/** The name as a card logo, the way Snap does it: big, slanted, extruded in 3D, outlined in ink and
 * coloured by rarity, sitting on the bottom edge and overhanging the sides. Premium cards get a gold logo. */
function NameLogo({ card, w, h, look, dim }: { card: PlayerCard; w: number; h: number; look: Look; dim: boolean }) {
  const small = w < 140;
  const label = bannerName(card.name, small ? 9 : 12).toUpperCase();
  const em = emWidth(label);
  // as wide as the card allows, capped so short names don't swallow the art (cap height is 0.8em);
  // in the grid the ink (outline and extrusion included) stays within 5px of each side, so neighbours never touch
  const fs = Math.min(h * 0.25, (w * 1.06) / em, small ? (w + 10) / (em + 0.168) : Infinity);
  // the canvas overhangs the card so the outline and extrusion never clip: shift everything right by `ox`
  const ox = w * 0.1;
  const x = w / 2 + ox;
  const y = h - frameOf(w).f * 0.2;
  const { primary } = card.team.colors;
  const legend = look.tier === 6;
  const fill = legend ? LEGEND_FILL : LOGO_FILL[look.premium ? 'icon' : card.rarity];
  // the extrusion in a deep club colour, lightened instead when it would vanish into the ink
  let depth = legend ? '#2B2412' : mix(primary, C.night, 0.35);
  if (!legend && contrast(depth, INK) < 1.5) depth = mix(primary, '#FFFFFF', 0.25);
  const dx = fs * 0.018;
  const dy = fs * 0.075;
  const len = Math.hypot(dx, dy);
  // stacked copies half a pixel apart make a solid extrusion; in the grid one copy, halfway along and
  // stroked as wide as the offset, spans the same depth with a quarter of the text to draw
  const steps = small ? 1 : Math.ceil(len / 0.5);
  const props = { fontSize: fs, fontFamily: F.display, fontWeight: '900' as const, textAnchor: 'middle' as const };
  const id = `name${card.id}_${Math.round(w)}`;
  const at = (i: number) => ({ x: x + (dx * i) / steps, y: y + (dy * i) / steps });
  return (
    <Svg width={w * 1.2} height={h + w * 0.12} style={{ position: 'absolute', left: -ox, top: 0 }} pointerEvents="none">
      <Defs>
        <SvgGrad id={id} x1="0" y1={y - fs * 0.8} x2="0" y2={y} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={fill[0]} />
          <Stop offset="0.45" stopColor={fill[1]} />
          <Stop offset="1" stopColor={fill[2]} />
        </SvgGrad>
      </Defs>
      <G transform={`translate(${x} ${y}) skewX(-8) translate(${-x} ${-y})`}>
        {/* the ink outline, swept along the extrusion so it wraps the whole letter block */}
        {Array.from({ length: steps + 1 }, (_, n) => steps - n).map((i) => (
          <SvgText key={`o${i}`} {...props} {...at(i)} fill={INK} stroke={INK} strokeWidth={fs * 0.15} strokeLinejoin="round">
            {label}
          </SvgText>
        ))}
        {/* the extrusion; the stroke fills the steps between copies */}
        {Array.from({ length: steps }, (_, n) => steps - n).map((i) => (
          <SvgText key={`d${i}`} {...props} {...at(small ? 0.5 : i)} fill={depth} stroke={depth} strokeWidth={small ? len : 0.9} strokeLinejoin="round">
            {label}
          </SvgText>
        ))}
        <SvgText {...props} x={x} y={y} fill={`url(#${id})`}>
          {label}
        </SvgText>
        {/* not collected: the logo overhangs the card, so it carries its own share of the card's dimmer */}
        {dim ? (
          <G opacity={DIM}>
            {Array.from({ length: steps + 1 }, (_, i) => (
              <SvgText key={`m${i}`} {...props} {...at(i)} fill={C.night} stroke={C.night} strokeWidth={fs * 0.15} strokeLinejoin="round">
                {label}
              </SvgText>
            ))}
          </G>
        ) : null}
      </G>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Finishes and upgrade effects
// ---------------------------------------------------------------------------

function Krackle({ w, h, seed }: { w: number; h: number; seed: number }) {
  const lines = useMemo(() => {
    let x = seed;
    const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 16 }, () => {
      let px = rand() * w;
      let py = rand() * h;
      let d = `M ${px.toFixed(1)} ${py.toFixed(1)}`;
      for (let i = 0; i < 4; i++) {
        px += (rand() - 0.5) * w * 0.35;
        py += (rand() - 0.5) * h * 0.25;
        d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
      }
      return d;
    });
  }, [w, h, seed]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((d, i) => (
        <Path key={i} d={d} stroke="rgba(246,220,138,0.6)" strokeWidth={Math.max(0.8, w / 240)} fill="none" />
      ))}
    </Svg>
  );
}

function Stellar({ w, h, seed, animate }: { w: number; h: number; seed: number; animate: boolean }) {
  const tw = useSharedValue(0);
  useEffect(() => {
    if (animate) tw.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [animate, tw]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + tw.value * 0.65 }));
  const b = useAnimatedStyle(() => ({ opacity: 1 - tw.value * 0.65 }));
  const stars = useMemo(() => {
    let x = seed;
    const rand = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
    return Array.from({ length: 30 }, () => ({ x: rand() * w, y: rand() * h, r: 0.6 + rand() * 1.6 }));
  }, [w, h, seed]);
  const field = (set: typeof stars) => (
    <Svg width={w} height={h}>
      {set.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r * (w / 200)} fill="#FFF6D6" />
      ))}
    </Svg>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, a]}>{field(stars.filter((_, i) => i % 2 === 0))}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, b]}>{field(stars.filter((_, i) => i % 2 === 1))}</Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

function Front({
  card,
  w,
  look,
  loadArt,
  animate,
  tx,
  ty,
  collected,
}: {
  card: PlayerCard;
  w: number;
  look: Look;
  loadArt: boolean;
  animate: boolean;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  collected?: boolean;
}) {
  const h = cardHeight(w);
  const k = w / 300;
  const { f, r, rIn, iw, ih } = frameOf(w);
  const art = useArt(card.id, loadArt);
  const brk = breaksFrame(card, look);
  const breakPx = brk ? Math.round(h * 0.075) : 0;
  const depth = look.tier >= 2;

  // place the cut-out so the top of the head sits above the frame (break) or just inside it,
  // big enough that the photo's bottom edge is always below the window, never a visible line
  const headY = brk ? -breakPx * 0.85 : ih * 0.06;
  const headTop = art?.headTop ?? 0.06;
  const imgH = Math.max(iw * 1.06 * (4 / 3), (ih + 2 - headY) / (1 - headTop));
  const imgW = (imgH * 3) / 4;
  const imgTop = headY - headTop * imgH;
  const imgLeft = (iw - imgW) / 2;
  // a shirt card that breaks the frame: lift the shirt so its collar crosses the top edge
  const kitDy = brk ? -(ih * 0.2) - breakPx * 0.8 : 0;
  // the face, in window coordinates: the background's halo and burst centre on it
  const fx = iw / 2;
  const fy = art ? headY + imgH * 0.17 : ih * 0.3;

  // 3D: the player moves against the tilt more than the background does
  const playerMove = useAnimatedStyle(() =>
    depth ? { transform: [{ translateX: -tx.value * w * 0.05 }, { translateY: -ty.value * h * 0.035 }] } : { transform: [{ translateX: 0 }] }
  );
  const bgMove = useAnimatedStyle(() =>
    depth ? { transform: [{ translateX: tx.value * w * 0.025 }, { translateY: ty.value * h * 0.02 }, { scale: 1.06 }] } : { transform: [{ scale: 1 }] }
  );

  const frame = look.tier >= 1 ? TIER_FRAME[look.tier] : RARITY_FRAME[card.rarity];
  const cutout = { position: 'absolute' as const, left: imgLeft, top: imgTop, width: imgW, height: imgH };
  // Premium cards show the poster version of the art, where there is one
  const src = look.premium && art?.premium ? art.premium : art?.src ?? '';
  const outlinePx = Math.max(1.5, 3.2 * k);
  // a soft shadow cast on the backdrop, so the player stands in the card rather than on it
  const shadow = art ? (
    <Image
      source={{ uri: src }}
      style={[cutout, { left: imgLeft + 4 * k, top: imgTop + 6 * k, opacity: 0.55 }]}
      tintColor={C.night}
      blurRadius={Math.max(2, 7 * k)}
      resizeMode="cover"
    />
  ) : null;
  const sticker = look.premium && art ? (
    // Premium: a sticker-style white outline around the player
    // (white copies nudged in eight directions, so the outline is the same thickness all the way round)
    <>
      {OUTLINE.map(([dx, dy], i) => (
        <Image key={i} source={{ uri: src }} style={[cutout, { left: imgLeft + dx * outlinePx, top: imgTop + dy * outlinePx }]} tintColor="#FFFFFF" resizeMode="cover" />
      ))}
    </>
  ) : null;

  return (
    <View style={{ width: w, height: h }}>
      {/* the frame: a thin band of flat metal in the rarity or tier colour, a dark line round the outside */}
      <LinearGradient colors={frame} start={FRAME_START} end={FRAME_END} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]} />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: rIn, overflow: 'hidden', backgroundColor: card.team.colors.primary }}>
        <Animated.View style={[StyleSheet.absoluteFill, bgMove]}>
          <Background card={card} w={iw} h={ih} cardW={w} fx={fx} fy={fy} look={look} animate={animate} kit={!art} />
          {look.tier === 6 && look.finish === 'stellar' ? <Stellar w={iw} h={ih} seed={card.id} animate={animate} /> : null}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, playerMove]}>
          {art ? (
            <>
              {shadow}
              {sticker}
              <Image source={{ uri: src }} style={cutout} resizeMode="cover" accessibilityIgnoresInvertColors />
            </>
          ) : (
            <View style={{ position: 'absolute', left: 0, top: kitDy, width: iw, height: ih }}>
              <KitArt card={card} w={iw} h={ih} />
            </View>
          )}
        </Animated.View>
        {/* a light darkening along the bottom, under the name logo */}
        <LinearGradient colors={[alpha(C.night, 0), alpha(C.night, 0.55)]} locations={[0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFill, { borderRadius: rIn, borderWidth: Math.max(1, 1.5 * k), borderColor: 'rgba(10,14,11,0.85)' }]} pointerEvents="none" />
      </View>

      {/* not in your collection yet: dimmed, never see-through. Drawn before the frame break, logo and badges,
          which overhang the card and so carry their own share of it */}
      {collected === false ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: alpha(C.night, DIM) }]} /> : null}

      {/* frame break: the part of the player (or the shirt's collar and shoulders) above the window, drawn over the frame */}
      {brk ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: f, top: -breakPx, width: iw, height: breakPx + f + 1, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: breakPx + f, width: iw, height: ih }, playerMove]}>
            {art ? (
              <>
                {sticker}
                <Image source={{ uri: src }} style={cutout} resizeMode="cover" />
                {collected === false ? <Image source={{ uri: src }} style={[cutout, { opacity: DIM }]} tintColor={C.night} resizeMode="cover" /> : null}
              </>
            ) : (
              <View style={{ position: 'absolute', left: 0, top: kitDy, width: iw, height: ih }}>
                <KitArt card={card} w={iw} h={ih} dim={collected === false} />
              </View>
            )}
          </Animated.View>
        </View>
      ) : null}

      {/* rarity reads from the frame and the logo; nothing else on the face, as on a Snap card */}
      <NameLogo card={card} w={w} h={h} look={look} dim={collected === false} />
      <Badges card={card} w={w} dim={collected === false} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The back: real stats and abilities
// ---------------------------------------------------------------------------

function Stat({ value, label, k }: { value: string | number; label: string; k: number }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontFamily: F.numHeavy, fontSize: 30 * k + 4, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.label, fontSize: 10 * k + 3, letterSpacing: 1.2, color: C.muted }}>{label}</Text>
    </View>
  );
}

function Back({ card, w, competition, look }: { card: PlayerCard; w: number; competition: string; look: Look }) {
  const h = cardHeight(w);
  const k = w / 300;
  const { f, r, rIn, iw, ih } = frameOf(w);
  const pad = 14 * k + 4;
  const s = card.stats;
  const g = cardStats(card);
  const art = useArt(card.id);
  const dash = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v);
  const frame = look.tier >= 1 ? TIER_FRAME[look.tier] : RARITY_FRAME[card.rarity];
  const primary = card.team.colors.primary;
  const accent = RARITY_COLOR[card.rarity];
  const rarityWhy =
    card.rank !== null
      ? `#${card.rank} by goals × 2 + assists among the ${competition}'s top 20 scorers.`
      : `Not in the ${competition}'s top 20 scorers.`;
  return (
    <View style={{ width: w, height: h }}>
      <LinearGradient colors={frame} start={FRAME_START} end={FRAME_END} style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]} />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: rIn, overflow: 'hidden', padding: pad }}>
        <LinearGradient colors={[mix(primary, C.night, 0.5), mix(primary, C.night, 0.78), C.night]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
        {card.team.crest ? (
          <Image source={{ uri: card.team.crest }} style={{ position: 'absolute', width: iw * 0.62, height: iw * 0.62, right: -iw * 0.12, bottom: ih * 0.1, opacity: 0.06 }} resizeMode="contain" />
        ) : null}

        <Text style={[styles.backName, { fontSize: 26 * k + 4 }]} numberOfLines={1} adjustsFontSizeToFit>{card.name.toUpperCase()}</Text>
        <Text style={[styles.backMeta, { fontSize: 12.5 * k + 2 }]} numberOfLines={1}>
          {[card.position, card.age !== null ? `${card.age}` : null, card.nationality, card.team.shortName].filter(Boolean).join(' · ')}
        </Text>

        <View style={[styles.statsRow, { marginTop: 12 * k + 2 }]}>
          <Stat value={dash(s?.goals ?? (s ? 0 : null))} label="GOALS" k={k} />
          <Stat value={dash(s?.assists)} label="ASSISTS" k={k} />
          <Stat value={dash(s?.penalties)} label="PENS" k={k} />
          <Stat value={dash(s?.played)} label="GAMES" k={k} />
        </View>

        <View style={{ flexDirection: 'row', gap: 6 * k + 2, marginTop: 10 * k + 2 }}>
          <View style={[styles.backChip, { borderColor: 'rgba(127,196,255,0.5)' }]}>
            <Text style={[styles.backChipText, { fontSize: 10 * k + 3, color: '#9FD0FF' }]}>COST {g.cost}</Text>
          </View>
          <View style={[styles.backChip, { borderColor: 'rgba(255,193,90,0.5)' }]}>
            <Text style={[styles.backChipText, { fontSize: 10 * k + 3, color: '#FFC15A' }]}>POWER {g.power}</Text>
          </View>
          <View style={[styles.backChip, { borderColor: alpha(accent, 0.5) }]}>
            <Text style={[styles.backChipText, { fontSize: 10 * k + 3, color: accent }]}>{RARITY_NAME[card.rarity].toUpperCase()}</Text>
          </View>
        </View>

        <View style={{ gap: 8 * k + 2, marginTop: 12 * k + 2 }}>
          {card.abilities.map((a) => (
            <View key={a.title} style={{ borderLeftWidth: 2, borderLeftColor: alpha(accent, 0.7), paddingLeft: 8 * k + 2 }}>
              <Text style={[styles.abilityKind, { color: accent, fontSize: 10 * k + 3 }]}>{a.kind === 'ongoing' ? 'THIS SEASON' : 'TRAIT'} · {a.title.toUpperCase()}</Text>
              <Text style={[styles.abilityText, { fontSize: 13 * k + 2, lineHeight: 17 * k + 3 }]}>{a.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />
        <Text style={[styles.backFine, { fontSize: 10 * k + 2, lineHeight: 13.5 * k + 2 }]}>
          {rarityWhy} Cost and Power come from rarity and goals. Stats: football-data.org.
          {art ? ` Photo: ${art.artist}, ${art.license}.` : ''}
        </Text>
        <View style={[StyleSheet.absoluteFill, { borderRadius: rIn, borderWidth: Math.max(1, 1.2 * k), borderColor: 'rgba(10,14,11,0.75)' }]} pointerEvents="none" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function SnapCard({
  card,
  size = 'md',
  width,
  flipped = false,
  interactive = false,
  idleShimmer = false,
  collected,
  competition = '',
  loadPhoto = true,
  look = BASE_LOOK,
}: {
  card: PlayerCard;
  size?: CardSize;
  width?: number;
  flipped?: boolean;
  interactive?: boolean;
  idleShimmer?: boolean;
  collected?: boolean;
  competition?: string;
  loadPhoto?: boolean;
  look?: Look;
}) {
  const w = width ?? WIDTH[size];
  const h = cardHeight(w);
  const { r } = frameOf(w);
  const reduced = useReducedMotion();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flip = useSharedValue(flipped ? 1 : 0);
  const idle = useSharedValue(0);
  const animate = (interactive || idleShimmer) && !reduced;
  const foil = card.rarity === 'icon' || card.rarity === 'elite' || look.tier >= 5 || look.premium || look.tier === 6;

  useEffect(() => {
    flip.value = reduced ? (flipped ? 1 : 0) : withTiming(flipped ? 1 : 0, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [flipped, reduced, flip]);

  // gyroscope tilt on phones
  useEffect(() => {
    if (!interactive || reduced || Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    DeviceMotion.isAvailableAsync().then((ok) => {
      if (!ok) return;
      DeviceMotion.setUpdateInterval(33);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        tx.value = withTiming(Math.max(-1, Math.min(1, rotation.gamma / 0.6)), { duration: 90 });
        ty.value = withTiming(Math.max(-1, Math.min(1, (rotation.beta - 0.7) / 0.6)), { duration: 90 });
      });
    });
    return () => sub?.remove();
  }, [interactive, reduced, tx, ty]);

  // a slow sway so foil moves even when nobody's touching it
  useEffect(() => {
    if (!animate || !foil) return;
    idle.value = withRepeat(withSequence(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 2800, easing: Easing.inOut(Easing.sin) })), -1);
  }, [animate, foil, idle]);

  const tilt = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${tx.value * 11}deg` }, { rotateX: `${-ty.value * 11}deg` }],
  }));
  const frontSide = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const backSide = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));
  const foilStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (tx.value + idle.value * 0.6) * w * 0.55 - w * 0.5 }, { rotate: '25deg' }] }));
  const glareStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (-tx.value - idle.value * 0.4) * w * 0.7 }, { translateY: ty.value * h * 0.2 }],
    opacity: 0.05 + Math.abs(tx.value + idle.value * 0.5) * 0.12,
  }));

  const responders = interactive
    ? {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderMove: (e: { nativeEvent: { locationX: number; locationY: number } }) => {
          if (reduced) return;
          tx.value = Math.max(-1, Math.min(1, (e.nativeEvent.locationX / w) * 2 - 1));
          ty.value = Math.max(-1, Math.min(1, (e.nativeEvent.locationY / h) * 2 - 1));
        },
        onResponderRelease: () => {
          tx.value = withTiming(0, { duration: 500 });
          ty.value = withTiming(0, { duration: 500 });
        },
      }
    : {};

  const holo: Grad =
    look.tier === 6 && look.finish === 'gold'
      ? ['rgba(246,220,138,0)', 'rgba(246,220,138,0.32)', 'rgba(255,255,255,0.22)', 'rgba(217,178,76,0.32)', 'rgba(246,220,138,0)']
      : look.tier === 6 && look.finish === 'prism'
      ? ['rgba(255,40,120,0)', 'rgba(255,40,120,0.24)', 'rgba(255,214,60,0.24)', 'rgba(40,255,190,0.24)', 'rgba(70,120,255,0.24)', 'rgba(200,60,255,0.24)', 'rgba(255,40,120,0)']
      : card.rarity === 'icon' || look.tier >= 5 || look.premium
      ? ['rgba(255,60,140,0)', 'rgba(255,60,140,0.15)', 'rgba(255,214,90,0.16)', 'rgba(80,255,200,0.15)', 'rgba(90,140,255,0.16)', 'rgba(255,60,140,0)']
      : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.2)', 'rgba(200,215,230,0.1)', 'rgba(255,255,255,0)'];

  return (
    <Animated.View
      style={[{ width: w, height: h }, tilt]}
      {...responders}
      accessible
      accessibilityLabel={`${card.name}, ${RARITY_NAME[card.rarity]} card. ${card.abilities.map((a) => a.text).join(' ')}`}
    >
      <Animated.View style={[StyleSheet.absoluteFill, frontSide, { backfaceVisibility: 'hidden' }]}>
        <Front card={card} w={w} look={look} loadArt={loadPhoto} animate={animate} tx={tx} ty={ty} collected={collected} />
        {foil ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
            <Animated.View style={[{ position: 'absolute', top: -h * 0.25, width: w * 2, height: h * 1.5 }, foilStyle]}>
              <LinearGradient colors={holo} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', top: -h * 0.1, left: w * 0.15, width: w * 0.7, height: h * 1.2, borderRadius: w }, glareStyle]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>
        ) : null}
        {look.tier === 6 && look.finish === 'krackle' ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
            <Krackle w={w} h={h} seed={card.id} />
          </View>
        ) : null}

      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, backSide, { backfaceVisibility: 'hidden' }]}>
        <Back card={card} w={w} competition={competition} look={look} />
      </Animated.View>
    </Animated.View>
  );
}

/** The face-down card, for packs: the same metal frame as the face, a pitch drawn in fine lines, the wordmark. */
export function CardBack({ width }: { width: number }) {
  const h = cardHeight(width);
  const k = width / 300;
  const { f, r, rIn, iw, ih } = frameOf(width);
  const line = 'rgba(245,196,81,0.22)';
  const sw = Math.max(1, 1.4 * k);
  // a full pitch, top to bottom, inset in the window
  const px = iw * 0.1;
  const py = ih * 0.06;
  const pw = iw - px * 2;
  const ph = ih - py * 2;
  return (
    <View style={{ width, height: h }}>
      <LinearGradient colors={['#4A4F48', '#1C211D', '#3E433C', '#191D1A']} start={FRAME_START} end={FRAME_END} style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]} />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: rIn, overflow: 'hidden' }}>
        <LinearGradient colors={['#173022', '#0E1B14', '#0A120D']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <Svg width={iw} height={ih} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`backglow${Math.round(width)}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#F5C451" stopOpacity="0.14" />
              <Stop offset="1" stopColor="#F5C451" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={iw} height={ih} fill={`url(#backglow${Math.round(width)})`} />
          <Rect x={px} y={py} width={pw} height={ph} stroke={line} strokeWidth={sw} fill="none" />
          <Path d={`M ${px} ${ih / 2} H ${px + pw}`} stroke={line} strokeWidth={sw} />
          <Circle cx={iw / 2} cy={ih / 2} r={pw * 0.2} stroke={line} strokeWidth={sw} fill="none" />
          {[py, py + ph].map((y, n) => (
            <G key={n}>
              <Rect x={iw / 2 - pw * 0.3} y={n ? y - ph * 0.14 : y} width={pw * 0.6} height={ph * 0.14} stroke={line} strokeWidth={sw} fill="none" />
              <Rect x={iw / 2 - pw * 0.13} y={n ? y - ph * 0.05 : y} width={pw * 0.26} height={ph * 0.05} stroke={line} strokeWidth={sw} fill="none" />
            </G>
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ backgroundColor: '#0E1B14', paddingHorizontal: 10 * k + 4, paddingVertical: 4 * k + 2, borderRadius: 4, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: 30 * k + 6, color: '#F3F1E7', letterSpacing: 2 * k + 0.5 }}>FOOTSNAP</Text>
            <View style={{ width: 8 * k + 4, height: 8 * k + 4, marginTop: 4 * k + 1, transform: [{ rotate: '45deg' }], backgroundColor: '#F5C451' }} />
          </View>
        </View>
        <View style={[StyleSheet.absoluteFill, { borderRadius: rIn, borderWidth: Math.max(1, 1.2 * k), borderColor: 'rgba(10,14,11,0.75)' }]} />
      </View>
    </View>
  );
}

/** Credit line for the card's photo: photographer, licence, link to the original. */
export function PhotoCredit({ card }: { card: PlayerCard }) {
  const art = useArt(card.id);
  if (!art) return null;
  return (
    <Pressable onPress={() => Linking.openURL(art.page)} accessibilityRole="link" hitSlop={8}>
      <Text style={styles.credit} numberOfLines={2}>
        Photo: {art.artist} · {art.license} · Wikimedia Commons (edited) ↗
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(10,14,11,0.35)' },
  backChipText: { fontFamily: F.label, letterSpacing: 1.1 },
  backName: { fontFamily: F.display, color: C.chalk },
  backMeta: { fontFamily: F.body, color: C.chalk2, marginTop: 2 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(243,241,231,0.15)', paddingVertical: 10 },
  abilityKind: { fontFamily: F.label, letterSpacing: 1.1 },
  abilityText: { fontFamily: F.bodyMedium, color: C.chalk },
  backFine: { fontFamily: F.body, color: C.chalk2 },
  credit: { fontFamily: F.body, fontSize: 12, color: C.muted, textDecorationLine: 'underline', textAlign: 'center', maxWidth: 320 },
});
