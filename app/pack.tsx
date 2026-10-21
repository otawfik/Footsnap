/**
 * Opening the daily pack: tear it, then reveal five real players one at a time.
 * The pack is fixed per day and competition (lib/packs.ts), and it's marked
 * opened and added to the collection the moment it's torn, so leaving halfway
 * loses nothing.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withSpring, withRepeat, Easing, interpolate, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGrad, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SnapCard, CardBack, cardHeight } from '../components/SnapCard';
import { Button, tap } from '../components/ui';
import { useLeague } from '../context/league';
import { useCards } from '../hooks/data';
import { drawPack, packSeed, PACK_SIZE } from '../lib/packs';
import { useCollection, usePacks, useProfile, today } from '../lib/storage';
import { addPull, REWARDS } from '../lib/collection';
import type { PlayerCard } from '../lib/cards';
import { RARITY_NAME } from '../lib/cards';
import { alpha } from '../lib/colors';
import { C, F, R, S, T } from '../constants/theme';

const BURST = { common: C.common, rare: C.rare, elite: C.elite, icon: C.icon } as const;

/** Light rays in the rarity colour, turning slowly behind a freshly revealed rare card. */
function RayBurst({ size, color }: { size: number; color: string }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1);
  }, [spin]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const c = size / 2;
  const n = 16;
  return (
    <Animated.View style={[{ width: size, height: size }, st]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rayFade" cx="50%" cy="50%" r="50%">
            <Stop offset="0.25" stopColor={color} stopOpacity="0.55" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {Array.from({ length: n }, (_, i) => {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = a0 + Math.PI / n / 1.4;
          return <Path key={i} d={`M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#rayFade)" />;
        })}
      </Svg>
    </Animated.View>
  );
}

function Reveal({ card, width, isNew, onRevealed, competition }: { card: PlayerCard; width: number; isNew: boolean; onRevealed: () => void; competition: string }) {
  const flip = useSharedValue(0);
  const burst = useSharedValue(0);
  const enter = useSharedValue(0);
  const charge = useSharedValue(0);
  const lift = useSharedValue(0);
  const flash = useSharedValue(0);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();
  const rare = card.rarity !== 'common';
  const color = BURST[card.rarity];
  useEffect(() => {
    enter.value = reduced ? 1 : withSpring(1, { damping: 14, stiffness: 120 });
    // rarer cards hum in their colour before you turn them over
    if (rare && !reduced) charge.value = withRepeat(withSequence(withTiming(1, { duration: card.rarity === 'icon' ? 500 : 800 }), withTiming(0.3, { duration: card.rarity === 'icon' ? 500 : 800 })), -1);
  }, [enter, charge, rare, reduced, card.rarity]);

  const reveal = () => {
    if (shown) return;
    setShown(true);
    onRevealed();
    if (Platform.OS !== 'web') {
      if (card.rarity === 'icon') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(card.rarity === 'common' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    charge.value = withTiming(0, { duration: 200 });
    if (reduced) {
      flip.value = 1;
      return;
    }
    flip.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    lift.value = withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 10, stiffness: 140 }));
    flash.value = withSequence(withTiming(0, { duration: 300 }), withTiming(rare ? 0.85 : 0.4, { duration: 60 }), withTiming(0, { duration: 520 }));
    if (rare) burst.value = withSequence(withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.6)) }), withTiming(0.75, { duration: 900 }));
  };

  const wrap = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(enter.value, [0, 1], [80, 0]) }, { scale: interpolate(enter.value, [0, 1], [0.85, 1]) * (1 + lift.value * 0.07) }],
    opacity: enter.value,
  }));
  const backFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }], opacity: flip.value < 0.5 ? 1 : 0 }));
  const frontFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }], opacity: flip.value >= 0.5 ? 1 : 0 }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: interpolate(burst.value, [0, 1], [0.4, 1]) }] }));
  const chargeStyle = useAnimatedStyle(() => ({ opacity: charge.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const h = cardHeight(width);
  const r = 18 * (width / 300) + 4;
  const rays = width * 2.2;

  return (
    <Animated.View style={[{ alignItems: 'center' }, wrap]}>
      {rare && !reduced ? (
        <Animated.View style={[styles.burst, { width: rays, height: rays, top: h / 2 - rays / 2 }, burstStyle]} pointerEvents="none">
          <RayBurst size={rays} color={color} />
        </Animated.View>
      ) : null}
      <Pressable onPress={reveal} accessibilityRole="button" accessibilityLabel={shown ? `${card.name}, ${RARITY_NAME[card.rarity]}` : 'Reveal card'}>
        <View style={{ width, height: h }}>
          {rare ? (
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', left: -6, top: -6, width: width + 12, height: h + 12, borderRadius: r + 6, borderWidth: 3, borderColor: color },
                { backgroundColor: alpha(color, 0.25), shadowColor: color, shadowOpacity: 1, shadowRadius: 32, shadowOffset: { width: 0, height: 0 } },
                chargeStyle,
              ]}
            />
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, backFace, { backfaceVisibility: 'hidden' }]}>
            <CardBack width={width} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, frontFace, { backfaceVisibility: 'hidden' }]}>
            <SnapCard card={card} width={width} idleShimmer interactive={shown} competition={competition} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: '#FFFFFF' }, flashStyle]} />
          </Animated.View>
        </View>
      </Pressable>
      <View style={{ height: 44, justifyContent: 'center' }}>
        {shown ? (
          <View style={styles.tagRow}>
            <View style={[styles.rarityPill, { borderColor: color, backgroundColor: alpha(color, 0.14) }]}>
              <Text style={[styles.tag, { color }]}>{RARITY_NAME[card.rarity].toUpperCase()}</Text>
            </View>
            <Text style={[styles.tagNote, isNew && { color: C.chalk }]}>{isNew ? 'NEW' : 'DUPLICATE'}</Text>
          </View>
        ) : (
          <Text style={styles.tagHint}>TAP TO REVEAL</Text>
        )}
      </View>
    </Animated.View>
  );
}

/** A crimped foil seal across the top or bottom of the pack: serrated edge, fine ridges, a metal gradient. */
function Crimp({ width, height, flip }: { width: number; height: number; flip?: boolean }) {
  const teeth = 26;
  const t = width / teeth;
  const d = Array.from({ length: teeth }, (_, i) => `L ${(i + 0.5) * t} 0 L ${(i + 1) * t} ${t * 0.55}`).join(' ');
  const id = flip ? 'crimpB' : 'crimpT';
  return (
    <Svg width={width} height={height} style={flip ? { transform: [{ scaleY: -1 }] } : undefined}>
      <Defs>
        <SvgGrad id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6B5622" />
          <Stop offset="0.3" stopColor="#E8C46A" />
          <Stop offset="0.55" stopColor="#8A6C2A" />
          <Stop offset="0.8" stopColor="#F2D68C" />
          <Stop offset="1" stopColor="#6B5622" />
        </SvgGrad>
      </Defs>
      <Path d={`M 0 ${t * 0.55} ${d} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${id})`} />
      {Array.from({ length: Math.floor(width / 5) }, (_, i) => (
        <Line key={i} x1={i * 5 + 2} y1={t * 0.6} x2={i * 5 + 2} y2={height - 1} stroke="rgba(10,14,11,0.18)" strokeWidth={1} />
      ))}
      <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="rgba(10,14,11,0.6)" strokeWidth={1} />
    </Svg>
  );
}

function SealedPack({ width, leagueName, onTear }: { width: number; leagueName: string; onTear: () => void }) {
  const shake = useSharedValue(0);
  const sheen = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) sheen.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), -1);
  }, [sheen, reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * 3}deg` }] }));
  const h = cardHeight(width) * 1.1;
  const crimp = Math.round(h * 0.065);
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(sheen.value, [0, 1], [-width * 0.8, width * 1.3]) }, { rotate: '18deg' }] }));
  const emblem = width * 0.46;
  return (
    <Pressable
      onPress={() => {
        if (!reduced) shake.value = withSequence(withTiming(1, { duration: 60 }), withTiming(-1, { duration: 80 }), withTiming(1, { duration: 80 }), withTiming(0, { duration: 60 }));
        setTimeout(onTear, reduced ? 0 : 300);
      }}
      accessibilityRole="button"
      accessibilityLabel="Tear open the pack"
    >
      <Animated.View style={[{ width, height: h }, st]}>
        {/* the foil body */}
        <View style={[styles.packBody, { top: crimp - 2, bottom: crimp - 2 }]}>
          <LinearGradient colors={['#21402F', '#0B1610', '#1D3A2A', '#09130D', '#1A3426']} locations={[0, 0.3, 0.55, 0.8, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="packGlow" cx="50%" cy="46%" r="55%">
                <Stop offset="0" stopColor="#F5C451" stopOpacity="0.22" />
                <Stop offset="1" stopColor="#F5C451" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={width} height={h} fill="url(#packGlow)" />
            {/* the emblem: centre circle and halfway line, in gold */}
            <Circle cx={width / 2} cy={h * 0.4} r={emblem / 2} stroke="rgba(245,196,81,0.55)" strokeWidth={2} fill="none" />
            <Line x1={width * 0.08} y1={h * 0.4} x2={width * 0.92} y2={h * 0.4} stroke="rgba(245,196,81,0.3)" strokeWidth={1.5} />
            <Circle cx={width / 2} cy={h * 0.4} r={4} fill="#F5C451" />
          </Svg>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -h * 0.2, left: 0, width: width * 0.35, height: h * 1.4 }, sheenStyle]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.13)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          {/* tear notch and line, just under the top seal */}
          <View style={styles.tearRow}>
            <View style={styles.notch} />
            <View style={styles.tearLine} />
          </View>
          <Text style={styles.packBrand}>FOOTSNAP</Text>
          <View style={[styles.packCenter, { top: h * 0.4 - crimp - 34 }]}>
            <Text style={styles.packKicker}>DAILY PACK</Text>
            <Text style={styles.packTitle} numberOfLines={1} adjustsFontSizeToFit>{leagueName.toUpperCase()}</Text>
          </View>
          <View style={styles.packChip}>
            <Text style={styles.packCount}>{PACK_SIZE} CARDS</Text>
          </View>
          <View style={styles.packFoot}>
            <Ionicons name="hand-left-outline" size={16} color={C.chalk2} />
            <Text style={styles.packHint}>TAP TO TEAR</Text>
          </View>
        </View>
        <View style={{ position: 'absolute', top: 0 }}>
          <Crimp width={width} height={crimp} />
        </View>
        <View style={{ position: 'absolute', bottom: 0 }}>
          <Crimp width={width} height={crimp} flip />
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function Pack() {
  const { league } = useLeague();
  const { list, loading } = useCards(league);
  const [collection, setCollection] = useCollection();
  const [packs, setPacks] = usePacks();
  const [profile, setProfile] = useProfile();
  const { width, height } = useWindowDimensions();
  const day = today();
  const key = String(league.id);
  const dailyOpen = packs[key] === day;
  // milestones award bonus packs; with today's pack open, the next one is a bonus pack
  const bonus = dailyOpen && profile.bonusPacks > 0;
  const alreadyOpen = dailyOpen && !bonus;
  const seed = bonus ? packSeed(`bonus:${profile.bonusOpened ?? 0}`, league.id) : packSeed(day, league.id);
  const drawn = useMemo(() => (list.length ? drawPack(list, seed) : []), [list, seed]);
  // frozen at tear time: tearing changes the state the seed depends on
  const [frozen, setFrozen] = useState<PlayerCard[] | null>(null);
  const pack = frozen ?? drawn;
  // which cards were new before this pack was torn
  const before = useRef<Record<string, number> | null>(null);
  const [stage, setStage] = useState<'sealed' | 'reveal' | 'done'>(alreadyOpen ? 'done' : 'sealed');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [earned, setEarned] = useState(0);
  const cardW = Math.min(width - S.xxl * 2, (height - 300) / 1.42, 320);

  const tear = () => {
    tap('heavy');
    setFrozen(drawn);
    before.current = Object.fromEntries(Object.entries(collection[key] ?? {}).map(([id, st]) => [id, st.copies]));
    const mine = { ...(collection[key] ?? {}) };
    let earned = REWARDS.packOpened;
    for (const card of drawn) {
      const r = addPull(mine[String(card.id)]);
      mine[String(card.id)] = r.state;
      earned += r.credits;
    }
    setCollection((c) => ({ ...c, [key]: mine }));
    if (bonus) setProfile((p) => ({ ...p, bonusPacks: p.bonusPacks - 1, bonusOpened: (p.bonusOpened ?? 0) + 1, credits: p.credits + earned }));
    else {
      setPacks((p) => ({ ...p, [key]: day }));
      setProfile((p) => ({ ...p, credits: p.credits + earned }));
    }
    setEarned(earned);
    setStage('reveal');
  };

  const next = () => {
    if (index + 1 >= pack.length) setStage('done');
    else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cards'));
  const card = pack[index];
  const isNew = (c: PlayerCard) => !(before.current ?? {})[String(c.id)];

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={styles.top}>
        <Text style={T.kicker}>{stage === 'reveal' ? `Card ${index + 1} of ${pack.length}` : league.name}</Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={C.chalk} />
        </Pressable>
      </View>

      {loading || !pack.length ? (
        <Text style={T.body}>Shuffling…</Text>
      ) : stage === 'sealed' ? (
        <SealedPack width={cardW} leagueName={`${bonus ? 'Bonus · ' : ''}${league.nation ?? 'Europe'}`} onTear={tear} />
      ) : stage === 'reveal' && card ? (
        <>
          <Reveal key={card.id} card={card} width={cardW} isNew={isNew(card)} onRevealed={() => setRevealed(true)} competition={league.name} />
          <View style={styles.bottom}>
            <Button label={index + 1 >= pack.length ? 'See your pack' : 'Next card'} onPress={next} disabled={!revealed} />
          </View>
        </>
      ) : (
        <View style={{ alignItems: 'center', gap: S.lg, paddingHorizontal: S.base }}>
          <Text style={T.h1}>{alreadyOpen && !before.current ? "Today's pack" : 'Added to your collection'}</Text>
          {earned ? <Text style={[T.label, { color: C.icon }]}>+{earned} credits · duplicates gave boosters</Text> : null}
          <View style={styles.summary}>
            {pack.map((c) => (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })} accessibilityRole="button">
                <SnapCard card={c} width={Math.min(104, (width - 64) / 3)} competition={league.name} />
              </Pressable>
            ))}
          </View>
          <Text style={T.small}>A new pack unlocks at midnight.</Text>
          <Button label="Done" onPress={close} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 54, left: S.lg, right: S.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 },
  bottom: { position: 'absolute', bottom: 40, left: S.xl, right: S.xl },
  burst: { position: 'absolute', alignSelf: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rarityPill: { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 4 },
  tag: { fontFamily: F.label, fontSize: 14, letterSpacing: 2 },
  tagNote: { fontFamily: F.label, fontSize: 13, letterSpacing: 2, color: C.muted },
  tagHint: { fontFamily: F.label, fontSize: 13, letterSpacing: 2, color: C.muted },
  packBody: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', alignItems: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(245,196,81,0.25)' },
  tearRow: { position: 'absolute', top: 10, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  notch: { width: 0, height: 0, borderTopWidth: 6, borderBottomWidth: 6, borderLeftWidth: 9, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: C.night },
  tearLine: { flex: 1, marginRight: 12, marginLeft: 4, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(243,241,231,0.3)' },
  packBrand: { marginTop: 30, fontFamily: F.display, fontSize: 18, letterSpacing: 4, color: 'rgba(243,241,231,0.75)' },
  packCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  packKicker: { fontFamily: F.label, fontSize: 13, letterSpacing: 3, color: C.icon },
  packTitle: { fontFamily: F.display, fontSize: 44, color: C.chalk, textAlign: 'center', paddingHorizontal: S.lg, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  packChip: { position: 'absolute', bottom: 64, borderWidth: 1, borderColor: 'rgba(245,196,81,0.5)', borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: 'rgba(10,14,11,0.45)' },
  packCount: { fontFamily: F.num, fontSize: 14, letterSpacing: 2, color: C.icon },
  packFoot: { position: 'absolute', bottom: 24, flexDirection: 'row', gap: 6, alignItems: 'center' },
  packHint: { fontFamily: F.label, fontSize: 12, letterSpacing: 2, color: C.chalk2 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, justifyContent: 'center' },
});
