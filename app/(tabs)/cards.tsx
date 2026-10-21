import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, LeagueTabs, Section, Panel, Skeleton, Failed, Pill, Button, Empty, Wallet, tap } from '../../components/ui';
import { SnapCard, CardBack, cardHeight } from '../../components/SnapCard';
import { useLeague } from '../../context/league';
import { useCards } from '../../hooks/data';
import { useCollection, usePacks, useProfile, today } from '../../lib/storage';
import { collectionLevel, lookOf, milestoneReward, MILESTONE_STEP, unclaimed } from '../../lib/collection';
import { GUESSES_PER_DAY } from '../../lib/guess';
import { alpha } from '../../lib/colors';
import { RARITY_NAME, Rarity } from '../../lib/cards';
import { ODDS } from '../../lib/packs';
import { C, F, R, S, T } from '../../constants/theme';

type Filter = 'all' | 'collected' | Rarity;
const PAGE = 45;

function untilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

function PackHero({ opened, leagueName, onOpen }: { opened: boolean; leagueName: string; onOpen: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!opened) return;
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [opened]);
  return (
    <Panel style={styles.pack} onPress={onOpen} label={opened ? "See today's pack" : 'Open your daily pack'}>
      <View style={styles.fan}>
        {[-14, 0, 14].map((deg, i) => (
          <View key={deg} style={[styles.fanCard, { transform: [{ rotate: `${deg}deg` }, { translateX: (i - 1) * 16 }], zIndex: i === 1 ? 2 : 1 }]}>
            <CardBack width={64} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={T.kicker}>{opened ? 'Opened today' : 'Daily pack ready'}</Text>
        <Text style={T.h2}>{opened ? `Next pack in ${untilMidnight()}` : leagueName.startsWith('bonus') ? 'Bonus pack ready' : `5 ${leagueName} players`}</Text>
        <Text style={T.small}>{opened ? "Tap to see today's cards again." : 'Free, one a day per league. Tap to open.'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.muted} />
    </Panel>
  );
}

export default function Cards() {
  const { league, setLeague } = useLeague();
  const { list, loading, error, errorCode, refetch } = useCards(league);
  const [collection] = useCollection();
  const [packs] = usePacks();
  const [profile, setProfile] = useProfile();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const { width } = useWindowDimensions();
  const owned = collection[String(league.id)] ?? {};
  const ownedCount = list.filter((c) => owned[String(c.id)]).length;
  const opened = packs[String(league.id)] === today() && profile.bonusPacks === 0;
  // Collection Level spans every competition, like a single Snap collection
  const level = collectionLevel(Object.values(collection).flatMap((m) => Object.values(m)));
  const toClaim = unclaimed(level, profile.claimed);
  const nextMilestone = Math.floor(level / MILESTONE_STEP) * MILESTONE_STEP + MILESTONE_STEP;
  const guessesLeft = GUESSES_PER_DAY - (profile.guesses.day === today() ? profile.guesses.used : 0);
  const claim = () => {
    tap('heavy');
    setProfile((p) => {
      let credits = p.credits;
      let bonusPacks = p.bonusPacks;
      for (const m of unclaimed(level, p.claimed)) {
        const r = milestoneReward(m);
        credits += r.credits;
        if (r.bonusPack) bonusPacks += 1;
      }
      return { ...p, credits, bonusPacks, claimed: [...p.claimed, ...unclaimed(level, p.claimed)] };
    });
  };

  const gridW = Math.min(width, 520) - S.base * 2;
  const cardW = Math.floor((gridW - S.sm * 2) / 3);

  useEffect(() => setLimit(PAGE), [league.id, filter, query]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => {
      if (filter === 'collected' && !owned[String(c.id)]) return false;
      if (filter !== 'all' && filter !== 'collected' && c.rarity !== filter) return false;
      if (q.length >= 2 && !c.name.toLowerCase().includes(q) && !c.team.shortName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, filter, query, owned]);

  const icons = list.filter((c) => c.rarity === 'icon');

  return (
    <Screen>
      <Header kicker={list.length ? `${ownedCount} of ${list.length} ${league.name} cards` : league.name} title="Cards" right={<View style={{ paddingBottom: 8 }}><Wallet credits={profile.credits} /></View>} />
      <LeagueTabs value={league.id} onChange={setLeague} />

      {loading ? (
        <Section title="Shuffling the deck">
          <Skeleton rows={2} height={160} />
        </Section>
      ) : error ? (
        <Section title="Cards">
          <Failed message={error} code={errorCode} onRetry={refetch} />
        </Section>
      ) : (
        <>
          <View style={{ paddingHorizontal: S.base, marginTop: S.md, gap: S.sm }}>
            <Panel style={styles.level}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelNum}>{level}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={T.kicker}>Collection level</Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${((level % MILESTONE_STEP) / MILESTONE_STEP) * 100}%` }]} />
                </View>
                <Text style={T.small}>
                  {toClaim.length ? `${toClaim.length} reward${toClaim.length > 1 ? 's' : ''} ready` : `Next reward at ${nextMilestone}: ${milestoneReward(nextMilestone).credits} credits${milestoneReward(nextMilestone).bonusPack ? ' + bonus pack' : ''}`}
                </Text>
              </View>
              {toClaim.length ? <Button label="Claim" onPress={claim} /> : null}
            </Panel>
            <PackHero opened={opened} leagueName={profile.bonusPacks && packs[String(league.id)] === today() ? `bonus · ${league.name}` : league.name} onOpen={() => router.push('/pack')} />
            <Panel style={styles.guess} onPress={() => router.push('/guess')} label="Who's this? Name the player to unlock Premium cards">
              <View style={styles.guessIcon}>
                <Text style={styles.guessQ}>?</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.kicker}>{Math.max(0, guessesLeft)} of {GUESSES_PER_DAY} left today</Text>
                <Text style={T.h2}>Who's this?</Text>
                <Text style={T.small}>Name the mystery player to unlock their Premium card.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.muted} />
            </Panel>
          </View>

          {icons.length > 0 && (
            <Section title="Icons" note={`Top three of the ${league.name}'s top 20 scorers, by goals × 2 + assists`}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.md, paddingRight: S.base }} style={{ marginHorizontal: -S.base, paddingLeft: S.base }}>
                {icons.map((c) => (
                  <Pressable key={c.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })} accessibilityRole="button">
                    <SnapCard card={c} size="md" idleShimmer collected={!!owned[String(c.id)]} competition={league.name} look={lookOf(owned[String(c.id)])} />
                  </Pressable>
                ))}
              </ScrollView>
            </Section>
          )}

          <Section title="Every player" note="Rarity comes from this season's goal contributions. Every ability is a real stat or fact.">
            <View style={styles.search}>
              <Ionicons name="search" size={16} color={C.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Find a player or club"
                placeholderTextColor={C.dim}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Find a player or club"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {(['all', 'icon', 'elite', 'rare', 'common', 'collected'] as Filter[]).map((f) => (
                <Pill key={f} label={f === 'all' ? 'All' : f === 'collected' ? 'Collected' : RARITY_NAME[f as Rarity]} active={filter === f} onPress={() => setFilter(f)} />
              ))}
            </ScrollView>

            {shown.length === 0 ? (
              <Empty icon="albums-outline" title={filter === 'collected' ? 'No cards yet' : 'No cards match'} text={filter === 'collected' ? 'Open your daily pack to start collecting.' : undefined} />
            ) : (
              <View style={[styles.grid, { width: gridW }]}>
                {shown.slice(0, limit).map((c) => {
                  const have = !!owned[String(c.id)];
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })}
                      style={{ width: cardW, height: cardHeight(cardW), opacity: have || c.rarity !== 'common' ? 1 : 0.55 }}
                      accessibilityRole="button"
                    >
                      <SnapCard card={c} width={cardW} collected={have} loadPhoto={c.rarity !== 'common' || have} competition={league.name} look={lookOf(owned[String(c.id)])} />
                      {!have ? (
                        <View style={styles.lock}>
                          <Ionicons name="lock-closed" size={11} color={C.chalk2} />
                        </View>
                      ) : owned[String(c.id)].copies > 1 ? (
                        <View style={styles.copies}>
                          <Text style={styles.copiesText}>×{owned[String(c.id)].copies}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {shown.length > limit ? <Button kind="ghost" label={`Show more (${shown.length - limit})`} onPress={() => setLimit((l) => l + PAGE)} /> : null}
          </Section>

          <Section title="Pack odds">
            <Text style={T.small}>
              {ODDS.map(([r, p]) => `${RARITY_NAME[r]} ${Math.round(p * 100)}%`).join(' · ')} per card. Packs are free; there's nothing to buy.
            </Text>
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  level: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.base },
  levelBadge: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: C.icon, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.icon, 0.08) },
  levelNum: { fontFamily: F.numHeavy, fontSize: 24, color: C.icon },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.turf, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.icon, borderRadius: 3 },
  guess: { flexDirection: 'row', alignItems: 'center', gap: S.lg, padding: S.base, paddingLeft: S.lg },
  guessIcon: { width: 64, height: 88, borderRadius: 10, borderWidth: 2, borderColor: C.icon, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.icon, 0.08), marginHorizontal: 16 },
  guessQ: { fontFamily: F.display, fontSize: 48, color: C.icon },
  pack: { flexDirection: 'row', alignItems: 'center', gap: S.lg, padding: S.base, paddingLeft: S.lg },
  fan: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  fanCard: { position: 'absolute' },
  search: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.pitch, borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: S.md },
  searchInput: { flex: 1, color: C.chalk, fontFamily: F.body, fontSize: 15, paddingVertical: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  lock: { position: 'absolute', bottom: 7, right: 7, backgroundColor: 'rgba(10,14,11,0.75)', borderRadius: 10, padding: 4 },
  copies: { position: 'absolute', bottom: 7, right: 7, backgroundColor: C.flare, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  copiesText: { fontFamily: F.num, fontSize: 11, color: C.night },
});
