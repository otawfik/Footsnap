/**
 * "Who's this?" (SPEC.md §5): name the player behind a mystery card. The card is the full
 * photos-off face with "?" for the letter and "? ? ?" for the name; the stats stay visible.
 * Right answers unlock that card's Premium variant and pay credits and boosters. Five a day.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SnapCard, cardHeight } from '../components/SnapCard';
import { Button, Credits, NavBar, tap } from '../components/ui';
import { useLeague } from '../context/league';
import { useCards } from '../hooks/data';
import { useCollection, useProfile, today } from '../lib/storage';
import { GUESSES_PER_DAY, clues, puzzle } from '../lib/guess';
import { REWARDS, lookOf, unlockPremium } from '../lib/collection';
import type { PlayerCard } from '../lib/cards';
import { color, font, motion, size, space, type } from '../constants/design';

function Option({ card, state, disabled, onPress }: { card: PlayerCard; state: 'idle' | 'right' | 'wrong' | 'muted'; disabled: boolean; onPress: () => void }) {
  const bg = state === 'right' ? color.winSoft : state === 'wrong' ? color.lossSoft : color.surface;
  const fg = state === 'right' ? color.win : state === 'wrong' ? color.loss : state === 'muted' ? color.text2 : color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.option, { backgroundColor: pressed && state === 'idle' ? color.raised : bg }]}
      accessibilityRole="button"
      accessibilityLabel={card.name}
      accessibilityState={{ disabled, selected: state === 'right' || state === 'wrong' }}
    >
      <Text style={[styles.optionText, { color: fg }]} numberOfLines={1}>{card.name}</Text>
      {state === 'right' ? <Ionicons name="checkmark" size={20} color={color.win} /> : state === 'wrong' ? <Ionicons name="close" size={20} color={color.loss} /> : null}
    </Pressable>
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
  const cardW = Math.round(Math.min(280, width - space.x4 * 2, (height - 520) / 1.4));

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

  const answering = useRef(false);
  const nextPlayer = () => {
    answering.current = false;
    flip.value = 0;
    setAnswered(null);
    setP(null);
  };

  const answer = (c: PlayerCard) => {
    // a ref, not state: two taps in the same frame both see stale state
    if (!p || answered || !left || answering.current) return;
    answering.current = true;
    tap('light');
    const right = c.id === p.answer.id;
    setAnswered({ pick: c.id, right });
    setProfile((pr) => {
      const same = pr.guesses.day === day;
      const solved = same ? pr.guesses.solved : [];
      return {
        ...pr,
        credits: pr.credits + (right ? REWARDS.guessCredits : 0),
        guesses: { day, used: (same ? pr.guesses.used : 0) + 1, solved: right ? [...solved, c.id] : solved },
      };
    });
    if (right) setCollection((col) => ({ ...col, [key]: { ...(col[key] ?? {}), [String(c.id)]: unlockPremium(col[key]?.[String(c.id)]) } }));
    if (Platform.OS !== 'web') Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    // the card turns over to the player: Premium if you named them
    flip.value = reduced ? withTiming(1, { duration: motion.base }) : withTiming(1, { duration: motion.flip, easing: Easing.bezier(...motion.easeInOut) });
  };

  const front = useAnimatedStyle(() => (reduced ? { opacity: 1 - flip.value } : { opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 1100 }, { rotateY: `${flip.value * 180}deg` }] }));
  const back = useAnimatedStyle(() => (reduced ? { opacity: flip.value } : { opacity: flip.value >= 0.5 ? 1 : 0, transform: [{ perspective: 1100 }, { rotateY: `${180 + flip.value * 180}deg` }] }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cards'));
  const owned = p ? collection[key]?.[String(p.answer.id)] : undefined;
  const look = answered?.right ? lookOf(unlockPremium(owned)) : lookOf(owned);
  const stateOf = (o: PlayerCard): 'idle' | 'right' | 'wrong' | 'muted' => {
    if (!answered || !p) return 'idle';
    if (o.id === p.answer.id) return 'right';
    if (o.id === answered.pick) return 'wrong';
    return 'muted';
  };
  const doneToday = <Text style={[type.footnote, { textAlign: 'center' }]}>That's today's five. New players tomorrow.</Text>;

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={{ paddingHorizontal: space.gutter }}>
        <NavBar back="close" onBack={close} title={`${left} of ${GUESSES_PER_DAY} left`} right={<Credits credits={profile.credits} />} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={[type.title, { textAlign: 'center' }]} accessibilityRole="header">Who's this?</Text>
          <Text style={[type.footnote, { textAlign: 'center' }]}>Name the player to unlock their Premium card.</Text>
        </View>

        {loading || !p ? (
          <Text style={type.body}>Shuffling…</Text>
        ) : (
          <>
            <View style={{ width: cardW, height: cardHeight(cardW) }}>
              <Animated.View style={[StyleSheet.absoluteFill, front, { backfaceVisibility: 'hidden' }]} pointerEvents="none">
                <SnapCard card={p.answer} size="full" width={cardW} mystery competition={league.name} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, back, { backfaceVisibility: 'hidden' }]} pointerEvents={answered ? 'auto' : 'none'}>
                {answered ? <SnapCard card={p.answer} size="full" width={cardW} idleShimmer interactive competition={league.name} look={look} /> : null}
              </Animated.View>
            </View>
            <Text style={[type.footnote, { textAlign: 'center' }]}>{clues(p.answer).map((c) => `${c.label} ${c.value}`).join(' · ')}</Text>

            {answered ? (
              <Animated.View entering={FadeIn.duration(motion.base)} style={styles.result}>
                <Text style={[type.headline, { textAlign: 'center' }]}>{answered.right ? 'Premium unlocked' : `It was ${p.answer.name}`}</Text>
                {answered.right ? (
                  <Text style={[type.num, { color: color.win, textAlign: 'center' }]}>{`+${REWARDS.guessCredits} credits · +${REWARDS.guessBoosters} boosters`}</Text>
                ) : null}
              </Animated.View>
            ) : null}

            {!answered && left === 0 ? (
              doneToday
            ) : (
              <View style={styles.options}>
                {p.options.map((o) => (
                  <Option key={o.id} card={o} state={stateOf(o)} disabled={!!answered} onPress={() => answer(o)} />
                ))}
              </View>
            )}

            {answered ? (
              <View style={styles.actions}>{left > 0 ? <Button label="Next player" onPress={nextPlayer} /> : doneToday}</View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg },
  scroll: { alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.x5, gap: space.lg },
  head: { gap: space.xs, alignItems: 'center' },
  result: { gap: space.xs, alignItems: 'center' },
  options: { alignSelf: 'stretch', maxWidth: 420, width: '100%', alignItems: 'stretch', marginHorizontal: 'auto', gap: space.sm },
  option: { minHeight: size.row, borderRadius: 12, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  optionText: { flex: 1, fontFamily: font.medium, fontSize: 16, lineHeight: 21 },
  actions: { alignSelf: 'stretch', maxWidth: 420, width: '100%', marginHorizontal: 'auto' },
});
