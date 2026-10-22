/**
 * The player card, built the way Marvel Snap builds its cards:
 *
 *   - the art is the card: a cut-out of the player (background removed, from a
 *     freely licensed Wikimedia photo) standing in a studio-lit backdrop in the
 *     club's colours, with a soft shadow behind them
 *   - Cost top-left and Power top-right (the Duel game's stats, derived from
 *     real data in lib/game.ts), and the name set big at the bottom, where the
 *     art fades out; nothing else on the face
 *   - rarer cards come alive: Elite and Icon backgrounds rotate and sparkle, and
 *     their player breaks out over the top of the frame
 *   - upgrades work like Snap's: the frame colour follows the upgrade tier, and
 *     each tier adds an effect (frame break, 3D parallax, glow, crest, holo,
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
import Svg, { Defs, LinearGradient as SvgGrad, RadialGradient, Stop, Rect, Circle, Path, G, Text as SvgText } from 'react-native-svg';
import { DeviceMotion } from 'expo-sensors';
import type { PlayerCard } from '../lib/cards';
import { RARITY_NAME, bannerName } from '../lib/cards';
import type { Finish, Tier } from '../lib/collection';
import { cardStats } from '../lib/game';
import { useArt } from '../lib/art';
import { alpha, backdropFor, mix } from '../lib/colors';
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

type Grad = [string, string, ...string[]];
/** Base cards wear their rarity; upgraded cards wear their upgrade tier, the way Snap colours frames. */
export const RARITY_FRAME: Record<PlayerCard['rarity'], Grad> = {
  common: ['#8E978F', '#4B544D', '#A9B1AA', '#4B544D'],
  rare: ['#8CC8FF', '#2C6FB8', '#BFE2FF', '#2C6FB8'],
  elite: ['#F5F8FB', '#8B96A3', '#EEF2F6', '#76818E', '#F5F8FB'],
  icon: ['#FFF1C2', '#C8952B', '#FFE59A', '#9E711C', '#FFF1C2'],
};
const TIER_FRAME: Record<number, Grad> = {
  1: ['#7DF0A6', '#1F8A47', '#B8FFD2', '#1F8A47'],
  2: ['#7FC2FF', '#1D5FB0', '#C2E3FF', '#1D5FB0'],
  3: ['#C9A2FF', '#6331B5', '#E5D3FF', '#6331B5'],
  4: ['#FFC170', '#B4560F', '#FFE1B0', '#B4560F'],
  5: ['#7FF5EE', '#138C93', '#C9FFFB', '#138C93', '#FFD1F0'],
  6: ['#151515', '#D9B24C', '#0B0B0B', '#F6DC8A', '#151515'],
};
const RARITY_COLOR = { common: C.common, rare: C.rare, elite: C.elite, icon: C.icon } as const;

const OUTLINE: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

export const breaksFrame = (card: PlayerCard, look: Look) => look.tier >= 1 || card.rarity === 'icon' || card.rarity === 'elite';

// ---------------------------------------------------------------------------
// Background: the club's colours, alive on rarer cards
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

function Background({ card, w, h, look, animate, kit }: { card: PlayerCard; w: number; h: number; look: Look; animate: boolean; kit: boolean }) {
  const { primary, secondary, accent } = card.team.colors;
  const legend = look.tier === 6;
  const lively = card.rarity === 'icon' || look.tier >= 3 || look.premium;
  const spin = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (animate && lively && !reduced) spin.value = withRepeat(withTiming(1, { duration: 60000, easing: Easing.linear }), -1);
  }, [animate, lively, reduced, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const id = `bg${card.id}_${Math.round(w)}`;
  const S = Math.hypot(w, h) * 1.25;
  // the sky over the stadium: the club colour, darkening upward into the night
  const base = legend ? '#2B2412' : kit ? backdropFor(primary, secondary, C.night) : look.premium ? mix(primary, C.night, 0.55) : primary;
  const sky = [mix(base, C.night, 0.55), mix(base, C.night, 0.15), mix(base, '#FFFFFF', 0.06)];
  const beam = legend ? '#F6DC8A' : '#FFFFFF';
  const stand = mix(base, C.night, 0.72);
  const standLit = mix(base, C.night, 0.5);
  const crowd = mix(accent, '#FFFFFF', 0.3);
  const pitchA = mix('#2E7D46', base, 0.35);
  const pitchB = mix('#3A9156', base, 0.35);
  // the stands: a stepped bowl across the back of the picture
  const sy = h * 0.5;
  const standPath = `M 0 ${sy + h * 0.06} L ${w * 0.18} ${sy + h * 0.02} L ${w * 0.18} ${sy} L ${w * 0.5} ${sy - h * 0.02} L ${w * 0.82} ${sy} L ${w * 0.82} ${sy + h * 0.02} L ${w} ${sy + h * 0.06} L ${w} ${h * 0.7} L 0 ${h * 0.7} Z`;
  const dots = useMemo(() => {
    let x = card.id;
    const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 70 }, () => {
      const fx = rand();
      const top = fx < 0.18 || fx > 0.82 ? sy + h * 0.04 : sy;
      return { x: fx * w, y: top + rand() * (h * 0.66 - top), r: 0.5 + rand() * Math.max(0.6, w / 260) };
    });
  }, [card.id, w, h, sy]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={sky as [string, string, string]} locations={[0, 0.45, 0.6]} style={StyleSheet.absoluteFill} />
      {lively ? (
        <Animated.View style={[{ position: 'absolute', width: S, height: S, left: w / 2 - S / 2, top: h * 0.3 - S / 2 }, spinStyle]}>
          <Rays size={S} color={alpha(legend ? '#F6DC8A' : '#FFFFFF', 0.05)} count={18} />
        </Animated.View>
      ) : null}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGrad id={`${id}beam`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={beam} stopOpacity={0.32} />
            <Stop offset="1" stopColor={beam} stopOpacity={0} />
          </SvgGrad>
          <RadialGradient id={`${id}lamp`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.35" stopColor={beam} stopOpacity="0.7" />
            <Stop offset="1" stopColor={beam} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}l`} cx="50%" cy="34%" r="45%">
            <Stop offset="0" stopColor={mix(accent, '#FFFFFF', 0.5)} stopOpacity={lively ? 0.45 : 0.3} />
            <Stop offset="1" stopColor={accent} stopOpacity="0" />
          </RadialGradient>
          <SvgGrad id={`${id}pitch`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={pitchA} />
            <Stop offset="1" stopColor={mix(pitchA, C.night, 0.6)} />
          </SvgGrad>
        </Defs>
        {/* floodlight beams from the two pylons */}
        <Path d={`M ${w * 0.04} ${h * 0.05} L ${w * 0.1} ${h * 0.05} L ${w * 0.62} ${h * 0.62} L ${w * 0.2} ${h * 0.62} Z`} fill={`url(#${id}beam)`} />
        <Path d={`M ${w * 0.96} ${h * 0.05} L ${w * 0.9} ${h * 0.05} L ${w * 0.38} ${h * 0.62} L ${w * 0.8} ${h * 0.62} Z`} fill={`url(#${id}beam)`} />
        <Rect width={w} height={h} fill={`url(#${id}l)`} />
        {/* the stands, with the crowd as specks of colour */}
        <Path d={standPath} fill={stand} />
        <Path d={`M 0 ${sy + h * 0.06} L ${w * 0.18} ${sy + h * 0.02} L ${w * 0.18} ${sy} L ${w * 0.5} ${sy - h * 0.02} L ${w * 0.82} ${sy} L ${w * 0.82} ${sy + h * 0.02} L ${w} ${sy + h * 0.06}`} stroke={standLit} strokeWidth={Math.max(1, w / 150)} fill="none" />
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={i % 3 ? crowd : '#FFFFFF'} opacity={i % 3 ? 0.35 : 0.22} />
        ))}
        {/* the pitch, mown in stripes */}
        <Rect y={h * 0.66} width={w} height={h * 0.34} fill={`url(#${id}pitch)`} />
        {Array.from({ length: 6 }, (_, i) => (
          <Rect key={i} x={(i * w) / 6} y={h * 0.66} width={w / 12} height={h * 0.34} fill={pitchB} opacity={0.25} />
        ))}
        {/* the lamps themselves */}
        {[0.07, 0.93].map((fx) => (
          <G key={fx}>
            <Rect x={w * fx - w * 0.045} y={h * 0.03} width={w * 0.09} height={h * 0.03} rx={1} fill={mix(C.night, '#FFFFFF', 0.2)} />
            <Circle cx={w * fx} cy={h * 0.045} r={w * 0.09} fill={`url(#${id}lamp)`} />
          </G>
        ))}
      </Svg>
      {look.tier >= 4 && card.team.crest ? (
        <Image source={{ uri: card.team.crest }} style={{ position: 'absolute', width: w * 0.9, height: w * 0.9, left: w * 0.05, top: h * 0.08, opacity: 0.09 }} resizeMode="contain" />
      ) : look.tier >= 4 ? (
        // no crest in this build: the club's name, embossed, instead
        <Text style={{ position: 'absolute', top: h * 0.3, left: 0, right: 0, textAlign: 'center', fontFamily: F.display, fontSize: Math.min(w * 0.3, (w * 1.55) / Math.max(4, card.team.shortName.length)), color: '#FFFFFF', opacity: 0.08 }}>
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
 * their initials as the number. Deliberately plain, so it never implies a real
 * kit design the club doesn't wear.
 */
export function KitArt({ card, w, h, top = 0.2, silhouette = false }: { card: PlayerCard; w: number; h: number; top?: number; silhouette?: boolean }) {
  const { primary, secondary } = card.team.colors;
  const sw = w * 0.95;
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
  const rim = mix(silhouette ? card.team.colors.accent : secondary, '#FFFFFF', 0.4);
  const sk = Math.max(1, w / 140);
  if (silhouette) {
    return (
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Path d={shirt} fill="none" stroke={rim} strokeWidth={sk * 2.4} opacity={0.85} transform={`translate(0 ${-sk})`} />
        <Path d={shirt} fill="#0B100C" />
      </Svg>
    );
  }
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGrad id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mix(primary, '#FFFFFF', 0.14)} />
          <Stop offset="0.55" stopColor={primary} />
          <Stop offset="1" stopColor={mix(primary, C.night, 0.35)} />
        </SvgGrad>
        <SvgGrad id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.3" />
          <Stop offset="0.22" stopColor="#000000" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.1" />
          <Stop offset="0.78" stopColor="#000000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.3" />
        </SvgGrad>
        <RadialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* floor shadow and a soft drop shadow */}
      <Rect x={x0 + sw * 0.1} y={y0 + sh * 0.93} width={sw * 0.8} height={sh * 0.16} fill={`url(#${id}g)`} />
      <Path d={shirt} fill={C.night} opacity={0.3} transform={`translate(${w * 0.018} ${w * 0.026})`} />
      {/* rim light round the outline */}
      <Path d={shirt} fill="none" stroke={rim} strokeWidth={sk * 2.2} strokeLinejoin="round" opacity={0.7} />
      <Path d={shirt} fill={`url(#${id}f)`} stroke={mix(primary, C.night, 0.45)} strokeWidth={sk * 0.8} strokeLinejoin="round" />
      {/* the inside of the back of the neck, so it reads as a garment */}
      <Path d={`M ${P(0.39, 0.025)} Q ${P(0.5, 0.075)} ${P(0.61, 0.025)} Q ${P(0.5, 0.11)} ${P(0.39, 0.025)} Z`} fill={mix(primary, C.night, 0.6)} />
      {/* sleeve cuffs in the second colour */}
      <Path d={`M ${P(0.015, 0.29)} L ${P(0.135, 0.405)} L ${P(0.16, 0.38)} L ${P(0.04, 0.265)} Z`} fill={secondary} />
      <Path d={`M ${P(0.985, 0.29)} L ${P(0.865, 0.405)} L ${P(0.84, 0.38)} L ${P(0.96, 0.265)} Z`} fill={secondary} />
      {/* fabric: darker sides, a highlight down the chest, a few soft folds */}
      <Path d={shirt} fill={`url(#${id}s)`} />
      <Path d={`M ${P(0.3, 0.55)} Q ${P(0.36, 0.75)} ${P(0.3, 0.95)}`} stroke="#000000" strokeOpacity={0.09} strokeWidth={sk * 2} fill="none" />
      <Path d={`M ${P(0.7, 0.5)} Q ${P(0.64, 0.72)} ${P(0.69, 0.95)}`} stroke="#000000" strokeOpacity={0.08} strokeWidth={sk * 2} fill="none" />
      <Path d={`M ${P(0.2, 0.16)} Q ${P(0.3, 0.24)} ${P(0.27, 0.34)}`} stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={sk * 1.6} fill="none" />
      {/* collar */}
      <Path d={`M ${P(0.37, 0.02)} Q ${P(0.5, 0.13)} ${P(0.63, 0.02)}`} stroke={secondary} strokeWidth={Math.max(2, w / 45)} fill="none" strokeLinecap="round" />
      {/* the player's position where a number would go: real information, not a made-up number */}
      <SvgText
        x={w / 2}
        y={y0 + sh * 0.64}
        fontSize={sw * 0.26}
        fontFamily={F.numHeavy}
        fill={secondary}
        stroke={mix(secondary, C.night, 0.6)}
        strokeWidth={Math.max(0.8, w / 200)}
        textAnchor="middle"
        letterSpacing={sw * 0.01}
      >
        {card.line}
      </SvgText>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Numbers and name, Snap-style
// ---------------------------------------------------------------------------

/** A big outlined number: white with a heavy dark outline, like Snap's Cost and Power. */
function BigNumber({ value, size, x, y }: { value: number; size: number; x: number; y: number }) {
  return (
    <>
      <SvgText x={x} y={y} fontSize={size} fontFamily={F.numHeavy} fill="none" stroke={C.night} strokeWidth={Math.max(2, size * 0.16)} strokeLinejoin="round" textAnchor="middle">
        {value}
      </SvgText>
      <SvgText x={x} y={y} fontSize={size} fontFamily={F.numHeavy} fill="#FFFFFF" textAnchor="middle">
        {value}
      </SvgText>
    </>
  );
}

/** Cost (blue gem, top-left) and Power (orange shield, top-right). */
export function Badges({ card, w }: { card: PlayerCard; w: number }) {
  const k = w / 300;
  const s = cardStats(card);
  const d = Math.max(22, w * 0.24);
  const fs = d * 0.6;
  const id = `${card.id}_${Math.round(w)}`;
  return (
    <>
      <Svg width={d} height={d} style={{ position: 'absolute', left: -d * 0.12, top: -d * 0.12 }} pointerEvents="none">
        <Defs>
          <RadialGradient id={`cost${id}`} cx="40%" cy="35%" r="70%">
            <Stop offset="0" stopColor="#7FC4FF" />
            <Stop offset="0.6" stopColor="#2563EB" />
            <Stop offset="1" stopColor="#13306E" />
          </RadialGradient>
        </Defs>
        <Circle cx={d / 2} cy={d / 2} r={d / 2 - 2} fill={`url(#cost${id})`} stroke={C.night} strokeWidth={Math.max(2, 3 * k)} />
        <Circle cx={d / 2} cy={d / 2} r={d / 2 - 2 - Math.max(2, 4 * k)} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={Math.max(1, 1.5 * k)} />
        <BigNumber value={s.cost} size={fs} x={d / 2} y={d / 2 + fs * 0.36} />
      </Svg>
      <Svg width={d} height={d * 1.1} style={{ position: 'absolute', right: -d * 0.12, top: -d * 0.14 }} pointerEvents="none">
        <Defs>
          <SvgGrad id={`pow${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFC15A" />
            <Stop offset="0.55" stopColor="#F2711C" />
            <Stop offset="1" stopColor="#A33A07" />
          </SvgGrad>
        </Defs>
        <Path
          d={`M ${d * 0.5} 2 L ${d - 3} ${d * 0.18} L ${d - 3} ${d * 0.58} Q ${d - 3} ${d * 0.9} ${d * 0.5} ${d * 1.08} Q 3 ${d * 0.9} 3 ${d * 0.58} L 3 ${d * 0.18} Z`}
          fill={`url(#pow${id})`}
          stroke={C.night}
          strokeWidth={Math.max(2, 3 * k)}
        />
        <BigNumber value={s.power} size={fs} x={d / 2} y={d * 0.52 + fs * 0.36} />
      </Svg>
    </>
  );
}

/** The name as a card logo, the way Snap does it: big, slanted, extruded in 3D, outlined in ink and
 * coloured by rarity, sitting across the bottom edge of the card. Premium cards get a gold logo. */
function NameLogo({ card, w, h, premium }: { card: PlayerCard; w: number; h: number; premium: boolean }) {
  const k = w / 300;
  const small = w < 140;
  const banner = bannerName(card.name, small ? 9 : 12);
  const label = banner.toUpperCase();
  const size = Math.min(62 * k + 8, (w * 1.62) / Math.max(4, label.length));
  const y = h * 0.955;
  const at = card.name.toLowerCase().lastIndexOf(banner.toLowerCase());
  const first = !small && at > 0 ? card.name.slice(0, at).trim().toUpperCase() : '';
  const { primary, accent } = card.team.colors;
  const fill: [string, string] =
    premium || card.rarity === 'icon'
      ? ['#FFF4C9', '#E2A93B']
      : card.rarity === 'elite'
      ? ['#FFFFFF', mix(accent, '#FFFFFF', 0.15)]
      : card.rarity === 'rare'
      ? ['#FFFFFF', mix(accent, '#FFFFFF', 0.45)]
      : ['#FFFFFF', '#C9D1CB'];
  const depth = mix(premium || card.rarity === 'icon' ? '#7A4E10' : primary, C.night, 0.45);
  const props = { x: w / 2, fontSize: size, fontFamily: F.display, fontWeight: '900' as const, textAnchor: 'middle' as const, letterSpacing: size * 0.01 };
  const id = `name${card.id}_${Math.round(w)}`;
  const layers = Math.max(3, Math.round(size / 9));
  const step = size * 0.022;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgGrad id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.15" stopColor={fill[0]} />
          <Stop offset="1" stopColor={fill[1]} />
        </SvgGrad>
      </Defs>
      {first ? (
        <>
          <SvgText x={w / 2} y={y - size * 0.86} fontSize={size * 0.3} fontFamily={F.label} letterSpacing={2 * k + 0.5} fill="none" stroke={C.night} strokeWidth={Math.max(2.5, size * 0.09)} strokeLinejoin="round" textAnchor="middle">
            {first}
          </SvgText>
          <SvgText x={w / 2} y={y - size * 0.86} fontSize={size * 0.3} fontFamily={F.label} letterSpacing={2 * k + 0.5} fill="#FFFFFF" textAnchor="middle">
            {first}
          </SvgText>
        </>
      ) : null}
      <G transform={`translate(${w / 2} ${y}) skewX(-8) translate(${-w / 2} ${-y})`}>
        {/* the ink outline, fattened so it also wraps the extrusion */}
        {Array.from({ length: layers }, (_, i) => (
          <SvgText key={`o${i}`} {...props} x={w / 2 + (i + 1) * step} y={y + (i + 1) * step * 1.3} fill={C.night} stroke={C.night} strokeWidth={Math.max(2, size * 0.13)} strokeLinejoin="round">
            {label}
          </SvgText>
        ))}
        {/* the extrusion: stacked copies in a deep club colour */}
        {Array.from({ length: layers }, (_, i) => (
          <SvgText key={`d${i}`} {...props} x={w / 2 + (layers - i) * step} y={y + (layers - i) * step * 1.3} fill={depth}>
            {label}
          </SvgText>
        ))}
        <SvgText {...props} y={y} fill="none" stroke={C.night} strokeWidth={Math.max(2, size * 0.13)} strokeLinejoin="round">
          {label}
        </SvgText>
        <SvgText {...props} y={y} fill={`url(#${id})`}>
          {label}
        </SvgText>
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

function PulseRing({ w, h, r, color, animate }: { w: number; h: number; r: number; color: string; animate: boolean }) {
  const p = useSharedValue(0.5);
  useEffect(() => {
    if (animate) p.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.25, { duration: 900 })), -1);
  }, [animate, p]);
  const st = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: r, borderWidth: Math.max(1.5, w / 120), borderColor: color, shadowColor: color, shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
        st,
      ]}
    />
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
  const f = Math.max(3, Math.round(6 * k));
  const r = 16 * k + 4;
  const iw = w - f * 2;
  const ih = h - f * 2;
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

  // 3D: the player moves against the tilt more than the background does
  const playerMove = useAnimatedStyle(() =>
    depth ? { transform: [{ translateX: -tx.value * w * 0.05 }, { translateY: -ty.value * h * 0.035 }] } : { transform: [{ translateX: 0 }] }
  );
  const bgMove = useAnimatedStyle(() =>
    depth ? { transform: [{ translateX: tx.value * w * 0.025 }, { translateY: ty.value * h * 0.02 }, { scale: 1.06 }] } : { transform: [{ scale: 1 }] }
  );

  const frame = look.tier >= 1 ? TIER_FRAME[look.tier] : RARITY_FRAME[card.rarity];
  // the art fades into a deep shade of the club colour behind the name
  const fade = mix(look.tier === 6 ? '#2B2412' : card.team.colors.primary, C.night, 0.82);
  const cutout = { position: 'absolute' as const, left: imgLeft, top: imgTop, width: imgW, height: imgH };
  // Premium cards show the poster version of the art, where there is one
  const src = look.premium && art?.premium ? art.premium : art?.src ?? '';
  const outlinePx = Math.max(1.5, 3.2 * k);
  // a soft shadow cast on the backdrop, so the player stands in the card rather than on it
  const shadow = art ? (
    <Image
      source={{ uri: src }}
      style={[cutout, { left: imgLeft + 5 * k, top: imgTop + 7 * k, opacity: 0.42 }]}
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
      {/* the frame, in layers: metal in the rarity or tier colour, a sheen, a light bevel, dark lines in and out */}
      <LinearGradient colors={frame} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
        locations={[0, 0.25, 0.7, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        pointerEvents="none"
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.85)' }]} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: r - 1, borderWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.5)', borderLeftColor: 'rgba(255,255,255,0.35)', borderBottomColor: 'rgba(0,0,0,0.4)', borderRightColor: 'rgba(0,0,0,0.3)',
        }}
      />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: Math.max(2, r - f * 0.6), overflow: 'hidden', backgroundColor: card.team.colors.primary }}>
        <Animated.View style={[StyleSheet.absoluteFill, bgMove]}>
          <Background card={card} w={iw} h={ih} look={look} animate={animate} kit={!art} />
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
        <LinearGradient
          colors={[alpha(fade, 0), alpha(fade, 0.55), alpha(fade, 0.9)]}
          locations={[0.62, 0.8, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* a soft shadow where the art meets the top of the frame, so the window reads as recessed */}
        <LinearGradient colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10 * k + 3 }} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFill, { borderRadius: Math.max(2, r - f * 0.6), borderWidth: Math.max(1, 1.5 * k), borderColor: 'rgba(10,14,11,0.85)' }]} pointerEvents="none" />
      </View>
      {look.tier >= 3 ? <PulseRing w={w} h={h} r={r} color={look.tier === 6 ? '#F6DC8A' : mix(card.team.colors.accent, '#FFFFFF', 0.5)} animate={animate} /> : null}

      {/* frame break: the part of the player (or the shirt's collar and shoulders) above the window, drawn over the frame */}
      {brk ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: f, top: -breakPx, width: iw, height: breakPx + f + 1, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: breakPx + f, width: iw, height: ih }, playerMove]}>
            {art ? (
              <>
                {sticker}
                <Image source={{ uri: src }} style={cutout} resizeMode="cover" />
              </>
            ) : (
              <View style={{ position: 'absolute', left: 0, top: kitDy, width: iw, height: ih }}>
                <KitArt card={card} w={iw} h={ih} />
              </View>
            )}
          </Animated.View>
        </View>
      ) : null}

      <NameLogo card={card} w={w} h={h} premium={look.premium} />
      <Badges card={card} w={w} />

      {/* rarity reads from the frame and the logo; nothing else on the face, as on a Snap card */}
      {/* not in your collection yet: dimmed, never see-through */}
      {collected === false ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: 'rgba(10,14,11,0.42)' }]} /> : null}
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
  const r = 18 * k + 4;
  const f = Math.max(3, Math.round(6 * k));
  const iw = w - f * 2;
  const ih = h - f * 2;
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
      <LinearGradient colors={frame} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
        locations={[0, 0.25, 0.7, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]}
      />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: Math.max(2, r - f * 0.6), overflow: 'hidden', padding: pad }}>
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
        <View style={[StyleSheet.absoluteFill, { borderRadius: Math.max(2, r - f * 0.6), borderWidth: Math.max(1, 1.2 * k), borderColor: 'rgba(10,14,11,0.75)' }]} pointerEvents="none" />
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
  const k = w / 300;
  const r = 18 * k + 4;
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
  const r = 18 * k + 4;
  const f = Math.max(3, Math.round(6 * k));
  const iw = width - f * 2;
  const ih = h - f * 2;
  const line = 'rgba(245,196,81,0.22)';
  const sw = Math.max(1, 1.4 * k);
  // a full pitch, top to bottom, inset in the window
  const px = iw * 0.1;
  const py = ih * 0.06;
  const pw = iw - px * 2;
  const ph = ih - py * 2;
  return (
    <View style={{ width, height: h }}>
      <LinearGradient colors={['#4A4F48', '#1C211D', '#3E433C', '#191D1A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
        locations={[0, 0.25, 0.7, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]}
      />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: Math.max(2, r - f * 0.6), overflow: 'hidden' }}>
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
        <View style={[StyleSheet.absoluteFill, { borderRadius: Math.max(2, r - f * 0.6), borderWidth: Math.max(1, 1.2 * k), borderColor: 'rgba(10,14,11,0.75)' }]} />
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
