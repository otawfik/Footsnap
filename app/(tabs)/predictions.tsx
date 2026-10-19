/**
 * Predictions from the Poisson goals model in lib/model.ts: the model's record
 * on this season's matches so far, odds for the next fixtures, and a strength
 * ranking from the fitted attack and defence ratings.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../../components/Card';
import { LeagueSelector } from '../../components/LeagueSelector';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FixtureCard } from '../../components/MatchCards';
import { useApi } from '../../hooks/useApi';
import { useLeague } from '../../context/league';
import { fetchSeasonMatches } from '../../services/api';
import { isFinished, isUpcoming, recentForm, Result } from '../../lib/football';
import { backtest, fit, predict } from '../../lib/model';
import type { Team } from '../../lib/types';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

function Pip({ r }: { r: Result }) {
  return <View style={[styles.pip, { backgroundColor: r === 'W' ? Colors.win : r === 'L' ? Colors.loss : Colors.draw }]} />;
}

export default function PredictionsScreen() {
  const { league, setLeague } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, errorCode, refetch } = useApi((force) => fetchSeasonMatches(league.id, force), [league.id]);
  const matches = data?.matches ?? [];

  const ratings = useMemo(() => fit(matches), [matches]);
  const record = useMemo(() => backtest(matches), [matches]);

  const fixtures = useMemo(
    () =>
      matches
        .filter(isUpcoming)
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
        .slice(0, 8),
    [matches]
  );

  const ranking = useMemo(() => {
    if (!ratings) return [];
    const teams = new Map<number, Team>();
    for (const m of matches) {
      teams.set(m.homeTeam.id, m.homeTeam);
      teams.set(m.awayTeam.id, m.awayTeam);
    }
    return [...ratings.attack.keys()]
      .map((id) => {
        const attack = ratings.attack.get(id)!;
        const defence = ratings.defence.get(id)!;
        return { team: teams.get(id)!, attack, defence, strength: attack / defence, form: recentForm(matches, id) };
      })
      .filter((r) => r.team)
      .sort((a, b) => b.strength - a.strength);
  }, [ratings, matches]);

  const played = matches.filter(isFinished).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentGreen} colors={[Colors.accentGreen]} />}
      >
        <ScreenHeader title="Predictions" subtitle="A goals model, refit after every result" />
        <LinearGradient colors={[Colors.accentGreen + '18', Colors.bg]} style={styles.accentStrip} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <LeagueSelector selectedId={league.id} onSelect={setLeague} />

        {loading && !data ? (
          <LoadingSpinner label="Fitting the model..." />
        ) : error && !data ? (
          <View style={styles.section}>
            <ErrorState message={error} code={errorCode} onRetry={refetch} />
          </View>
        ) : !ratings ? (
          <EmptyState icon="📊" title="Not enough results yet" subtitle="The model needs a few rounds of this season's results before it predicts." />
        ) : (
          <>
            <View style={styles.section}>
              <Card gradient gradientColors={[Colors.accentGreen + '14', Colors.bgCard]} style={styles.recordCard}>
                <Text style={styles.recordLabel}>Model record this season</Text>
                {record ? (
                  <>
                    <View style={styles.recordRow}>
                      <View style={styles.recordCol}>
                        <Text style={styles.recordBig}>{pct(record.accuracy)}</Text>
                        <Text style={styles.recordSub}>results called</Text>
                      </View>
                      <View style={styles.recordCol}>
                        <Text style={styles.recordMid}>{pct(record.homeBaselineAccuracy)}</Text>
                        <Text style={styles.recordSub}>always picking home</Text>
                      </View>
                      <View style={styles.recordCol}>
                        <Text style={styles.recordMid}>{record.brier.toFixed(3)}</Text>
                        <Text style={styles.recordSub}>Brier score</Text>
                      </View>
                    </View>
                    <Text style={styles.recordNote}>
                      {record.n} matches, each predicted only from results before its kick-off. Brier measures the
                      probabilities themselves (lower is better): forecasting every match with the season's home/draw/away
                      rates scores {record.rateBaselineBrier.toFixed(3)}.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.recordNote}>
                    Fitted on {played} results. A fair test needs at least 30 earlier matches to predict from, so the record
                    appears in a few more rounds.
                  </Text>
                )}
              </Card>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Next fixtures</Text>
              {fixtures.length === 0 ? (
                <EmptyState icon="📅" title="No fixtures scheduled" />
              ) : (
                fixtures.map((m) => {
                  const p = predict(ratings, m.homeTeam.id, m.awayTeam.id);
                  return (
                    <View key={m.id}>
                      <FixtureCard match={m} prediction={p} />
                      <Text style={styles.xg}>
                        Expected goals {p.xgHome.toFixed(1)} – {p.xgAway.toFixed(1)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Strength ranking</Text>
              <Text style={styles.method}>Attack: goals scored vs an average side · Defence: goals conceded (lower is better)</Text>
              <Card noPadding>
                {ranking.map((r, i) => (
                  <View key={r.team.id} style={[styles.rankRow, i % 2 === 0 && styles.rankAlt]}>
                    <Text style={styles.rankNum}>{i + 1}</Text>
                    {r.team.crest ? <Image source={{ uri: r.team.crest }} style={styles.crest} resizeMode="contain" /> : <View style={styles.crest} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankTeam} numberOfLines={1}>{r.team.shortName ?? r.team.name}</Text>
                      <View style={styles.pips}>{r.form.map((f, j) => <Pip key={j} r={f} />)}</View>
                    </View>
                    <View style={styles.rateCol}>
                      <Text style={[styles.rate, { color: r.attack >= 1 ? Colors.win : Colors.loss }]}>{signed(r.attack - 1)}</Text>
                      <Text style={styles.rateLabel}>attack</Text>
                    </View>
                    <View style={styles.rateCol}>
                      <Text style={[styles.rate, { color: r.defence <= 1 ? Colors.win : Colors.loss }]}>{signed(r.defence - 1)}</Text>
                      <Text style={styles.rateLabel}>conceded</Text>
                    </View>
                  </View>
                ))}
              </Card>
              <Text style={styles.methodFoot}>
                Poisson goals model (Maher, 1982): each side's expected goals = league average × its attack × the opponent's
                defence, with home advantage from this season's results. Fitted by maximum likelihood on {ratings.games} results,
                shrunk toward average early in the season.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  accentStrip: { height: 6, marginHorizontal: Spacing.base, borderRadius: Radius.full, marginBottom: Spacing.sm },
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.lg, gap: Spacing.sm },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, letterSpacing: Typography.tight },

  recordCard: { gap: Spacing.md },
  recordLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: Typography.semibold },
  recordRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  recordCol: { flex: 1 },
  recordBig: { fontSize: Typography.xxl, fontWeight: Typography.black, color: Colors.accentGreen },
  recordMid: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  recordSub: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  recordNote: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  xg: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', marginTop: -4, marginBottom: Spacing.sm },
  method: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: -4 },
  methodFoot: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17, marginTop: Spacing.xs },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 9, paddingHorizontal: Spacing.md },
  rankAlt: { backgroundColor: Colors.bgElevated + '50' },
  rankNum: { width: 20, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  crest: { width: 22, height: 22 },
  rankTeam: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  pips: { flexDirection: 'row', gap: 3, marginTop: 3 },
  pip: { width: 6, height: 6, borderRadius: 3 },
  rateCol: { width: 64, alignItems: 'flex-end' },
  rate: { fontSize: Typography.sm, fontWeight: Typography.bold },
  rateLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
});
