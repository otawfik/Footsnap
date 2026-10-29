/**
 * Cards (SPEC.md §5): Collection Level, the daily pack and Who's this? tiles, rarity filters,
 * then the 3-column grid of every player in the competition. Uncollected cards are dimmed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Screen, LargeHeader, Credits, Button, ProgressBar, FilterChips, Skeleton, Failed, Empty, MiniPack, tap } from '../../components/ui';
import { SnapCard, cardHeight } from '../../components/SnapCard';
import { useLeague } from '../../context/league';
import { useCards } from '../../hooks/data';
import { useCollection, usePacks, useProfile, today } from '../../lib/storage';
import { canUpgrade, collectionLevel, lookOf, milestoneReward, MILESTONE_STEP, unclaimed } from '../../lib/collection';
import { GUESSES_PER_DAY } from '../../lib/guess';
import type { Rarity } from '../../lib/cards';
import { cardStats } from '../../lib/game';
import { color, font, radius, space, type } from '../../constants/design';

const FILTERS: { label: string; rarity: Rarity | null }[] = [
  { label: 'All', rarity: null },
  { label: 'Icon', rarity: 'icon' },
  { label: 'Gold', rarity: 'elite' },
  { label: 'Silver', rarity: 'rare' },
  { label: 'Bronze', rarity: 'common' },
];
const ORDER: Record<Rarity, number> = { icon: 0, elite: 1, rare: 2, common: 3 };
const PAGE = 45;

function untilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const h = Math.max(1, Math.round((next.getTime() - now.getTime()) / 3_600_000));
  return `${h} h`;
}

export default function Cards() {
  const { league } = useLeague();
  const { list, loading, error, errorCode, refetch } = useCards(league);
  const [collection] = useCollection();
  const [packs] = usePacks();
  const [profile, setProfile] = useProfile();
  const [filter, setFilter] = useState(0);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const { width } = useWindowDimensions();
  const owned = collection[String(league.id)] ?? {};
  const ownedCount = list.filter((c) => owned[String(c.id)]).length;
  const opened = packs[String(league.id)] === today() && profile.bonusPacks === 0;
  const level = collectionLevel(Object.values(collection).flatMap((m) => Object.values(m)));
  const toClaim = unclaimed(level, profile.claimed);
  const nextMilestone = Math.floor(level / MILESTONE_STEP) * MILESTONE_STEP + MILESTONE_STEP;
  const guessesLeft = Math.max(0, GUESSES_PER_DAY - (profile.guesses.day === today() ? profile.guesses.used : 0));
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

  // (screen − 40 − 20) / 3, capped for tablets and the web
  const gridW = Math.min(width, 520) - space.gutter * 2;
  const cardW = Math.floor((gridW - 20) / 3);

  useEffect(() => setLimit(PAGE), [league.id, filter, ownedOnly]);

  const shown = useMemo(() => {
    const r = FILTERS[filter].rarity;
    return list
      .filter((c) => (!r || c.rarity === r) && (!ownedOnly || owned[String(c.id)]))
      .sort(
        (a, b) =>
          Number(!!owned[String(b.id)]) - Number(!!owned[String(a.id)]) ||
          ORDER[a.rarity] - ORDER[b.rarity] ||
          cardStats(b).power - cardStats(a).power ||
          a.name.localeCompare(b.name)
      );
  }, [list, filter, ownedOnly, owned]);

  return (
    <Screen>
      <LargeHeader title="Cards" leagueMenu right={<Credits credits={profile.credits} />} />

      {loading ? (
        <Skeleton rows={3} height={150} />
      ) : error ? (
        <Failed message={error} code={errorCode} onRetry={refetch} />
      ) : (
        <>
          <View style={styles.level}>
            <View style={styles.between}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={styles.levelNum}>{level}</Text>
                <Text style={styles.levelTitle}>Collection level</Text>
              </View>
              <Text style={type.footnote}>{`${ownedCount} of ${list.length} cards`}</Text>
            </View>
            <ProgressBar value={(level % MILESTONE_STEP) / MILESTONE_STEP} style={{ marginVertical: 10 }} />
            <View style={styles.between}>
              <Text style={type.footnote}>{toClaim.length ? `${toClaim.length} reward${toClaim.length > 1 ? 's' : ''} ready` : `Next reward at ${nextMilestone}`}</Text>
              {toClaim.length ? (
                <Button label="Claim" size="sm" onPress={claim} />
              ) : (
                <Text style={type.footnote}>{`+${milestoneReward(nextMilestone).credits} credits${milestoneReward(nextMilestone).bonusPack ? ' + pack' : ''}`}</Text>
              )}
            </View>
          </View>

          <View style={styles.tiles}>
            <Pressable style={({ pressed }) => [styles.tile, styles.packTile, pressed && { backgroundColor: color.raised }]} onPress={() => router.push('/pack')} accessibilityRole="button" accessibilityLabel={opened ? "See today's pack" : 'Open your daily pack'}>
              <MiniPack width={28} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tileTitle}>Daily pack</Text>
                <Text style={styles.tileSub}>{opened ? `Opens in ${untilMidnight()}` : 'Ready to open'}</Text>
              </View>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.tile, pressed && { backgroundColor: color.raised }]} onPress={() => router.push('/guess')} accessibilityRole="button" accessibilityLabel="Who's this? Name the player to unlock Premium cards">
              <View style={styles.qmark}>
                <Text style={styles.qmarkText}>?</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileTitle}>Who's this?</Text>
                <Text style={styles.tileSub}>{`${guessesLeft} of ${GUESSES_PER_DAY} left`}</Text>
              </View>
            </Pressable>
          </View>

          <FilterChips options={FILTERS.map((f) => f.label)} value={filter} onChange={setFilter} extra={[{ label: 'Owned', on: ownedOnly, onPress: () => setOwnedOnly((o) => !o) }]} style={{ marginBottom: 16 }} />

          {shown.length === 0 ? (
            <Empty icon="albums-outline" title={ownedOnly ? 'No cards yet' : 'No cards match'} text={ownedOnly ? 'Open your daily pack to start collecting.' : undefined} />
          ) : (
            <View style={[styles.grid, { width: gridW }]}>
              {shown.slice(0, limit).map((c) => {
                const st = owned[String(c.id)];
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })}
                    style={({ pressed }) => [{ width: cardW, height: cardHeight(cardW) }, pressed && { transform: [{ scale: 0.97 }] }]}
                    accessibilityRole="button"
                  >
                    <SnapCard card={c} size="grid" width={cardW} collected={!!st} competition={league.name} look={lookOf(st)} />
                    {st && canUpgrade(st, profile.credits) ? <View style={styles.upgradeDot} accessibilityLabel="Upgrade ready" /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          {shown.length > limit ? <Button kind="ghost" label={`Show more (${shown.length - limit})`} onPress={() => setLimit((l) => l + PAGE)} style={{ marginTop: 12 }} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  level: { paddingTop: 2, paddingBottom: 18 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelTitle: { fontFamily: font.medium, fontSize: 14, color: color.text2 },
  levelNum: { fontFamily: font.cardHeavy, fontSize: 30, lineHeight: 34, color: color.text, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: color.surface },
  packTile: { borderWidth: 1, borderColor: 'rgba(233,196,106,0.42)' },
  tileTitle: { fontFamily: font.semibold, fontSize: 15, color: color.text },
  tileSub: { fontFamily: font.medium, fontSize: 12.5, color: color.text3, marginTop: 1 },
  qmark: { width: 28, height: 38, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised, borderWidth: 1, borderColor: color.hairlineStrong },
  qmarkText: { fontFamily: font.cardHeavy, fontSize: 18, color: color.text2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 14 },
  upgradeDot: { position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: color.accentText },
});
