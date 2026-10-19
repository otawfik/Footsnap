import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Image, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../../components/Card';
import { LeagueSelector } from '../../components/LeagueSelector';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FixtureCard, ScoreCard } from '../../components/MatchCards';
import { useApi } from '../../hooks/useApi';
import { useLeague } from '../../context/league';
import { fetchSeasonMatches, fetchStandings } from '../../services/api';
import { recentForm, splitMatches, totalTable, zone, Result, Zone } from '../../lib/football';
import { fit, predict } from '../../lib/model';
import type { StandingRow } from '../../lib/types';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const ZONE_COLOR: Record<Exclude<Zone, null>, string> = {
  top: Colors.accentBlue,
  europe: Colors.accentPurple,
  playoff: Colors.draw,
  relegation: Colors.loss,
};

function zoneLegend(competitionId: number): [Exclude<Zone, null>, string][] {
  if (competitionId === 2001) return [['top', 'Round of 16'], ['playoff', 'Knockout play-offs'], ['relegation', 'Eliminated']];
  const legend: [Exclude<Zone, null>, string][] = [['top', 'Champions League'], ['europe', 'Europe']];
  if (competitionId === 2002 || competitionId === 2015) legend.push(['playoff', 'Relegation play-off']);
  legend.push(['relegation', 'Relegation']);
  return legend;
}

function FormDot({ result }: { result: Result }) {
  const color = result === 'W' ? Colors.win : result === 'L' ? Colors.loss : Colors.draw;
  return <View style={[styles.formDot, { backgroundColor: color }]} />;
}

function TableRow({ row, index, form, z }: { row: StandingRow; index: number; form: Result[]; z: Zone }) {
  return (
    <View
      style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
      accessible
      accessibilityLabel={`${row.position}. ${row.team.name}, ${row.points} points from ${row.playedGames} games`}
    >
      <View style={styles.posCell}>
        <View style={[styles.zoneBar, z && { backgroundColor: ZONE_COLOR[z] }]} />
        <Text style={styles.posText}>{row.position}</Text>
      </View>
      {row.team.crest ? (
        <Image source={{ uri: row.team.crest }} style={styles.crestSmall} resizeMode="contain" />
      ) : (
        <View style={styles.crestSmall} />
      )}
      <Text style={styles.tableTeam} numberOfLines={1}>{row.team.shortName ?? row.team.name}</Text>
      <Text style={styles.stat}>{row.playedGames}</Text>
      <Text style={styles.stat}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
      <Text style={[styles.stat, styles.points]}>{row.points}</Text>
      <View style={styles.formRow}>
        {form.map((r, i) => <FormDot key={i} result={r} />)}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { league, setLeague } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const [poll, setPoll] = useState(false);

  const standings = useApi((force) => fetchStandings(league.id, force), [league.id]);
  // the season's fixtures carry live scores; re-fetched every 30s only while a
  // match is live or about to kick off
  const season = useApi((force) => fetchSeasonMatches(league.id, force), [league.id], {
    pollMs: poll ? 30_000 : null,
  });

  const view = useMemo(() => splitMatches(season.data?.matches ?? [], Date.now()), [season.data]);
  const shouldPoll =
    view.live.length > 0 || view.upcoming.some((m) => new Date(m.utcDate).getTime() - Date.now() < 15 * 60_000);
  useEffect(() => setPoll(shouldPoll), [shouldPoll]);

  const latest = season.data;
  const ratings = useMemo(() => fit(latest?.matches ?? []), [latest]);
  const table = totalTable(standings.data);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([standings.refetch(), season.refetch()]);
    setRefreshing(false);
  }, [standings, season]);

  const header = (
    <View style={styles.headerRight}>
      {view.live.length ? (
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{view.live.length} LIVE</Text>
        </View>
      ) : null}
      <Pressable onPress={() => router.push('/about')} hitSlop={10} accessibilityRole="button" accessibilityLabel="About FootSnap">
        <Ionicons name="information-circle-outline" size={24} color={Colors.textSecondary} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentGreen} colors={[Colors.accentGreen]} />
        }
      >
        <ScreenHeader title="FootSnap" subtitle="Live · Results · Table" right={header} />
        <LinearGradient colors={[Colors.accentGreen + '18', Colors.bg]} style={styles.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <LeagueSelector selectedId={league.id} onSelect={setLeague} />

        {season.error && !latest ? (
          <View style={styles.section}>
            <ErrorState message={season.error} code={season.errorCode} onRetry={season.refetch} />
          </View>
        ) : season.loading && !latest ? (
          <LoadingSpinner label="Loading fixtures..." />
        ) : (
          <>
            {view.live.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Live now</Text>
                {view.live.map((m) => <ScoreCard key={m.id} match={m} />)}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Latest results</Text>
              {view.results.length === 0 ? (
                <EmptyState icon="🏁" title="No results yet" subtitle="The season hasn't kicked off." />
              ) : (
                view.results.map((m) => <ScoreCard key={m.id} match={m} />)
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.titleRow}>
                <Text style={styles.sectionTitle}>Coming up</Text>
                {ratings ? <Text style={styles.titleNote}>with model odds</Text> : null}
              </View>
              {view.upcoming.length === 0 ? (
                <EmptyState icon="📅" title="No fixtures scheduled" subtitle="Check back closer to the next matchday." />
              ) : (
                view.upcoming.map((m) => (
                  <FixtureCard key={m.id} match={m} prediction={ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null} />
                ))
              )}
            </View>
          </>
        )}

        <View style={styles.section}>
          {!(standings.error && !standings.data && season.error && season.errorCode === standings.errorCode) && (
            <Text style={styles.sectionTitle}>Table</Text>
          )}
          {standings.error && !standings.data ? (
            // one message is enough when both requests fail for the same reason
            season.error && season.errorCode === standings.errorCode ? null : (
              <ErrorState message={standings.error} code={standings.errorCode} onRetry={standings.refetch} />
            )
          ) : (
            <Card noPadding>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.headText, { width: 34 }]}>#</Text>
                <View style={{ width: 30 }} />
                <Text style={[styles.headText, { flex: 1 }]}>Club</Text>
                {['P', 'GD', 'Pts'].map((h) => <Text key={h} style={styles.headStat}>{h}</Text>)}
                <Text style={styles.headForm}>Form</Text>
              </View>
              {standings.loading && !standings.data ? (
                <LoadingSpinner label="Loading table..." />
              ) : table.length === 0 ? (
                <EmptyState title="No table yet" subtitle="Standings appear once the season starts." />
              ) : (
                table.map((row, i) => {
                  const fromMatches = recentForm(latest?.matches ?? [], row.team.id);
                  const fallback = (row.form ?? '').replace(/[^WDL]/g, '').split('').slice(-5) as Result[];
                  return (
                    <TableRow
                      key={row.team.id}
                      row={row}
                      index={i}
                      form={fromMatches.length ? fromMatches : fallback}
                      z={zone(league.id, row.position, table.length)}
                    />
                  );
                })
              )}
            </Card>
          )}
          {table.length > 0 && (
            <View style={styles.legend}>
              {zoneLegend(league.id).map(([z, label]) => (
                <View key={z} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: ZONE_COLOR[z] }]} />
                  <Text style={styles.legendText}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.source}>Data: football-data.org</Text>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  heroGradient: { height: 6, marginHorizontal: Spacing.base, borderRadius: Radius.full, marginBottom: Spacing.sm },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.loss + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.loss + '40',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.loss },
  liveText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.loss, letterSpacing: Typography.wide },

  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.lg, gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: Typography.tight,
    marginBottom: Spacing.xs,
  },
  titleNote: { fontSize: Typography.xs, color: Colors.textMuted },

  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: Spacing.md },
  tableRowAlt: { backgroundColor: Colors.bgElevated + '50' },
  tableHeader: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: Spacing.sm },
  headText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, letterSpacing: Typography.wide, textTransform: 'uppercase' },
  headStat: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, width: 32, textAlign: 'center' },
  headForm: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, width: 62, textAlign: 'right' },
  posCell: { flexDirection: 'row', alignItems: 'center', width: 34, gap: 5 },
  zoneBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: 'transparent' },
  posText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  crestSmall: { width: 22, height: 22, marginRight: Spacing.sm },
  tableTeam: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  stat: { width: 32, textAlign: 'center', fontSize: Typography.sm, color: Colors.textSecondary },
  points: { color: Colors.textPrimary, fontWeight: Typography.bold },
  formRow: { flexDirection: 'row', gap: 3, width: 62, justifyContent: 'flex-end' },
  formDot: { width: 8, height: 8, borderRadius: 4 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 3, borderRadius: 2 },
  legendText: { fontSize: Typography.xs, color: Colors.textMuted },
  source: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
});
