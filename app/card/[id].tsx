/**
 * Card view (SPEC.md §5): the full card on a tinted stage. Tilt it, flip it, upgrade it,
 * switch to its Premium variant. Upgrades spend credits and this card's boosters (lib/collection.ts).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView, Platform, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, useReducedMotion } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SnapCard, PhotoCredit } from '../../components/SnapCard';
import { Button, Credits, ProgressBar, tap } from '../../components/ui';
import { useLeague } from '../../context/league';
import { useCards } from '../../hooks/data';
import { useCollection, useProfile } from '../../lib/storage';
import { canUpgrade, FINISH_NAME, lookOf, nextTier, upgrade, upgradeSeed } from '../../lib/collection';
import { cardStats } from '../../lib/game';
import type { Rarity } from '../../lib/cards';
import { color, font, space, type } from '../../constants/design';

const TINT: Record<Rarity, string> = { icon: 'rgba(200,210,255,0.16)', elite: 'rgba(240,200,110,0.14)', rare: 'rgba(220,225,235,0.10)', common: 'rgba(222,150,96,0.12)' };
const HINT_KEY = 'fs.cardhint.v1';
const TRIGGER = { reveal: 'On Reveal', ongoing: 'Ongoing', end: 'End of turn' } as const;

function AbilityRow({ label, title, text, accent }: { label: string; title: string; text: string; accent?: boolean }) {
  return (
    <View style={styles.ability}>
      <Text style={[type.overline, styles.abilityLabel, accent && { color: color.accentText }]}>{label}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.abilityTitle}>{title}</Text>
        <Text style={styles.abilityText}>{text}</Text>
      </View>
    </View>
  );
}

export default function CardView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league } = useLeague();
  const { cards } = useCards(league);
  const [collection, setCollection] = useCollection();
  const [profile, setProfile] = useProfile();
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(true);
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const flash = useSharedValue(0);
  const card = cards?.get(Number(id));
  const key = String(league.id);
  const state = collection[key]?.[String(id)];
  const next = state ? nextTier(state) : null;
  const affordable = state ? canUpgrade(state, profile.credits) : false;
  const w = width <= 400 ? 268 : 300;

  useEffect(() => {
    AsyncStorage.getItem(HINT_KEY)
      .then((v) => v && setHint(false))
      .catch(() => {});
  }, []);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cards'));
  const flip = () => {
    tap('light');
    setFlipped((f) => !f);
    if (hint) {
      setHint(false);
      AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
    }
  };

  const doUpgrade = () => {
    if (!state || !card || !affordable) return;
    const r = upgrade(state, profile.credits, upgradeSeed(card.id, state.tier + 1));
    setCollection((c) => ({ ...c, [key]: { ...(c[key] ?? {}), [String(card.id)]: r.state } }));
    setProfile((p) => ({ ...p, credits: r.credits }));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.value = withSequence(withTiming(reduced ? 0.4 : 0.8, { duration: 120 }), withTiming(0, { duration: 200 }));
  };

  const setVariant = (premium: boolean) => {
    if (!state || !card) return;
    tap('select');
    setCollection((c) => ({ ...c, [key]: { ...(c[key] ?? {}), [String(card.id)]: { ...state, showPremium: premium } } }));
  };

  const g = card ? cardStats(card) : null;
  const season = card?.abilities.find((a) => a.kind === 'ongoing');
  const trait = card?.abilities.find((a) => a.kind === 'trait');
  const meta = card ? [card.team.shortName, card.position, card.nationality, card.age !== null ? String(card.age) : null].filter(Boolean).join(' · ') : '';
  const stage = width;

  return (
    <View style={styles.wrap}>
      {card ? (
        <Svg width={stage} height={stage * 0.9} style={{ position: 'absolute', top: 40, left: (width - stage) / 2 }} pointerEvents="none">
          <Defs>
            <RadialGradient id="tint" cx="50%" cy="45%" r="50%">
              <Stop offset="0" stopColor={TINT[card.rarity]} />
              <Stop offset="1" stopColor={TINT[card.rarity]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={stage} height={stage * 0.9} fill="url(#tint)" />
        </Svg>
      ) : null}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={color.text} />
          </Pressable>
          <Credits credits={profile.credits} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {card && g ? (
            <>
              <View style={{ marginTop: 18 }}>
                <SnapCard card={card} size="full" width={w} flipped={flipped} interactive onPress={flip} competition={league.name} collected={!!state} look={lookOf(state)} />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', borderRadius: 8 }, flashStyle]} />
              </View>
              {hint ? (
                <View style={styles.hint}>
                  <Ionicons name="sync-outline" size={13} color={color.text3} />
                  <Text style={type.caption}>Drag to tilt · Tap to flip</Text>
                </View>
              ) : (
                <View style={{ height: 22 }} />
              )}

              <View style={styles.body}>
                <Text style={type.title}>{card.name}</Text>
                <Text style={[type.footnote, { marginTop: 2 }]}>{meta}</Text>

                <View style={{ marginTop: 14 }}>
                  {g.effect ? (
                    <AbilityRow label="Duel" accent title={TRIGGER[g.effect.trigger]} text={g.effect.text.replace(/^(On Reveal|Ongoing|End of turn): /, '').replace(/^./, (c) => c.toUpperCase())} />
                  ) : (
                    <AbilityRow label="Duel" accent title="No ability" text={`Cost ${g.cost} · Power ${g.power}`} />
                  )}
                  {season ? <AbilityRow label="Season" title={season.title} text={season.text} /> : null}
                  {trait ? <AbilityRow label="Trait" title={trait.title} text={trait.text} /> : null}
                </View>

                {state ? (
                  <View style={{ marginTop: 16, gap: 12 }}>
                    {next ? (
                      <View style={styles.upgrade}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={type.bodyStrong}>{`Next: ${next.name}`}</Text>
                          <Text style={type.footnote}>{`${Math.min(state.boosters, next.boosters)} of ${next.boosters} boosters · ${next.credits} credits`}</Text>
                          <ProgressBar value={next.boosters ? Math.min(1, state.boosters / next.boosters) : 1} style={{ marginTop: 8 }} />
                        </View>
                        <Button label="Upgrade" onPress={doUpgrade} disabled={!affordable} />
                      </View>
                    ) : (
                      <Text style={type.bodyStrong}>{`Fully upgraded · ${state.finish ? FINISH_NAME[state.finish] : 'Gilded'} finish`}</Text>
                    )}
                    {next ? <Text style={type.footnote}>{next.effect}</Text> : null}
                    {state.premium ? (
                      <View style={styles.switchRow}>
                        <Text style={type.bodyStrong}>Premium variant</Text>
                        <Switch value={state.showPremium} onValueChange={setVariant} trackColor={{ true: color.accent, false: color.hairlineStrong }} thumbColor="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ marginTop: 16, gap: 4 }}>
                    <Text style={type.bodyStrong}>Not in your collection</Text>
                    <Text style={type.footnote}>Open your daily pack, or name this player in Who's this?, to collect and upgrade it.</Text>
                  </View>
                )}

                <View style={{ marginTop: 20, alignItems: 'center' }}>
                  <PhotoCredit card={card} />
                </View>
              </View>
            </>
          ) : (
            <Text style={[type.body, { marginTop: 80 }]}>Loading card…</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.md, height: 44 },
  scroll: { alignItems: 'center', paddingBottom: 60 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 22, marginTop: 18 },
  body: { alignSelf: 'stretch', paddingHorizontal: space.gutter, marginTop: 14, maxWidth: 520, width: '100%' },
  ability: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: color.hairline },
  abilityLabel: { width: 70, paddingTop: 2 },
  abilityTitle: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: color.text },
  abilityText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: color.text2 },
  upgrade: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
});
