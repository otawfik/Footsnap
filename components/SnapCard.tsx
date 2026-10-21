/**
 * The player card, built the way Marvel Snap builds its cards:
 *
 *   - the art is the card: a cut-out of the player (background removed, from a
 *     freely licensed Wikimedia photo) standing in front of a background drawn
 *     in the club's colours: energy rays, halftone, speed lines
 *   - two big outlined numbers, Cost top-left and Power top-right (the Duel
 *     game's stats, derived from real data in lib/game.ts), and a slanted,
 *     outlined name like a card logo; nothing else on the face
 *   - rarer cards come alive: Elite and Icon backgrounds rotate and sparkle, and
 *     their player breaks out over the top of the frame
 *   - upgrades work like Snap's: the frame colour follows the upgrade tier, and
 *     each tier adds an effect (frame break, 3D parallax, glow, crest, holo,
 *     Infinity with a finish)
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
import Svg, { Defs, LinearGradient as SvgGrad, RadialGradient, Stop, Rect, Circle, Path, G, Text as SvgText, Pattern, Line } from 'react-native-svg';
import { DeviceMotion } from 'expo-sensors';
import type { PlayerCard } from '../lib/cards';
import { RARITY_NAME, bannerName } from '../lib/cards';
import type { Finish, Tier } from '../lib/collection';
import { cardStats } from '../lib/game';
import { useArt } from '../lib/art';
import { alpha } from '../lib/colors';
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
const RARITY_FRAME: Record<PlayerCard['rarity'], Grad> = {
  common: ['#59625C', '#2A322D', '#59625C'],
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

function Background({ card, w, h, look, animate }: { card: PlayerCard; w: number; h: number; look: Look; animate: boolean }) {
  const { primary, secondary, accent } = card.team.colors;
  const infinity = look.tier === 6;
  const lively = card.rarity === 'icon' || card.rarity === 'elite' || look.tier >= 3 || look.premium;
  const spin = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (animate && lively && !reduced) spin.value = withRepeat(withTiming(1, { duration: 38000, easing: Easing.linear }), -1);
  }, [animate, lively, reduced, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const id = `bg${card.id}_${Math.round(w)}`;
  const S = Math.hypot(w, h) * 1.25;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={infinity ? ['#2A2410', '#0B0B0B'] : look.premium ? [secondary, primary] : [primary, alpha(primary, 0.55), C.night]}
        locations={infinity || look.premium ? undefined : [0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* energy rays from behind the player's head; they turn slowly on lively cards */}
      <Animated.View style={[{ position: 'absolute', width: S, height: S, left: w / 2 - S / 2, top: h * 0.36 - S / 2 }, spinStyle]}>
        <Rays size={S} color={alpha(infinity ? '#F6DC8A' : look.premium ? C.night : secondary, lively ? 0.17 : 0.08)} count={lively ? 20 : 14} />
      </Animated.View>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}g`} cx="50%" cy="34%" r="55%">
            <Stop offset="0" stopColor={infinity ? '#F6DC8A' : accent} stopOpacity={lively ? 0.5 : 0.28} />
            <Stop offset="1" stopColor={accent} stopOpacity="0" />
          </RadialGradient>
          <Pattern id={`${id}d`} width={7} height={7} patternUnits="userSpaceOnUse">
            <Circle cx={3.5} cy={3.5} r={1.2} fill={alpha(look.premium ? C.night : C.chalk, look.premium ? 0.35 : 0.1)} />
          </Pattern>
        </Defs>
        <Rect width={w} height={h} fill={`url(#${id}g)`} />
        <Rect y={h * 0.45} width={w} height={h * 0.55} fill={`url(#${id}d)`} />
        {card.rarity !== 'common' || look.tier >= 2
          ? Array.from({ length: 7 }, (_, i) => (
              <Line key={i} x1={-w * 0.2 + i * w * 0.24} y1={h} x2={w * 0.25 + i * w * 0.24} y2={h * 0.42} stroke={alpha(C.chalk, 0.07)} strokeWidth={Math.max(1, w / 90)} />
            ))
          : null}
      </Svg>
      {look.tier >= 4 && card.team.crest ? (
        <Image source={{ uri: card.team.crest }} style={{ position: 'absolute', width: w * 0.95, height: w * 0.95, left: w * 0.025, top: h * 0.06, opacity: 0.16 }} resizeMode="contain" />
      ) : null}
      {animate && lively ? <Sparks w={w} h={h} color={infinity ? '#F6DC8A' : '#FFFFFF'} seed={card.id} /> : null}
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
    return Array.from({ length: 9 }, (_, i) => ({ x: rand() * w, size: 2 + rand() * (w / 90), delay: i * 360 }));
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
function KitArt({ card, w, h }: { card: PlayerCard; w: number; h: number }) {
  const { primary, secondary } = card.team.colors;
  const initials = card.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const sw = w * 0.8;
  const sh = sw * 0.92;
  const x0 = (w - sw) / 2;
  const y0 = h * 0.13;
  const P = (fx: number, fy: number) => `${(x0 + fx * sw).toFixed(1)} ${(y0 + fy * sh).toFixed(1)}`;
  const shirt = `M ${P(0.36, 0)} L ${P(0.18, 0.06)} L ${P(0, 0.3)} L ${P(0.14, 0.42)} L ${P(0.22, 0.34)} L ${P(0.22, 1)} L ${P(0.78, 1)} L ${P(0.78, 0.34)} L ${P(0.86, 0.42)} L ${P(1, 0.3)} L ${P(0.82, 0.06)} L ${P(0.64, 0)} Q ${P(0.5, 0.12)} ${P(0.36, 0)} Z`;
  const id = `kit${card.id}_${Math.round(w)}`;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGrad id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.3" />
        </SvgGrad>
      </Defs>
      <Path d={shirt} fill={primary} stroke={C.night} strokeWidth={Math.max(1.5, w / 80)} />
      {/* sleeve cuffs in the second colour */}
      <Path d={`M ${P(0.02, 0.32)} L ${P(0.13, 0.41)} L ${P(0.18, 0.36)} L ${P(0.06, 0.26)} Z`} fill={secondary} />
      <Path d={`M ${P(0.98, 0.32)} L ${P(0.87, 0.41)} L ${P(0.82, 0.36)} L ${P(0.94, 0.26)} Z`} fill={secondary} />
      <Path d={shirt} fill={`url(#${id})`} />
      <Path d={`M ${P(0.36, 0)} Q ${P(0.5, 0.12)} ${P(0.64, 0)}`} stroke={secondary} strokeWidth={Math.max(2, w / 40)} fill="none" />
      <SvgText x={w / 2} y={y0 + sh * 0.7} fontSize={sw * 0.3} fontFamily={F.numHeavy} fill={secondary} stroke={C.night} strokeWidth={Math.max(1, w / 120)} textAnchor="middle">
        {initials}
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
function Badges({ card, w }: { card: PlayerCard; w: number }) {
  const k = w / 300;
  const s = cardStats(card);
  const d = 64 * k + 10;
  const fs = 40 * k + 7;
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

/** The name as a card logo: slanted, outlined, with a shadow in the club's colour. */
function NameLogo({ card, w, h, premium }: { card: PlayerCard; w: number; h: number; premium: boolean }) {
  const k = w / 300;
  const small = w < 140;
  const label = bannerName(card.name, small ? 9 : 12).toUpperCase();
  const size = Math.min(46 * k + 6, (w * 1.55) / Math.max(5, label.length));
  const y = h * 0.865;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <G transform={`translate(${w / 2} ${y}) skewX(-9)`}>
        <SvgText x={size * 0.06} y={size * 0.08} fontSize={size} fontFamily={F.display} fontWeight="900" fill={card.team.colors.accent} opacity={0.85} textAnchor="middle">
          {label}
        </SvgText>
        <SvgText x={0} y={0} fontSize={size} fontFamily={F.display} fontWeight="900" fill="none" stroke={C.night} strokeWidth={Math.max(2.5, size * 0.17)} strokeLinejoin="round" textAnchor="middle">
          {label}
        </SvgText>
        <SvgText x={0} y={0} fontSize={size} fontFamily={F.display} fontWeight="900" fill={premium ? 'none' : C.chalk} stroke={premium ? C.chalk : 'none'} strokeWidth={premium ? Math.max(1.2, 1.6 * k) : 0} textAnchor="middle">
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
        { position: 'absolute', left: -4, top: -4, width: w + 8, height: h + 8, borderRadius: r + 4, borderWidth: Math.max(2, w / 100), borderColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
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
  const f = Math.max(3, Math.round(7 * k));
  const r = 18 * k + 4;
  const iw = w - f * 2;
  const ih = h - f * 2;
  const art = useArt(card.id, loadArt);
  const brk = breaksFrame(card, look) && !!art;
  const breakPx = brk ? Math.round(h * 0.075) : 0;
  const depth = look.tier >= 2;

  // place the cut-out so the top of the head sits above the frame (break) or just inside it
  const imgW = iw * 1.06;
  const imgH = (imgW * 4) / 3;
  const headY = brk ? -breakPx * 0.85 : ih * 0.05;
  const imgTop = headY - (art?.headTop ?? 0.06) * imgH;
  const imgLeft = (iw - imgW) / 2;

  // 3D: the player moves against the tilt more than the background does
  const playerMove = useAnimatedStyle(() =>
    depth ? { transform: [{ translateX: -tx.value * w * 0.05 }, { translateY: -ty.value * h * 0.035 }] } : { transform: [{ translateX: 0 }] }
  );
  const bgMove = useAnimatedStyle(() =>
    depth ? { transform: [{ translateX: tx.value * w * 0.025 }, { translateY: ty.value * h * 0.02 }, { scale: 1.06 }] } : { transform: [{ scale: 1 }] }
  );

  const frame = look.tier >= 1 ? TIER_FRAME[look.tier] : RARITY_FRAME[card.rarity];
  const cutout = { position: 'absolute' as const, left: imgLeft, top: imgTop, width: imgW, height: imgH };
  const sticker = look.premium && art ? (
    // Premium: a sticker-style white outline around the player
    <Image source={{ uri: art.src }} style={[cutout, { transform: [{ scale: 1.035 }] }]} tintColor="#FFFFFF" resizeMode="cover" />
  ) : null;

  return (
    <View style={{ width: w, height: h }}>
      <LinearGradient colors={frame} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: Math.max(2, r - f * 0.6), overflow: 'hidden', backgroundColor: card.team.colors.primary }}>
        <Animated.View style={[StyleSheet.absoluteFill, bgMove]}>
          <Background card={card} w={iw} h={ih} look={look} animate={animate} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, playerMove]}>
          {art ? (
            <>
              {sticker}
              <Image source={{ uri: art.src }} style={cutout} resizeMode="cover" accessibilityIgnoresInvertColors />
            </>
          ) : (
            <KitArt card={card} w={iw} h={ih} />
          )}
        </Animated.View>
        <LinearGradient colors={['rgba(10,14,11,0)', 'rgba(10,14,11,0.15)', 'rgba(10,14,11,0.92)']} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      </View>

      {/* frame break: the part of the player above the window, drawn over the frame */}
      {brk && art ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: f, top: -breakPx, width: iw, height: breakPx + f + 1, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: breakPx + f, width: iw, height: ih }, playerMove]}>
            {sticker}
            <Image source={{ uri: art.src }} style={cutout} resizeMode="cover" />
          </Animated.View>
        </View>
      ) : null}

      <NameLogo card={card} w={w} h={h} premium={look.premium} />
      <Badges card={card} w={w} />

      <View pointerEvents="none" style={{ position: 'absolute', bottom: f * 0.9 + 2 * k, left: 0, right: 0, alignItems: 'center' }}>
        {look.tier === 6 ? (
          <Text style={{ fontFamily: F.numHeavy, fontSize: 14 * k + 6, color: '#F6DC8A' }}>∞</Text>
        ) : card.rarity !== 'common' ? (
          <View style={{ width: 9 * k + 4, height: 9 * k + 4, transform: [{ rotate: '45deg' }], backgroundColor: RARITY_COLOR[card.rarity], borderWidth: 1, borderColor: C.night }} />
        ) : null}
      </View>
      {collected === false && w >= 140 ? (
        <Text pointerEvents="none" style={[styles.notCollected, { bottom: f + 5 * k, right: f + 8 * k, fontSize: 9 * k + 3 }]}>NOT COLLECTED</Text>
      ) : null}
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

function Back({ card, w, competition }: { card: PlayerCard; w: number; competition: string }) {
  const h = cardHeight(w);
  const k = w / 300;
  const s = card.stats;
  const g = cardStats(card);
  const art = useArt(card.id);
  const dash = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v);
  const rarityWhy =
    card.rank !== null
      ? `#${card.rank} by goals × 2 + assists among the ${competition}'s top 20 scorers.`
      : `Not in the ${competition}'s top 20 scorers list.`;
  return (
    <LinearGradient colors={[alpha(card.team.colors.primary, 0.95), C.night]} style={[styles.back, { width: w, height: h, borderRadius: 18 * k + 4, padding: 16 * k + 4 }]}>
      {card.team.crest ? <Image source={{ uri: card.team.crest }} style={[styles.watermark, { width: w * 0.7, height: w * 0.7, top: h * 0.2, left: w * 0.15 }]} resizeMode="contain" /> : null}
      <Text style={[styles.backName, { fontSize: 26 * k + 4 }]} numberOfLines={1} adjustsFontSizeToFit>{card.name.toUpperCase()}</Text>
      <Text style={[styles.backMeta, { fontSize: 13 * k + 2 }]}>
        {[card.position, card.age !== null ? `${card.age}` : null, card.nationality, card.team.shortName].filter(Boolean).join(' · ')}
      </Text>
      <View style={[styles.statsRow, { marginTop: 12 * k + 2 }]}>
        <Stat value={dash(s?.goals ?? (s ? 0 : null))} label="GOALS" k={k} />
        <Stat value={dash(s?.assists)} label="ASSISTS" k={k} />
        <Stat value={dash(s?.penalties)} label="PENS" k={k} />
        <Stat value={dash(s?.played)} label="GAMES" k={k} />
      </View>
      <View style={{ gap: 7 * k + 2, marginTop: 12 * k + 2 }}>
        {card.abilities.map((a) => (
          <View key={a.title}>
            <Text style={[styles.abilityKind, { color: RARITY_COLOR[card.rarity], fontSize: 10 * k + 3 }]}>{a.kind === 'ongoing' ? 'THIS SEASON' : 'TRAIT'} · {a.title.toUpperCase()}</Text>
            <Text style={[styles.abilityText, { fontSize: 13 * k + 2, lineHeight: 17 * k + 3 }]}>{a.text}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Text style={[styles.backFine, { fontSize: 10.5 * k + 2, lineHeight: 14.5 * k + 2 }]}>
        {RARITY_NAME[card.rarity]}: {rarityWhy} Duel: cost {g.cost}, power {g.power}, from rarity and goals. Stats: football-data.org.
        {art ? ` Photo: ${art.artist}, ${art.license}, via Wikimedia Commons (background removed).` : ''}
      </Text>
    </LinearGradient>
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
    opacity: 0.1 + Math.abs(tx.value + idle.value * 0.5) * 0.16,
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
      ? ['rgba(255,60,140,0)', 'rgba(255,60,140,0.12)', 'rgba(255,214,90,0.13)', 'rgba(80,255,200,0.12)', 'rgba(90,140,255,0.13)', 'rgba(255,60,140,0)']
      : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(200,215,230,0.08)', 'rgba(255,255,255,0)'];

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
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>
        ) : null}
        {look.tier === 6 && look.finish === 'krackle' ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
            <Krackle w={w} h={h} seed={card.id} />
          </View>
        ) : null}
        {look.tier === 6 && look.finish === 'stellar' ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
            <Stellar w={w} h={h} seed={card.id} animate={animate} />
          </View>
        ) : null}
        {look.tier >= 3 ? <PulseRing w={w} h={h} r={r} color={look.tier === 6 ? '#F6DC8A' : card.team.colors.accent} animate={animate} /> : null}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, backSide, { backfaceVisibility: 'hidden' }]}>
        <Back card={card} w={w} competition={competition} />
      </Animated.View>
    </Animated.View>
  );
}

/** The face-down card, for packs. */
export function CardBack({ width }: { width: number }) {
  const h = cardHeight(width);
  const k = width / 300;
  return (
    <LinearGradient colors={['#1A2A1F', C.night, '#1A2A1F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width, height: h, borderRadius: 18 * k + 4, borderWidth: 2, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Svg width={width * 0.62} height={width * 0.62} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={44} stroke={C.lineHi} strokeWidth={2} fill="none" />
        <Circle cx={50} cy={50} r={3} fill={C.flare} />
        <Path d="M50 6 V94" stroke={C.lineHi} strokeWidth={2} />
      </Svg>
      <Text style={{ position: 'absolute', bottom: 18 * k + 6, fontFamily: F.display, fontSize: 22 * k + 6, color: C.chalk2, letterSpacing: 2 }}>FOOTSNAP</Text>
    </LinearGradient>
  );
}

/** Credit line for the card's photo: photographer, licence, link to the original. */
export function PhotoCredit({ card }: { card: PlayerCard }) {
  const art = useArt(card.id);
  if (!art) return null;
  return (
    <Pressable onPress={() => Linking.openURL(art.page)} accessibilityRole="link" hitSlop={8}>
      <Text style={styles.credit} numberOfLines={2}>
        Photo: {art.artist} · {art.license} · Wikimedia Commons (background removed) ↗
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notCollected: { position: 'absolute', fontFamily: F.label, letterSpacing: 1.2, color: C.chalk2 },
  back: { overflow: 'hidden', borderWidth: 1, borderColor: C.lineHi },
  watermark: { position: 'absolute', opacity: 0.08 },
  backName: { fontFamily: F.display, color: C.chalk },
  backMeta: { fontFamily: F.body, color: C.chalk2, marginTop: 2 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(243,241,231,0.15)', paddingVertical: 10 },
  abilityKind: { fontFamily: F.label, letterSpacing: 1.1 },
  abilityText: { fontFamily: F.bodyMedium, color: C.chalk },
  backFine: { fontFamily: F.body, color: C.chalk2 },
  credit: { fontFamily: F.body, fontSize: 12, color: C.muted, textDecorationLine: 'underline', textAlign: 'center', maxWidth: 320 },
});
