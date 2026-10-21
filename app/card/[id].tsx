/**
 * One card, full screen: tilt it, flip it, upgrade it, switch to its Premium
 * variant. Upgrades spend credits and this card's boosters (lib/collection.ts).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SnapCard, PhotoCredit } from '../../components/SnapCard';
import { Button, Pill, Wallet, tap } from '../../components/ui';
import { useLeague } from '../../context/league';
import { useCards } from '../../hooks/data';
import { useCollection, useProfile } from '../../lib/storage';
import { canUpgrade, FINISH_NAME, lookOf, nextTier, TIERS, upgrade, upgradeSeed } from '../../lib/collection';
import { cardStats } from '../../lib/game';
import { alpha } from '../../lib/colors';
import { C, F, R, S, T } from '../../constants/theme';

function Meter({ have, need, label, color }: { have: number; need: number; label: string; color: string }) {
  const pct = need ? Math.min(1, have / need) : 1;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterLabel, { color: have >= need ? C.chalk : C.muted }]}>{have}/{need}</Text>
      </View>
      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
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
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const flash = useSharedValue(0);
  const card = cards?.get(Number(id));
  const key = String(league.id);
  const state = collection[key]?.[String(id)];
  const next = state ? nextTier(state) : null;
  const affordable = state ? canUpgrade(state, profile.credits) : false;
  const w = Math.min(width - S.xl * 2, (height - 380) / 1.42, 340);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cards'));

  const doUpgrade = () => {
    if (!state || !card || !affordable) return;
    const r = upgrade(state, profile.credits, upgradeSeed(card.id, state.tier + 1));
    setCollection((c) => ({ ...c, [key]: { ...(c[key] ?? {}), [String(card.id)]: r.state } }));
    setProfile((p) => ({ ...p, credits: r.credits }));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!reduced) {
      pop.value = withSequence(withTiming(1.08, { duration: 160 }), withSpring(1, { damping: 8 }));
      flash.value = withSequence(withTiming(0.9, { duration: 120 }), withTiming(0, { duration: 700 }));
    }
  };

  const setVariant = (premium: boolean) => {
    if (!state || !card) return;
    tap('select');
    setCollection((c) => ({ ...c, [key]: { ...(c[key] ?? {}), [String(card.id)]: { ...state, showPremium: premium } } }));
  };

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={styles.top}>
        <Wallet credits={profile.credits} />
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={C.chalk} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {card ? (
          <>
            <Animated.View style={popStyle}>
              <Pressable
                onPress={() => {
                  tap('medium');
                  setFlipped((f) => !f);
                }}
                accessibilityRole="button"
                accessibilityHint="Flips the card"
              >
                <SnapCard card={card} width={w} flipped={flipped} interactive competition={league.name} look={lookOf(state)} />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.chalk, borderRadius: 16 }, flashStyle]} />
              </Pressable>
            </Animated.View>
            <Text style={styles.hint}>{flipped ? 'Tap to flip back' : 'Tilt your phone · tap to flip'}</Text>
            {/* inspect view, as in Snap: the card's ability text lives under the card, not on its face */}
            <View style={styles.abilities}>
              {(() => {
                const g = cardStats(card);
                return g.effect ? (
                  <View style={styles.ability}>
                    <Text style={styles.abilityKind}>DUEL · {g.effect.trigger === 'reveal' ? 'ON REVEAL' : g.effect.trigger === 'ongoing' ? 'ONGOING' : 'END OF TURN'}</Text>
                    <Text style={styles.abilityText}>{g.effect.text}</Text>
                  </View>
                ) : null;
              })()}
              {card.abilities.map((a) => (
                <View key={a.title} style={styles.ability}>
                  <Text style={styles.abilityKind}>{a.kind === 'ongoing' ? 'THIS SEASON' : 'TRAIT'} · {a.title.toUpperCase()}</Text>
                  <Text style={styles.abilityText}>{a.text}</Text>
                </View>
              ))}
            </View>
            <PhotoCredit card={card} />

            {state ? (
              <View style={styles.panel}>
                <View style={styles.row}>
                  <Text style={T.kicker}>
                    {TIERS[state.tier].name}
                    {state.finish ? ` · ${FINISH_NAME[state.finish]} finish` : ''}
                  </Text>
                  <Text style={T.kicker}>{state.copies} {state.copies === 1 ? 'copy' : 'copies'} · {state.boosters} boosters</Text>
                </View>

                {state.premium ? (
                  <View style={{ flexDirection: 'row', gap: S.sm }}>
                    <Pill label="Base art" active={!state.showPremium} onPress={() => setVariant(false)} />
                    <Pill label="Premium" active={state.showPremium} onPress={() => setVariant(true)} color={C.icon} />
                  </View>
                ) : (
                  <Text style={T.small}>Premium variant locked. Name this player in “Who's this?” to unlock it.</Text>
                )}

                {next ? (
                  <View style={{ gap: S.md }}>
                    <View>
                      <Text style={styles.nextTitle}>Next: {next.name}</Text>
                      <Text style={T.small}>{next.effect}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: S.lg }}>
                      <Meter label="CREDITS" have={profile.credits} need={next.credits} color={C.icon} />
                      <Meter label="BOOSTERS" have={state.boosters} need={next.boosters} color={card.team.colors.accent} />
                    </View>
                    <Button label={affordable ? `Upgrade to ${next.name}` : 'Not enough yet'} onPress={doUpgrade} disabled={!affordable} icon="arrow-up-circle" />
                    {!affordable ? <Text style={T.small}>Boosters come from duplicate pulls of this card and from naming the player. Credits come from packs, duplicates and correct picks.</Text> : null}
                  </View>
                ) : (
                  <Text style={[styles.nextTitle, { color: '#F6DC8A' }]}>Fully upgraded: Legend</Text>
                )}
              </View>
            ) : (
              <View style={styles.panel}>
                <Text style={styles.nextTitle}>Not in your collection</Text>
                <Text style={T.small}>Open your daily pack, or name this player in “Who's this?”, to collect it and start upgrading.</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={T.body}>Loading card…</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 'rgba(5,8,6,0.97)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingTop: S.md },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: alpha(C.icon, 0.12), borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  walletText: { fontFamily: F.num, fontSize: 15, color: C.icon },
  scroll: { alignItems: 'center', paddingTop: S.xxl + S.md, paddingBottom: 60, gap: S.md, paddingHorizontal: S.base },
  hint: { fontFamily: F.label, fontSize: 12, letterSpacing: 1.4, color: C.muted, textTransform: 'uppercase', marginTop: S.sm },
  panel: { alignSelf: 'stretch', maxWidth: 420, width: '100%', backgroundColor: C.pitch, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.base, gap: S.md, marginTop: S.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: S.sm },
  nextTitle: { fontFamily: F.display, fontSize: 22, color: C.chalk },
  meter: { height: 6, borderRadius: 3, backgroundColor: C.turf, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  abilities: { alignSelf: 'stretch', maxWidth: 420, width: '100%', gap: S.sm },
  ability: { borderLeftWidth: 3, borderLeftColor: C.flare, paddingLeft: S.md, paddingVertical: 2 },
  abilityKind: { fontFamily: F.label, fontSize: 11, letterSpacing: 1.3, color: C.muted },
  abilityText: { fontFamily: F.bodyMedium, fontSize: 15, lineHeight: 21, color: C.chalk },
  meterLabel: { fontFamily: F.label, fontSize: 11, letterSpacing: 1.2, color: C.muted },
});
