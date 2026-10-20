/**
 * The player card. Snap-style: rarity frame, big number, ability box, a back
 * with the full stats, and for Elite / Icon cards a foil that slides with tilt
 * (gyroscope on phones, drag on the web). Everything printed on it comes from
 * lib/cards.ts, which only states facts from the data.
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
  Easing,
  interpolate,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect, Circle, Path, G, Text as SvgText, Polygon, Pattern } from 'react-native-svg';
import { DeviceMotion } from 'expo-sensors';
import type { PlayerCard } from '../lib/cards';
import type { Finish, Tier } from '../lib/collection';
import type { SharedValue } from 'react-native-reanimated';
import { RARITY_NAME, bannerName } from '../lib/cards';
import { usePhoto } from '../lib/photos';
import { alpha } from '../lib/colors';
import { hash } from '../lib/rng';
import { C, F } from '../constants/theme';

export type CardSize = 'sm' | 'md' | 'lg';
const WIDTH: Record<CardSize, number> = { sm: 108, md: 168, lg: 300 };
export const cardHeight = (w: number) => Math.round(w * 1.42);

const FRAME: Record<PlayerCard['rarity'], (p: string, s: string) => [string, string, ...string[]]> = {
  common: () => [C.lineHi, C.line, C.lineHi],
  rare: (p, s) => [s, p, s],
  elite: () => ['#F5F8FB', '#8B96A3', '#EEF2F6', '#76818E', '#F5F8FB'],
  icon: () => ['#FFF1C2', '#C8952B', '#FFE59A', '#9E711C', '#FFF1C2'],
};

const RARITY_COLOR = { common: C.common, rare: C.rare, elite: C.elite, icon: C.icon } as const;
const INFINITY_FRAME: [string, string, ...string[]] = ['#141414', '#D9B24C', '#0B0B0B', '#F6DC8A', '#141414'];

export interface Look {
  tier: Tier;
  finish: Finish | null;
  premium: boolean;
}
export const BASE_LOOK: Look = { tier: 0, finish: null, premium: false };

/** Generated art for players without a photo: club colours, a pattern, their initials. */
function GeneratedArt({ card, w, h }: { card: PlayerCard; w: number; h: number }) {
  const { primary, secondary } = card.team.colors;
  const kind = hash(String(card.team.id)) % 3; // stripes / hoops / sash, per club
  const initials = card.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const id = `g${card.id}`;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGrad id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={primary} stopOpacity="0.95" />
          <Stop offset="1" stopColor={C.night} stopOpacity="1" />
        </SvgGrad>
      </Defs>
      <Rect width={w} height={h} fill={`url(#${id})`} />
      <G opacity={0.16}>
        {kind === 0 &&
          Array.from({ length: 7 }, (_, i) => <Rect key={i} x={(i * w) / 6 - w / 24} y={0} width={w / 12} height={h} fill={secondary} />)}
        {kind === 1 &&
          Array.from({ length: 6 }, (_, i) => <Rect key={i} x={0} y={(i * h) / 5} width={w} height={h / 12} fill={secondary} />)}
        {kind === 2 && <Path d={`M ${-w * 0.2} ${h * 0.15} L ${w * 0.25} ${-h * 0.05} L ${w * 1.2} ${h * 0.85} L ${w * 0.75} ${h * 1.05} Z`} fill={secondary} />}
      </G>
      <Circle cx={w / 2} cy={h * 0.48} r={w * 0.36} stroke={alpha(C.chalk, 0.18)} strokeWidth={Math.max(1, w / 120)} fill="none" />
      <SvgText
        x={w / 2}
        y={h * 0.62}
        fontSize={w * 0.42}
        fontFamily={F.display}
        fontWeight="900"
        fill={alpha(C.chalk, 0.85)}
        textAnchor="middle"
      >
        {initials}
      </SvgText>
    </Svg>
  );
}

function Art({ card, w, h, loadPhoto, look, tx, ty }: { card: PlayerCard; w: number; h: number; loadPhoto: boolean; look: Look; tx?: SharedValue<number>; ty?: SharedValue<number> }) {
  const { photo } = usePhoto(card.name, loadPhoto, card.dateOfBirth);
  const depth = look.tier >= 2;
  // Depth: the art sits slightly larger than its window and drifts against the tilt
  const parallax = useAnimatedStyle(() =>
    depth && tx && ty ? { transform: [{ translateX: -tx.value * w * 0.05 }, { translateY: -ty.value * h * 0.04 }, { scale: 1.12 }] } : { transform: [{ scale: 1 }] }
  );
  const dots = `dots${card.id}`;
  return (
    <View style={{ width: w, height: h, overflow: 'hidden', backgroundColor: card.team.colors.primary }}>
      <Animated.View style={[{ width: w, height: h }, parallax]}>
        <GeneratedArt card={card} w={w} h={h} />
        {photo ? (
          <Image
            source={{ uri: photo.src }}
            // drawn at full width and anchored to the top: faces sit high in portrait photos
            style={{ position: 'absolute', top: 0, left: 0, width: w, height: Math.max(photo.aspect ? w / photo.aspect : h, h) }}
            resizeMode="cover"
            accessibilityLabel={`Photo of ${card.name}`}
          />
        ) : null}
      </Animated.View>
      {look.premium ? (
        // Premium: a club-colour wash and a halftone screen over the art, like a printed poster
        <>
          <LinearGradient colors={[alpha(card.team.colors.primary, 0.55), 'rgba(0,0,0,0)', alpha(card.team.colors.secondary, 0.35)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <Pattern id={dots} width={6} height={6} patternUnits="userSpaceOnUse">
                <Circle cx={3} cy={3} r={1.1} fill={alpha(C.night, 0.55)} />
              </Pattern>
            </Defs>
            <Rect width={w} height={h} fill={`url(#${dots})`} />
          </Svg>
        </>
      ) : null}
      {look.tier >= 4 && card.team.crest ? (
        // Crest: the club badge embossed into the art
        <Image source={{ uri: card.team.crest }} style={{ position: 'absolute', right: -w * 0.08, bottom: h * 0.08, width: w * 0.55, height: w * 0.55, opacity: 0.2 }} resizeMode="contain" />
      ) : null}
      <LinearGradient
        colors={['rgba(10,14,11,0.55)', 'rgba(10,14,11,0)', 'rgba(10,14,11,0)', C.night]}
        locations={[0, 0.25, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

function Gem({ label, color, size }: { label: string; color: string; size: number }) {
  const s = size;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${s / 2 + (s / 2) * Math.cos(a)},${s / 2 + (s / 2) * Math.sin(a)}`;
  }).join(' ');
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
        <Polygon points={pts} fill={C.night} stroke={color} strokeWidth={Math.max(1.5, s / 16)} />
      </Svg>
      <Text style={{ fontFamily: F.num, fontSize: s * 0.36, color: C.chalk, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

function Front({ card, w, loadPhoto, collected, look, tx, ty }: { card: PlayerCard; w: number; loadPhoto: boolean; collected?: boolean; look: Look; tx?: SharedValue<number>; ty?: SharedValue<number> }) {
  const h = cardHeight(w);
  const k = w / 300;
  const frame = Math.max(3, Math.round(6 * k));
  const inner = w - frame * 2;
  const artH = Math.round(h * 0.58);
  const rc = RARITY_COLOR[card.rarity];
  const ability = card.abilities[0];
  const big = card.power ?? card.age;
  const bigLabel = card.power !== null ? 'POWER' : card.age !== null ? 'AGE' : '';
  const small = w < 140;

  return (
    <LinearGradient
      colors={look.tier === 6 ? INFINITY_FRAME : look.premium ? [card.team.colors.secondary, card.team.colors.primary, card.team.colors.secondary, card.team.colors.primary] : FRAME[card.rarity](card.team.colors.primary, card.team.colors.secondary)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.frame, { width: w, height: h, padding: frame, borderRadius: 16 * k + 4 }]}
    >
      <View style={[styles.inner, { borderRadius: 12 * k + 3 }]}>
        <Art card={card} w={inner} h={artH} loadPhoto={loadPhoto} look={look} tx={tx} ty={ty} />

        <View style={[styles.topRow, { padding: 10 * k + 2 }]}>
          <Gem label={card.line ?? '—'} color={rc} size={Math.round(46 * k + 8)} />
          {big !== null ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.big, { fontSize: 58 * k + 6, lineHeight: 58 * k + 8 }]}>{big}</Text>
              {!small ? <Text style={[styles.bigLabel, { fontSize: 10 * k + 3 }]}>{bigLabel}</Text> : null}
            </View>
          ) : null}
        </View>

        {look.tier >= 1 ? null : look.premium ? (
          <View style={[styles.banner, { top: artH - (40 * k + 8) }]}>
            <Svg width={inner} height={46 * k + 10}>
              <SvgText
                x={inner / 2}
                y={38 * k + 8}
                fontSize={Math.min(44 * k + 8, (inner * 1.6) / Math.max(6, (small ? bannerName(card.name, 9) : card.banner).length))}
                fontFamily={F.display}
                fontWeight="900"
                fill="none"
                stroke={C.chalk}
                strokeWidth={Math.max(1, 1.6 * k)}
                textAnchor="middle"
              >
                {(small ? bannerName(card.name, 9) : card.banner).toUpperCase()}
              </SvgText>
            </Svg>
          </View>
        ) : (
          <View style={[styles.banner, { top: artH - (34 * k + 6), paddingHorizontal: 10 * k }]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.name, { fontSize: 34 * k + 6, lineHeight: 36 * k + 6 }]}>
              {(small ? bannerName(card.name, 9) : card.banner).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={[styles.body, { paddingHorizontal: 12 * k + 2, paddingTop: 8 * k + 2, gap: 4 * k + 1 }]}>
          <View style={styles.clubRow}>
            {card.team.crest ? <Image source={{ uri: card.team.crest }} style={{ width: 16 * k + 6, height: 16 * k + 6 }} resizeMode="contain" /> : null}
            <Text numberOfLines={1} style={[styles.club, { fontSize: 12 * k + 4 }]}>{card.team.shortName.toUpperCase()}</Text>
          </View>
          {ability && !small ? (
            <View style={[styles.ability, { borderColor: alpha(rc, 0.45), padding: 8 * k + 2, borderRadius: 6 * k + 2 }]}>
              <Text style={[styles.abilityKind, { color: rc, fontSize: 10 * k + 2 }]}>{ability.kind === 'ongoing' ? 'ONGOING' : 'TRAIT'} · {ability.title.toUpperCase()}</Text>
              <Text numberOfLines={3} style={[styles.abilityText, { fontSize: 13 * k + 2, lineHeight: 17 * k + 3 }]}>{ability.text}</Text>
            </View>
          ) : ability ? (
            <Text numberOfLines={1} style={[styles.abilityKind, { color: rc, fontSize: 10 }]}>{ability.title.toUpperCase()}</Text>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingHorizontal: 12 * k + 2, paddingBottom: 8 * k + 2 }]}>
          <Text style={[styles.rarity, { color: look.tier === 6 ? '#F6DC8A' : rc, fontSize: 10 * k + 3 }]}>
            {look.tier === 6 ? '∞ ' : ''}
            {RARITY_NAME[card.rarity].toUpperCase()}
            {card.rank ? ` · #${card.rank}` : ''}
          </Text>
          {look.premium && !small ? <Text style={[styles.rarity, styles.seal, { fontSize: 9 * k + 3 }]}>PREMIUM</Text> : null}
          {collected === false && !small && !look.premium ? <Text style={[styles.rarity, { color: C.dim, fontSize: 10 * k + 3 }]}>NOT COLLECTED</Text> : null}
        </View>
      </View>
    </LinearGradient>
  );
}

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
  const dash = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v);
  const rarityWhy =
    card.rank !== null
      ? `#${card.rank} in the ${competition} by goals × 2 + assists.`
      : `Not among the ${competition}'s top 20 scorers.`;
  return (
    <LinearGradient colors={[alpha(card.team.colors.primary, 0.95), C.night]} style={[styles.frame, styles.back, { width: w, height: h, borderRadius: 16 * k + 4, padding: 16 * k + 4 }]}>
      {card.team.crest ? <Image source={{ uri: card.team.crest }} style={[styles.watermark, { width: w * 0.7, height: w * 0.7, top: h * 0.2, left: w * 0.15 }]} resizeMode="contain" /> : null}
      <Text style={[styles.backName, { fontSize: 26 * k + 4 }]} numberOfLines={1} adjustsFontSizeToFit>{card.name.toUpperCase()}</Text>
      <Text style={[styles.backMeta, { fontSize: 13 * k + 2 }]}>
        {[card.position, card.age !== null ? `${card.age}` : null, card.nationality].filter(Boolean).join(' · ')}
      </Text>
      <View style={[styles.statsRow, { marginTop: 14 * k + 2 }]}>
        <Stat value={dash(s?.goals ?? (s ? 0 : null))} label="GOALS" k={k} />
        <Stat value={dash(s?.assists)} label="ASSISTS" k={k} />
        <Stat value={dash(s?.penalties)} label="PENS" k={k} />
        <Stat value={dash(s?.played)} label="GAMES" k={k} />
      </View>
      <View style={{ gap: 8 * k + 2, marginTop: 14 * k + 2 }}>
        {card.abilities.map((a) => (
          <View key={a.title}>
            <Text style={[styles.abilityKind, { color: RARITY_COLOR[card.rarity], fontSize: 10 * k + 3 }]}>{a.kind === 'ongoing' ? 'ONGOING' : 'TRAIT'} · {a.title.toUpperCase()}</Text>
            <Text style={[styles.abilityText, { fontSize: 13 * k + 2, lineHeight: 18 * k + 2 }]}>{a.text}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Text style={[styles.backFine, { fontSize: 11 * k + 2, lineHeight: 15 * k + 2 }]}>
        {RARITY_NAME[card.rarity]}: {rarityWhy} {card.power !== null ? `Power = goals × 2 + assists = ${card.power}.` : 'No goal data this season, so the big number is age.'} Stats: football-data.org.
      </Text>
    </LinearGradient>
  );
}

/** Krackle: gold crackle lines, fixed per card. */
function Krackle({ w, h, seed }: { w: number; h: number; seed: number }) {
  const lines = useMemo(() => {
    let x = seed;
    const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 14 }, () => {
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
        <Path key={i} d={d} stroke="rgba(246,220,138,0.55)" strokeWidth={Math.max(0.8, w / 260)} fill="none" />
      ))}
    </Svg>
  );
}

/** Stellar: a field of stars that twinkle. */
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
    return Array.from({ length: 26 }, () => ({ x: rand() * w, y: rand() * h, r: 0.6 + rand() * 1.6 }));
  }, [w, h, seed]);
  const half = (set: typeof stars) => (
    <Svg width={w} height={h}>
      {set.map((st, i) => (
        <Circle key={i} cx={st.x} cy={st.y} r={st.r * (w / 200)} fill="#FFF6D6" />
      ))}
    </Svg>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, a]}>{half(stars.filter((_, i) => i % 2 === 0))}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, b]}>{half(stars.filter((_, i) => i % 2 === 1))}</Animated.View>
    </View>
  );
}

/** Pulse: a glow in the club's accent colour that breathes around the frame. */
function PulseRing({ w, h, color, animate }: { w: number; h: number; color: string; animate: boolean }) {
  const p = useSharedValue(0.5);
  useEffect(() => {
    if (animate) p.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.25, { duration: 900 })), -1);
  }, [animate, p]);
  const st = useAnimatedStyle(() => ({ opacity: p.value }));
  const k = w / 300;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -3, top: -3, width: w + 6, height: h + 6, borderRadius: 16 * k + 7, borderWidth: Math.max(2, 3 * k), borderColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
        st,
      ]}
    />
  );
}

/** Breakout: the name banner bursts past the frame edges. */
function BreakoutBanner({ card, w }: { card: PlayerCard; w: number }) {
  const h = cardHeight(w);
  const k = w / 300;
  const artH = Math.round(h * 0.58);
  const small = w < 140;
  const label = (small ? bannerName(card.name, 9) : card.banner).toUpperCase();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: small ? -1 : -6 * k - 3, right: small ? -1 : -6 * k - 3, top: artH - (30 * k + 6), transform: [{ rotate: small ? '-2deg' : '-3deg' }] }}>
      <LinearGradient colors={[card.team.colors.primary, alpha(card.team.colors.primary, 0.92), card.team.colors.primary]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 3 * k + 1, borderTopWidth: Math.max(1, 2 * k), borderBottomWidth: Math.max(1, 2 * k), borderColor: card.team.colors.secondary, alignItems: 'center' }}>
        <Text numberOfLines={1} style={[styles.name, { fontSize: small ? 15 : 32 * k + 6, lineHeight: small ? 18 : 34 * k + 7 }]}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

/**
 * The full card. `interactive` turns on tilt (gyroscope on phones, drag on the
 * web) and the moving foil; grids leave it off for performance.
 */
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
  const reduced = useReducedMotion();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flip = useSharedValue(flipped ? 1 : 0);
  const idle = useSharedValue(0);
  const foil = card.rarity === 'icon' || card.rarity === 'elite' || look.tier >= 5 || look.premium || look.tier === 6;
  const animateExtras = (interactive || idleShimmer) && !reduced;

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

  // a slow sweep so foil moves even when nobody's touching it
  useEffect(() => {
    if ((!idleShimmer && !interactive) || reduced || !foil) return;
    idle.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1);
  }, [idleShimmer, interactive, reduced, foil, idle]);

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
  const foilStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (tx.value + idle.value * 0.6) * w * 0.55 - w * 0.5 }, { rotate: '25deg' }],
  }));
  const glareStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (-tx.value - idle.value * 0.4) * w * 0.7 }, { translateY: ty.value * h * 0.2 }],
    opacity: 0.12 + Math.abs(tx.value + idle.value * 0.5) * 0.18,
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

  const holo = useMemo(
    () =>
      look.finish === 'gold' && look.tier === 6
        ? (['rgba(246,220,138,0)', 'rgba(246,220,138,0.35)', 'rgba(255,255,255,0.25)', 'rgba(217,178,76,0.35)', 'rgba(246,220,138,0)'] as const)
        : look.finish === 'prism' && look.tier === 6
        ? (['rgba(255,40,120,0)', 'rgba(255,40,120,0.26)', 'rgba(255,214,60,0.26)', 'rgba(40,255,190,0.26)', 'rgba(70,120,255,0.26)', 'rgba(200,60,255,0.26)', 'rgba(255,40,120,0)'] as const)
        : card.rarity === 'icon' || look.tier >= 5 || look.premium
        ? (['rgba(255,60,140,0)', 'rgba(255,60,140,0.13)', 'rgba(255,214,90,0.14)', 'rgba(80,255,200,0.13)', 'rgba(90,140,255,0.14)', 'rgba(255,60,140,0)'] as const)
        : (['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(200,215,230,0.10)', 'rgba(255,255,255,0)'] as const),
    [card.rarity, look.tier, look.finish, look.premium]
  );

  return (
    <Animated.View style={[{ width: w, height: h }, tilt]} {...responders} accessible accessibilityLabel={`${card.name}, ${RARITY_NAME[card.rarity]} card. ${card.abilities.map((a) => a.text).join(' ')}`}>
      <Animated.View style={[StyleSheet.absoluteFill, frontSide, { backfaceVisibility: 'hidden' }]}>
        <Front card={card} w={w} loadPhoto={loadPhoto} collected={collected} look={look} tx={tx} ty={ty} />
        {look.tier === 6 && look.finish === 'krackle' ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 16 * (w / 300) + 4, overflow: 'hidden' }]} pointerEvents="none">
            <Krackle w={w} h={h} seed={card.id} />
          </View>
        ) : null}
        {look.tier === 6 && look.finish === 'stellar' ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 16 * (w / 300) + 4, overflow: 'hidden' }]} pointerEvents="none">
            <Stellar w={w} h={h} seed={card.id} animate={animateExtras} />
          </View>
        ) : null}
        {foil ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 16 * (w / 300) + 4, overflow: 'hidden' }]} pointerEvents="none">
            <Animated.View style={[{ position: 'absolute', top: -h * 0.25, width: w * 2, height: h * 1.5 }, foilStyle]}>
              <LinearGradient colors={holo as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', top: -h * 0.1, left: w * 0.15, width: w * 0.7, height: h * 1.2, borderRadius: w }, glareStyle]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>
        ) : null}
        {look.tier >= 3 ? <PulseRing w={w} h={h} color={look.tier === 6 ? '#F6DC8A' : card.team.colors.accent} animate={animateExtras} /> : null}
        {look.tier >= 1 ? <BreakoutBanner card={card} w={w} /> : null}
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
    <LinearGradient colors={['#1A2A1F', C.night, '#1A2A1F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.frame, { width, height: h, borderRadius: 16 * k + 4, borderWidth: 2, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' }]}>
      <Svg width={width * 0.62} height={width * 0.62} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={44} stroke={C.lineHi} strokeWidth={2} fill="none" />
        <Circle cx={50} cy={50} r={3} fill={C.flare} />
        <Path d="M50 6 V94" stroke={C.lineHi} strokeWidth={2} />
      </Svg>
      <Text style={{ position: 'absolute', bottom: 18 * k + 6, fontFamily: F.display, fontSize: 22 * k + 6, color: C.chalk2, letterSpacing: 2 }}>FOOTSNAP</Text>
    </LinearGradient>
  );
}

export function PhotoCredit({ name, born }: { name: string; born?: string | null }) {
  const { photo } = usePhoto(name, true, born);
  if (!photo) return null;
  return (
    <Pressable onPress={() => Linking.openURL(photo.href)} accessibilityRole="link" hitSlop={8}>
      <Text style={styles.credit}>Photo: Wikipedia ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  inner: { flex: 1, backgroundColor: C.night, overflow: 'hidden' },
  topRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  big: { fontFamily: F.numHeavy, color: C.chalk, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  bigLabel: { fontFamily: F.label, color: C.chalk2, letterSpacing: 1.4, marginTop: -2 },
  banner: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  name: { fontFamily: F.display, color: C.chalk, letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  body: { flex: 1 },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  club: { fontFamily: F.label, color: C.chalk2, letterSpacing: 1.4 },
  ability: { borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)', gap: 3 },
  abilityKind: { fontFamily: F.label, letterSpacing: 1.1 },
  abilityText: { fontFamily: F.bodyMedium, color: C.chalk },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  rarity: { fontFamily: F.label, letterSpacing: 1.4 },
  back: { borderWidth: 1, borderColor: C.lineHi },
  watermark: { position: 'absolute', opacity: 0.08 },
  backName: { fontFamily: F.display, color: C.chalk },
  backMeta: { fontFamily: F.body, color: C.chalk2, marginTop: 2 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(243,241,231,0.15)', paddingVertical: 10 },
  backFine: { fontFamily: F.body, color: C.chalk2 },
  credit: { fontFamily: F.body, fontSize: 12, color: C.muted, textDecorationLine: 'underline' },
  seal: { color: C.night, backgroundColor: '#F6DC8A', paddingHorizontal: 5, borderRadius: 3, overflow: 'hidden' },
});
