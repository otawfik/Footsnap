/**
 * Squads: every club in the selected competition, with its coach, squad size,
 * average age and share of overseas players, and the squad grouped by line.
 * The search box finds a player across the whole league.
 *
 * This tab used to be "Transfers" with rumour tags; football-data.org has no
 * transfer data, so it now shows only what the API actually returns.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { LeagueSelector } from '../../components/LeagueSelector';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useApi } from '../../hooks/useApi';
import { useLeague } from '../../context/league';
import { fetchTeams } from '../../services/api';
import { age, byLine, LINES, squadStats } from '../../lib/football';
import type { SquadPlayer, TeamDetail } from '../../lib/types';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const LINE_NAMES = { GK: 'Goalkeepers', DF: 'Defenders', MF: 'Midfielders', FW: 'Forwards', Other: 'Squad' } as const;
const LINE_COLORS = { GK: Colors.draw, DF: Colors.accentBlue, MF: Colors.accentGreen, FW: Colors.loss, Other: Colors.textMuted } as const;
// league country, used for "overseas" share; null for the Champions League
const HOME_NATION: Record<number, string | undefined> = { 2021: 'England', 2014: 'Spain', 2002: 'Germany', 2019: 'Italy', 2015: 'France' };

function PlayerRow({ p, lineKey }: { p: SquadPlayer; lineKey: keyof typeof LINE_COLORS }) {
  const years = age(p.dateOfBirth);
  return (
    <View style={styles.playerRow}>
      <View style={[styles.lineBadge, { borderColor: LINE_COLORS[lineKey] + '60' }]}>
        <Text style={[styles.lineText, { color: LINE_COLORS[lineKey] }]}>{lineKey === 'Other' ? '—' : lineKey}</Text>
      </View>
      <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
      <Text style={styles.playerMeta} numberOfLines={1}>
        {[years !== null ? `${years}` : null, p.nationality].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TeamCard({ team, homeNation, startOpen }: { team: TeamDetail; homeNation?: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const squad = team.squad ?? [];
  const stats = squadStats(squad, homeNation);
  const groups = byLine(squad);

  return (
    <Card style={styles.teamCard} noPadding>
      <TouchableOpacity
        style={styles.teamHeader}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${team.name}, ${stats.size} players`}
      >
        {team.crest ? (
          <Image source={{ uri: team.crest }} style={styles.crest} resizeMode="contain" />
        ) : (
          <View style={[styles.crest, styles.crestPlaceholder]} />
        )}
        <View style={styles.teamMeta}>
          <Text style={styles.teamName} numberOfLines={1}>{team.shortName ?? team.name}</Text>
          <Text style={styles.teamSub} numberOfLines={1}>
            {[team.coach?.name ? `Coach ${team.coach.name}` : null, team.venue].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <Stat value={String(stats.size)} label="Players" />
        <Stat value={stats.avgAge !== null ? stats.avgAge.toFixed(1) : '—'} label="Avg age" />
        {stats.foreign !== null ? <Stat value={`${Math.round(stats.foreign * 100)}%`} label="Overseas" /> : null}
        {team.founded ? <Stat value={String(team.founded)} label="Founded" /> : null}
      </View>

      {open &&
        (squad.length === 0 ? (
          <Text style={styles.noSquad}>No squad list published for this club yet.</Text>
        ) : (
          <View style={styles.squad}>
            {([...LINES, 'Other'] as const).map((k) =>
              groups[k].length ? (
                <View key={k} style={styles.group}>
                  <Text style={styles.groupTitle}>{LINE_NAMES[k]} · {groups[k].length}</Text>
                  {groups[k].map((p) => <PlayerRow key={p.id} p={p} lineKey={k} />)}
                </View>
              ) : null
            )}
          </View>
        ))}
    </Card>
  );
}

export default function SquadsScreen() {
  const { league, setLeague } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const { data, loading, error, errorCode, refetch } = useApi((force) => fetchTeams(league.id, force), [league.id]);

  const teams = useMemo(
    () => (data?.teams ?? []).slice().sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name)),
    [data]
  );

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    const out: { p: SquadPlayer; team: TeamDetail }[] = [];
    for (const team of teams) for (const p of team.squad ?? []) if (p.name.toLowerCase().includes(q)) out.push({ p, team });
    return out.slice(0, 30);
  }, [q, teams]);

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
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentGreen} colors={[Colors.accentGreen]} />}
      >
        <ScreenHeader title="Squads" subtitle="Coaches, ages and full rosters" />
        <LinearGradient colors={[Colors.accentPurple + '18', Colors.bg]} style={styles.accentStrip} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <LeagueSelector selectedId={league.id} onSelect={setLeague} />

        <View style={styles.section}>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Find a player in the ${league.name}`}
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Find a player"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {loading && !data ? (
            <LoadingSpinner label="Loading squads..." />
          ) : error && !data ? (
            <ErrorState message={error} code={errorCode} onRetry={refetch} />
          ) : q.length >= 2 ? (
            matches.length === 0 ? (
              <EmptyState icon="🔎" title="No players found" subtitle={`Nobody matching "${query.trim()}" in the ${league.name}.`} />
            ) : (
              <Card noPadding>
                {matches.map(({ p, team }) => (
                  <View key={`${team.id}-${p.id}`} style={styles.resultRow}>
                    {team.crest ? <Image source={{ uri: team.crest }} style={styles.resultCrest} resizeMode="contain" /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>{p.name}</Text>
                      <Text style={styles.resultMeta}>
                        {[team.shortName ?? team.name, p.position, age(p.dateOfBirth) !== null ? `${age(p.dateOfBirth)}` : null, p.nationality]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )
          ) : teams.length === 0 ? (
            <EmptyState icon="👥" title="No squads available" />
          ) : (
            teams.map((t, i) => <TeamCard key={t.id} team={t} homeNation={HOME_NATION[league.id]} startOpen={i === 0} />)
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  accentStrip: { height: 6, marginHorizontal: Spacing.base, borderRadius: Radius.full, marginBottom: Spacing.sm },
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.md, gap: Spacing.sm },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.base, paddingVertical: 10 },

  teamCard: { marginBottom: Spacing.xs, overflow: 'hidden' },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  crest: { width: 38, height: 38 },
  crestPlaceholder: { backgroundColor: Colors.bgElevated, borderRadius: Radius.sm },
  teamMeta: { flex: 1, gap: 2 },
  teamName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  teamSub: { fontSize: Typography.xs, color: Colors.textMuted },

  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.lg },
  stat: { gap: 1 },
  statValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

  squad: { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: Spacing.sm },
  group: { paddingTop: Spacing.sm },
  groupTitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.base,
    marginBottom: 2,
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: 7 },
  lineBadge: { width: 30, alignItems: 'center', borderWidth: 1, borderRadius: Radius.sm, paddingVertical: 1 },
  lineText: { fontSize: 10, fontWeight: Typography.bold, letterSpacing: 0.5 },
  playerName: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  playerMeta: { fontSize: Typography.xs, color: Colors.textMuted, maxWidth: 150, textAlign: 'right' },
  noSquad: { fontSize: Typography.sm, color: Colors.textMuted, padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.border },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultCrest: { width: 24, height: 24 },
  resultMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
});
