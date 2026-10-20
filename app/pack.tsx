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

function Reveal({ card, width, isNew, onRevealed, competition }: { card: PlayerCard; width: number; isNew: boolean; onRevealed: () => void; competition: string }) {
  const flip = useSharedValue(0);
  const burst = useSharedValue(0);
  const enter = useSharedValue(0);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    enter.value = reduced ? 1 : withSpring(1, { damping: 14, stiffness: 120 });
  }, [enter, reduced]);

  const reveal = () => {
    if (shown) return;
    setShown(true);
    onRevealed();
    if (Platform.OS !== 'web') {
      if (card.rarity === 'icon') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(card.rarity === 'common' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    flip.value = reduced ? 1 : withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    if (card.rarity !== 'common' && !reduced) burst.value = withSequence(withTiming(1, { duration: 320 }), withTiming(0.55, { duration: 900 }));
  };

  const wrap = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(enter.value, [0, 1], [80, 0]) }, { scale: interpolate(enter.value, [0, 1], [0.85, 1]) }], opacity: enter.value }));
  const backFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }], opacity: flip.value < 0.5 ? 1 : 0 }));
  const frontFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }], opacity: flip.value >= 0.5 ? 1 : 0 }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: interpolate(burst.value, [0, 1], [0.6, 1.25]) }] }));
  const h = cardHeight(width);

  return (
    <Animated.View style={[{ alignItems: 'center' }, wrap]}>
      <Animated.View style={[styles.burst, { width: width * 1.9, height: width * 1.9, borderRadius: width, backgroundColor: alpha(BURST[card.rarity], 0.32) }, burstStyle]} pointerEvents="none" />
      <Pressable onPress={reveal} accessibilityRole="button" accessibilityLabel={shown ? `${card.name}, ${RARITY_NAME[card.rarity]}` : 'Reveal card'}>
        <View style={{ width, height: h }}>
          <Animated.View style={[StyleSheet.absoluteFill, backFace, { backfaceVisibility: 'hidden' }]}>
            <CardBack width={width} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, frontFace, { backfaceVisibility: 'hidden' }]}>
            <SnapCard card={card} width={width} idleShimmer interactive={shown} competition={competition} />
          </Animated.View>
        </View>
      </Pressable>
      <View style={{ height: 30, justifyContent: 'center' }}>
        {shown ? (
          <Text style={[styles.tag, { color: BURST[card.rarity] }]}>
            {RARITY_NAME[card.rarity].toUpperCase()}
            {isNew ? '  ·  NEW' : '  ·  DUPLICATE'}
          </Text>
        ) : (
          <Text style={styles.tagHint}>TAP TO REVEAL</Text>
        )}
      </View>
    </Animated.View>
  );
}

function SealedPack({ width, leagueName, onTear }: { width: number; leagueName: string; onTear: () => void }) {
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) glow.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 1400 })), -1);
  }, [glow, reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * 3}deg` }] }));
  const g = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.35 }));
  const h = cardHeight(width) * 1.08;
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
        <LinearGradient colors={['#2A3D30', '#0F1712', '#2A3D30']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.pack, { borderRadius: 18 }]}>
          <Animated.View style={[StyleSheet.absoluteFill, g]}>
            <LinearGradient colors={['rgba(255,90,54,0)', 'rgba(255,90,54,0.35)', 'rgba(245,196,81,0.25)', 'rgba(255,90,54,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <View style={styles.tearLine} />
          <Text style={styles.packKicker}>DAILY PACK</Text>
          <Text style={styles.packTitle}>{leagueName.toUpperCase()}</Text>
          <Text style={styles.packCount}>{PACK_SIZE} CARDS</Text>
          <View style={styles.packFoot}>
            <Ionicons name="hand-left-outline" size={16} color={C.chalk2} />
            <Text style={styles.packHint}>TAP TO TEAR</Text>
          </View>
        </LinearGradient>
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
  const seed = bonus ? packSeed(`${day}:bonus:${profile.bonusPacks}`, league.id) : packSeed(day, league.id);
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
    if (bonus) setProfile((p) => ({ ...p, bonusPacks: p.bonusPacks - 1, credits: p.credits + earned }));
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
        <SealedPack width={cardW} leagueName={bonus ? `Bonus · ${league.name}` : league.name} onTear={tear} />
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
  burst: { position: 'absolute', top: '50%', alignSelf: 'center', marginTop: -160 },
  tag: { fontFamily: F.label, fontSize: 14, letterSpacing: 2 },
  tagHint: { fontFamily: F.label, fontSize: 13, letterSpacing: 2, color: C.muted },
  pack: { flex: 1, borderWidth: 2, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 6 },
  tearLine: { position: 'absolute', top: 34, left: 14, right: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: alpha(C.chalk, 0.25) },
  packKicker: { fontFamily: F.label, fontSize: 14, letterSpacing: 3, color: C.flare },
  packTitle: { fontFamily: F.display, fontSize: 40, color: C.chalk, textAlign: 'center', paddingHorizontal: S.base },
  packCount: { fontFamily: F.num, fontSize: 16, letterSpacing: 2, color: C.chalk2 },
  packFoot: { position: 'absolute', bottom: 26, flexDirection: 'row', gap: 6, alignItems: 'center' },
  packHint: { fontFamily: F.label, fontSize: 12, letterSpacing: 2, color: C.chalk2 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, justifyContent: 'center' },
});
