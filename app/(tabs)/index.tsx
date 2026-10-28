/**
 * Home: your teams first. What's live, the next fixture of every club you follow (pick right
 * there), today's pack, and the current matchday of the selected league with your points.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, LargeHeader, SectionHeader, Credits, Avatar, Button, Skeleton, Failed, Empty, useMounted, PressScale, MiniPack } from '../../components/ui';
import { MatchMarket, CompactMatchRow, LiveRow, longDate } from '../../components/Match';
import { useLeague } from '../../context/league';
import { LEAGUE_MAP } from '../../constants/leagues';
import { currentMatchday, useClubColors, useHomeFixtures, useLiveSeason, useSettlePicks, useTable, useTeams } from '../../hooks/data';
import { fit, predict } from '../../lib/model';
import { isFinished, isLive, isUpcoming } from '../../lib/football';
import { applyPick, applyPress, tally } from '../../lib/picks';
import { useFavorites, usePacks, usePicks, useProfile, today } from '../../lib/storage';
import type { Match } from '../../lib/types';
import { color, font, radius, space, type } from '../../constants/design';

const openMatch = (m: Match, c: number) => router.push({ pathname: '/match/[id]', params: { id: String(m.id), c: String(c) } });

function hoursToMidnight(now = new Date()) {
  const m = new Date(now);
  m.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((m.getTime() - now.getTime()) / 3_600_000));
}

export default function Home() {
  const { league } = useLeague();
  const season = useLiveSeason(league);
  const colors = useClubColors(league);
  const teams = useTeams(league);
  const standings = useTable(league);
  const [favorites, , favReady] = useFavorites();
  const home = useHomeFixtures(favorites);
  const [picks, setPicks] = usePicks();
  const [profile] = useProfile();
  const [packs] = usePacks();
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useMounted();

  const matches = useMemo(() => season.data?.matches ?? [], [season.data]);
  const ratings = useMemo(() => fit(matches), [matches]);
  const allMatches = useMemo(() => [...matches, ...home.data.flatMap((c) => c.matches)], [matches, home.data]);
  useSettlePicks(allMatches);

  const md = useMemo(() => currentMatchday(matches), [matches]);
  const mdFixtures = useMemo(() => (md ? matches.filter((m) => m.matchday === md) : []), [matches, md]);
  const mdScore = useMemo(() => tally(Object.values(picks).filter((p) => mdFixtures.some((m) => m.id === p.matchId)), matches), [picks, mdFixtures, matches]);
  const picked = mdFixtures.filter((m) => picks[String(m.id)]).length;
  const venues = useMemo(() => new Map((teams.data?.teams ?? []).filter((t) => t.venue).map((t) => [t.id, t.venue as string])), [teams.data]);

  // the biggest games of the matchday: both sides high in the table, not already in Your teams
  const big = useMemo(() => {
    const pos = new Map(standings.table.map((r) => [r.team.id, r.position]));
    const shown = new Set(home.fixtures.map((f) => f.match.id));
    const pool = mdFixtures.filter((m) => !shown.has(m.id));
    const open = pool.filter((m) => isUpcoming(m) || isLive(m));
    const list = (open.length >= 2 ? open : pool).slice();
    const rank = (m: Match) => Math.max(pos.get(m.homeTeam.id) ?? 30, pos.get(m.awayTeam.id) ?? 30) * 2 + Math.min(pos.get(m.homeTeam.id) ?? 30, pos.get(m.awayTeam.id) ?? 30);
    return list.sort((a, b) => rank(a) - rank(b) || a.utcDate.localeCompare(b.utcDate)).slice(0, 3).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }, [mdFixtures, standings.table, home.fixtures]);

  // live: the selected league plus every followed club's competition, once each
  const live = useMemo(() => {
    const seen = new Set<number>();
    const out: { match: Match; competitionId: number }[] = [];
    for (const m of season.view.live) if (!seen.has(m.id)) (seen.add(m.id), out.push({ match: m, competitionId: league.id }));
    for (const x of home.live) if (!seen.has(x.match.id)) (seen.add(x.match.id), out.push({ match: x.match, competitionId: x.competitionId }));
    return out;
  }, [season.view.live, home.live, league.id]);
  const colorOf = (cid: number, teamId: number) => (cid === league.id ? colors.get(teamId) : home.data.find((c) => c.competitionId === cid)?.colors.get(teamId));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([season.refetch(), home.refetch()]);
    setRefreshing(false);
  }, [season, home]);

  const opened = packs[String(league.id)] === today();
  const packReady = !opened || profile.bonusPacks > 0;
  const date = mounted ? longDate(new Date()) : ' ';

  const pressFor = (m: Match, cid: number) => {
    const pool = cid === league.id ? matches : home.data.find((c) => c.competitionId === cid)?.matches ?? [];
    const group = m.matchday ? pool.filter((x) => x.matchday === m.matchday) : [m];
    const available = !group.some((x) => x.id !== m.id && picks[String(x.id)]?.snapped);
    return { available, onToggle: () => setPicks((all) => applyPress(all, m, group)) };
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <LargeHeader
        eyebrow={date}
        title="Today"
        right={
          <>
            <Credits credits={profile.credits} />
            <Avatar onPress={() => router.push('/profile')} />
          </>
        }
      />

      {live.length > 0 ? (
        <View style={styles.sec}>
          <SectionHeader title="Live now" />
          {live.map(({ match: m, competitionId: c }, i) => (
            <LiveRow key={m.id} match={m} competition={LEAGUE_MAP[c]?.name} homeColors={colorOf(c, m.homeTeam.id)} awayColors={colorOf(c, m.awayTeam.id)} onPress={() => openMatch(m, c)} divider={i < live.length - 1} />
          ))}
        </View>
      ) : null}

      <View style={styles.sec}>
        <SectionHeader title="Your teams" action={favorites.length ? { label: 'Edit', onPress: () => router.push('/teams') } : undefined} />
        {!favReady ? (
          <Skeleton rows={1} height={190} />
        ) : !favorites.length ? (
          <PressScale onPress={() => router.push('/teams')} style={styles.promo} pressedStyle={{ backgroundColor: color.raised }} accessibilityLabel="Pick your teams">
            <View style={styles.promoIcon}>
              <Ionicons name="star" size={18} color={color.accentText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.promoTitle}>Pick your teams</Text>
              <Text style={type.footnote}>Their next matches show up here first, ready to pick.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.text3} />
          </PressScale>
        ) : home.error && !home.data.length ? (
          <Failed message={home.error} code={home.errorCode} onRetry={home.refetch} />
        ) : home.loading && !home.data.length ? (
          <Skeleton rows={2} height={180} gap={space.lg} />
        ) : !home.fixtures.length ? (
          <Empty icon="calendar-outline" title="Nothing scheduled" text="None of your teams has a fixture coming up yet." action={{ label: 'Edit teams', onPress: () => router.push('/teams') }} />
        ) : (
          home.fixtures.map((f, i) => (
            <MatchMarket
              key={f.match.id}
              match={f.match}
              prediction={f.prediction}
              pick={picks[String(f.match.id)]}
              onPick={(o) => setPicks((all) => applyPick(all, f.match.id, o))}
              homeColors={f.homeColors}
              awayColors={f.awayColors}
              venue={f.venue}
              competition={LEAGUE_MAP[f.competitionId]?.name}
              onOpen={() => openMatch(f.match, f.competitionId)}
              press={pressFor(f.match, f.competitionId)}
              divider={i < home.fixtures.length - 1}
            />
          ))
        )}
      </View>

      <PressScale
        onPress={() => (packReady ? router.push('/pack') : router.navigate('/cards'))}
        style={styles.packRow}
        pressedStyle={{ backgroundColor: color.raised }}
        accessibilityLabel={packReady ? 'Open your daily pack' : `Next pack in ${hoursToMidnight()} hours`}
      >
        <MiniPack />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.packTitle}>{packReady ? (opened ? 'Bonus pack is ready' : 'Daily pack is ready') : mounted ? `Next pack in ${hoursToMidnight()} h` : 'Daily pack opened'}</Text>
          <Text style={type.footnote}>{league.name} · 5 cards</Text>
        </View>
        {packReady ? <Button label="Open" size="sm" onPress={() => router.push('/pack')} /> : <Ionicons name="chevron-forward" size={18} color={color.text3} />}
      </PressScale>

      <View style={styles.sec}>
        <SectionHeader title={md ? `Matchday ${md}` : league.name} action={{ label: 'All matches', onPress: () => router.navigate('/matches') }} />
        {season.error && !season.data ? (
          <Failed message={season.error} code={season.errorCode} onRetry={season.refetch} />
        ) : season.loading && !season.data ? (
          <Skeleton rows={3} height={56} />
        ) : !mdFixtures.length ? (
          <Empty icon="calendar-outline" title="Nothing scheduled" text="Check back closer to the next matchday." />
        ) : (
          <>
            <View style={styles.score3}>
              <View style={styles.score3Cell}>
                <Text style={type.numLarge}>{mdScore.you}</Text>
                <Text style={styles.score3Label}>Your points</Text>
              </View>
              <View style={styles.score3Cell}>
                <Text style={type.numLarge}>{mdScore.model}</Text>
                <Text style={styles.score3Label}>Model</Text>
              </View>
              <View style={styles.score3Cell}>
                <Text style={type.numLarge}>
                  {picked}
                  <Text style={styles.score3Of}>/{mdFixtures.length}</Text>
                </Text>
                <Text style={styles.score3Label}>Picked</Text>
              </View>
            </View>
            {big.map((m, i) => (
              <CompactMatchRow
                key={m.id}
                match={m}
                prediction={ratings && !isFinished(m) ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null}
                homeColors={colors.get(m.homeTeam.id)}
                awayColors={colors.get(m.awayTeam.id)}
                pick={picks[String(m.id)]}
                onPress={() => openMatch(m, league.id)}
                divider={i < big.length - 1}
              />
            ))}
          </>
        )}
      </View>
      <Pressable onPress={() => router.push('/about')} style={styles.fine} accessibilityRole="link">
        <Text style={[type.caption, { textAlign: 'center' }]}>Chances come from a goals model. Picks are free, for points only.</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sec: { paddingTop: space.sm, paddingBottom: space.xl },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: color.surface, marginTop: space.sm },
  promoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  promoTitle: { fontFamily: font.semibold, fontSize: 16, color: color.text },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: color.surface, marginTop: space.xs, marginBottom: space.xxl },
  packTitle: { fontFamily: font.semibold, fontSize: 16, color: color.text },
  score3: { flexDirection: 'row', paddingTop: space.sm, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: color.hairline },
  score3Cell: { flex: 1, gap: 2 },
  score3Of: { fontFamily: font.semibold, fontSize: 17, color: color.text3, letterSpacing: 0 },
  score3Label: { fontFamily: font.medium, fontSize: 13, color: color.text3 },
  fine: { paddingTop: space.sm, paddingBottom: space.lg },
});
