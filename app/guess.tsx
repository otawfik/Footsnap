/**
 * "Who's this?": name the player behind a mystery card. Right answers unlock
 * that card's Premium variant and pay credits and boosters. Five a day.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, useWindowDimensions, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withSpring, interpolate, useReducedMotion, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Badges, RARITY_FRAME, SnapCard, cardHeight } from '../components/SnapCard';
import { Button, Wallet, tap } from '../components/ui';
import { useLeague } from '../context/league';
import { useCards } from '../hooks/data';
import { useArt } from '../lib/art';
import { useCollection, useProfile, today } from '../lib/storage';
import { GUESSES_PER_DAY, clues, puzzle } from '../lib/guess';
import { REWARDS, lookOf, unlockPremium } from '../lib/collection';
import { cardStats } from '../lib/game';
import type { PlayerCard } from '../lib/cards';
import { RARITY_NAME } from '../lib/cards';
import { alpha, mix } from '../lib/colors';
import { C, F, R, S, T } from '../constants/theme';

/** The card with the player as a backlit silhouette and the name hidden; the same frame and badges as the real card. */
function Mystery({ card, width }: { card: PlayerCard; width: number }) {
  const h = cardHeight(width);
  const k = width / 300;
  const r = 18 * k + 4;
  const f = Math.max(3, Math.round(6 * k));
  const iw = width - f * 2;
  const ih = h - f * 2;
  const art = useArt(card.id);
  const { primary, accent } = card.team.colors;
  const rim = mix(accent, '#FFFFFF', 0.45);
  const imgW = iw * 1.02;
  const imgH = (imgW * 4) / 3;
  const imgTop = ih * 0.07 - (art?.headTop ?? 0.06) * imgH;
  const at = (dx: number, dy: number) => ({ position: 'absolute' as const, left: (iw - imgW) / 2 + dx, top: imgTop + dy, width: imgW, height: imgH });
  return (
    <View style={{ width, height: h }}>
      <LinearGradient colors={RARITY_FRAME[card.rarity]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
        locations={[0, 0.25, 0.7, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]}
      />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: Math.max(2, r - f * 0.6), overflow: 'hidden' }}>
        <LinearGradient colors={[mix(primary, '#FFFFFF', 0.06), primary, mix(primary, C.night, 0.75)]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={[alpha(rim, 0.35), alpha(rim, 0)]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
        {art ? (
          <>
            {/* backlight: the silhouette edged in light */}
            <Image source={{ uri: art.src }} tintColor={rim} style={[at(-2.5 * k - 1, -2 * k - 1), { opacity: 0.85 }]} resizeMode="cover" />
            <Image source={{ uri: art.src }} tintColor={rim} style={[at(2.5 * k + 1, -2 * k - 1), { opacity: 0.85 }]} resizeMode="cover" />
            <Image source={{ uri: art.src }} tintColor="#0B100C" style={at(0, 0)} resizeMode="cover" />
          </>
        ) : (
          <View style={{ position: 'absolute', top: ih * 0.14, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: 170 * k, color: alpha(C.chalk, 0.85) }}>?</Text>
          </View>
        )}
        <LinearGradient colors={[alpha(C.night, 0), alpha(C.night, 0.6), alpha(C.night, 0.95)]} locations={[0.55, 0.75, 1]} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', bottom: 16 * k + 2, left: 0, right: 0, alignItems: 'center', gap: 4 * k }}>
          <Text style={{ fontFamily: F.display, fontSize: 38 * k + 6, color: alpha(C.chalk, 0.85), letterSpacing: 8 * k }}>? ? ? ? ?</Text>
          <Text style={{ fontFamily: F.label, fontSize: 11 * k + 3, letterSpacing: 1.6, color: C.chalk2 }}>{RARITY_NAME[card.rarity].toUpperCase()}{card.rank ? ` · #${card.rank}` : ''}</Text>
        </View>
        <View style={[StyleSheet.absoluteFill, { borderRadius: Math.max(2, r - f * 0.6), borderWidth: Math.max(1, 1.2 * k), borderColor: 'rgba(10,14,11,0.75)' }]} />
      </View>
      <Badges card={card} w={width} />
    </View>
  );
}

export default function Guess() {
  const { league } = useLeague();
  const { list, loading } = useCards(league);
  const [collection, setCollection] = useCollection();
  const [profile, setProfile] = useProfile();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const day = today();
  const key = String(league.id);
  const used = profile.guesses.day === day ? profile.guesses.used : 0;
  const left = Math.max(0, GUESSES_PER_DAY - used);
  const [answered, setAnswered] = useState<{ pick: number; right: boolean } | null>(null);
  const flip = useSharedValue(0);
  const shake = useSharedValue(0);
  const burst = useSharedValue(0);
  const cardW = Math.min(width - S.xxl * 2, (height - 420) / 1.42, 280);

  // today's next puzzle, skipping players whose Premium you already own
  const upcoming = useMemo(() => {
    if (!list.length) return null;
    for (let n = used; n < used + 12; n++) {
      const q = puzzle(list, day, league.id, n);
      if (q && !collection[key]?.[String(q.answer.id)]?.premium) return q;
    }
    return puzzle(list, day, league.id, used);
  }, [list, day, league.id, used, collection, key]);
  // held until "Next player": answering changes the count the next puzzle depends on
  const [p, setP] = useState<ReturnType<typeof puzzle>>(null);
  useEffect(() => {
    if (!p && upcoming) setP(upcoming);
  }, [p, upcoming]);
  useEffect(() => {
    setP(null);
    setAnswered(null);
  }, [league.id]);
  const nextPlayer = () => {
    tap('medium');
    answering.current = false;
    flip.value = 0;
    burst.value = 0;
    setAnswered(null);
    setP(null);
  };

  const answering = useRef(false);
  const answer = (c: PlayerCard) => {
    // a ref, not state: two taps in the same frame both see stale state
    if (!p || answered || !left || answering.current) return;
    answering.current = true;
    const right = c.id === p.answer.id;
    setAnswered({ pick: c.id, right });
    setProfile((pr) => ({
      ...pr,
      credits: pr.credits + (right ? REWARDS.guessCredits : 0),
      guesses: { day, used: (pr.guesses.day === day ? pr.guesses.used : 0) + 1, solved: right ? [...(pr.guesses.day === day ? pr.guesses.solved : []), c.id] : pr.guesses.day === day ? pr.guesses.solved : [] },
    }));
    if (right) setCollection((col) => ({ ...col, [key]: { ...(col[key] ?? {}), [String(c.id)]: unlockPremium(col[key]?.[String(c.id)]) } }));
    if (Platform.OS !== 'web') {
      if (right) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    if (reduced) {
      flip.value = 1;
      return;
    }
    if (!right) shake.value = withSequence(withTiming(1, { duration: 60 }), withTiming(-1, { duration: 80 }), withTiming(1, { duration: 80 }), withTiming(0, { duration: 60 }));
    flip.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    if (right) burst.value = withSequence(withTiming(1, { duration: 300 }), withTiming(0.4, { duration: 1200 }));
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value * 10 }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }], opacity: flip.value < 0.5 ? 1 : 0 }));
  const back = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }], opacity: flip.value >= 0.5 ? 1 : 0 }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: interpolate(burst.value, [0, 1], [0.6, 1.3]) }] }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cards'));

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={styles.top}>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={C.chalk} />
        </Pressable>
        <Wallet credits={profile.credits} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={T.kicker}>{left} of {GUESSES_PER_DAY} guesses left today · {league.name}</Text>
        <Text style={[T.h1, { textAlign: 'center' }]}>Who's this?</Text>
        <Text style={[T.small, { textAlign: 'center', maxWidth: 320 }]}>Name the player to unlock their Premium card, plus {REWARDS.guessCredits} credits and {REWARDS.guessBoosters} boosters.</Text>

        {loading || !p ? (
          <Text style={T.body}>Shuffling…</Text>
        ) : (
          <>
            <Animated.View style={[{ width: cardW, height: cardHeight(cardW), marginTop: S.md }, shakeStyle]}>
              <Animated.View style={[styles.burst, { width: cardW * 2, height: cardW * 2, borderRadius: cardW, left: -cardW / 2, top: cardHeight(cardW) / 2 - cardW }, burstStyle]} pointerEvents="none" />
              <Animated.View style={[StyleSheet.absoluteFill, front, { backfaceVisibility: 'hidden' }]}>
                <Mystery card={p.answer} width={cardW} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, back, { backfaceVisibility: 'hidden' }]}>
                <SnapCard card={p.answer} width={cardW} idleShimmer competition={league.name} look={answered?.right ? lookOf({ ...unlockPremium(undefined) }) : lookOf(collection[key]?.[String(p.answer.id)])} />
              </Animated.View>
            </Animated.View>

            <View style={styles.clues}>
              {clues(p.answer).map((c) => (
                <View key={c.label} style={styles.clue}>
                  <Text style={styles.clueLabel}>{c.label.toUpperCase()}</Text>
                  <Text style={styles.clueValue}>{c.value}</Text>
                </View>
              ))}
            </View>

            {answered ? (
              <View style={{ alignItems: 'center', gap: S.sm }}>
                <Text style={[T.h2, { color: answered.right ? C.icon : C.loss }]}>{answered.right ? 'Premium unlocked' : `It was ${p.answer.name}`}</Text>
                {answered.right ? <Text style={T.small}>+{REWARDS.guessCredits} credits · +{REWARDS.guessBoosters} boosters for this card</Text> : null}
                {left > 0 ? <Button label="Next player" onPress={nextPlayer} kind="ghost" /> : <Text style={T.small}>That's today's five. New players tomorrow.</Text>}
              </View>
            ) : left === 0 ? (
              <Text style={T.small}>That's today's five. New players tomorrow.</Text>
            ) : (
              <View style={styles.options}>
                {p.options.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => {
                      tap('medium');
                      answer(o);
                    }}
                    style={({ pressed }) => [styles.option, pressed && { backgroundColor: C.turf }]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.optionText} numberOfLines={1}>{o.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.night },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingTop: S.md },
  scroll: { alignItems: 'center', paddingHorizontal: S.base, paddingBottom: 60, gap: S.md },
  burst: { position: 'absolute', backgroundColor: alpha(C.icon, 0.35) },
  clues: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, justifyContent: 'center', maxWidth: 420 },
  clue: { backgroundColor: C.pitch, borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: 6, alignItems: 'center' },
  clueLabel: { fontFamily: F.label, fontSize: 10, letterSpacing: 1.4, color: C.dim },
  clueValue: { fontFamily: F.bodyBold, fontSize: 14, color: C.chalk },
  options: { alignSelf: 'stretch', maxWidth: 420, width: '100%', gap: S.sm },
  option: { borderWidth: 1, borderColor: C.lineHi, borderRadius: R.sm, paddingVertical: 14, alignItems: 'center', backgroundColor: C.pitch },
  optionText: { fontFamily: F.label, fontSize: 17, letterSpacing: 0.8, color: C.chalk },
});
