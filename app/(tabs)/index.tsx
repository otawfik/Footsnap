import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { LeagueSelector } from '../../components/LeagueSelector';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { useApi } from '../../hooks/useApi';
import { fetchLiveMatches, fetchStandings, fetchLeagueMatches } from '../../services/api';
import { LEAGUES, League } from '../../constants/leagues';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

// ---------------------------------------------------------------------------
// Types (minimal subset of football-data.org response shapes)
// ---------------------------------------------------------------------------

interface Team {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

interface Score {
  home: number | null;
  away: number | null;
}

interface Match {
  id: number;
  status: string;
  utcDate: string;
  homeTeam: Team;
  awayTeam: Team;
  score: { fullTime: Score; halfTime: Score };
  competition: { id: number; name: string };
  minute?: number;
}

interface StandingEntry {
  position: number;
  team: Team;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalDifference: number;
  form: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MatchCard({ match }: { match: Match }) {
  const isLive =
    match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const isFinished = match.status === 'FINISHED';
  const scoreHome = match.score?.fullTime?.home;
  const scoreAway = match.score?.fullTime?.away;

  const timeLabel = isLive
    ? 'LIVE'
    : isFinished
    ? 'FT'
    : new Date(match.utcDate).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <Card style={styles.matchCard}>
      {/* Time / Status pill */}
      <View style={styles.matchTop}>
        {isLive ? (
          <StatusBadge variant="live" />
        ) : isFinished ? (
          <StatusBadge variant="finished" label="FT" />
        ) : (
          <StatusBadge variant="scheduled" label={timeLabel} />
        )}
        <Text style={styles.competitionLabel}>
          {match.competition?.name ?? ''}
        </Text>
      </View>

      {/* Teams + Score */}
      <View style={styles.matchBody}>
        {/* Home */}
        <View style={styles.teamCol}>
          {match.homeTeam.crest ? (
            <Image
              source={{ uri: match.homeTeam.crest }}
              style={styles.crest}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.crestPlaceholder} />
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.homeTeam.tla ?? match.homeTeam.shortName ?? match.homeTeam.name}
          </Text>
        </View>

        {/* Score */}
        <View style={styles.scoreCol}>
          {scoreHome !== null && scoreAway !== null ? (
            <Text style={[styles.score, isLive && styles.scoreLive]}>
              {scoreHome} — {scoreAway}
            </Text>
          ) : (
            <Text style={styles.scoreVs}>vs</Text>
          )}
        </View>

        {/* Away */}
        <View style={styles.teamCol}>
          {match.awayTeam.crest ? (
            <Image
              source={{ uri: match.awayTeam.crest }}
              style={styles.crest}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.crestPlaceholder} />
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.awayTeam.tla ?? match.awayTeam.shortName ?? match.awayTeam.name}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function FormDot({ result }: { result: string }) {
  const color =
    result === 'W'
      ? Colors.win
      : result === 'L'
      ? Colors.loss
      : Colors.draw;
  return <View style={[styles.formDot, { backgroundColor: color }]} />;
}

function StandingRow({
  entry,
  index,
}: {
  entry: StandingEntry;
  index: number;
}) {
  const form = (entry.form ?? '').split(',').join('').split('').slice(-5);
  const isTop4 = entry.position <= 4;
  const isRelegation = entry.position >= 18;

  return (
    <View style={[styles.standingRow, index % 2 === 0 && styles.standingRowAlt]}>
      <View style={styles.standingPos}>
        <View
          style={[
            styles.posIndicator,
            isTop4 && styles.posChampions,
            isRelegation && styles.posRelegation,
          ]}
        />
        <Text style={styles.standingPosText}>{entry.position}</Text>
      </View>

      {entry.team.crest ? (
        <Image
          source={{ uri: entry.team.crest }}
          style={styles.crestSmall}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.crestSmall} />
      )}

      <Text style={styles.standingTeam} numberOfLines={1}>
        {entry.team.shortName ?? entry.team.name}
      </Text>

      <Text style={styles.standingStat}>{entry.playedGames}</Text>
      <Text style={styles.standingStat}>{entry.won}</Text>
      <Text style={styles.standingStat}>{entry.draw}</Text>
      <Text style={styles.standingStat}>{entry.lost}</Text>
      <Text style={[styles.standingStat, styles.standingPoints]}>
        {entry.points}
      </Text>

      <View style={styles.formRow}>
        {form.map((r, i) => (
          <FormDot key={i} result={r} />
        ))}
      </View>
    </View>
  );
}

function UpcomingFixtureCard({ match }: { match: Match }) {
  const date = new Date(match.utcDate);

  // Day label: "Today", "Tomorrow", or "Mon 17 Mar"
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const dayLabel = isToday
    ? 'Today'
    : isTomorrow
    ? 'Tomorrow'
    : date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <Card style={styles.upcomingCard}>
      {/* Date / time row */}
      <View style={styles.upcomingHeader}>
        <View style={styles.upcomingDatePill}>
          <Text style={styles.upcomingDayText}>{dayLabel}</Text>
          <Text style={styles.upcomingTimeText}>{timeLabel}</Text>
        </View>
        <View style={styles.upcomingRound}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.upcomingRoundText}>
            {match.competition?.name ?? ''}
          </Text>
        </View>
      </View>

      {/* Teams row */}
      <View style={styles.upcomingTeams}>
        {/* Home */}
        <View style={styles.upcomingTeamCol}>
          {match.homeTeam.crest ? (
            <Image source={{ uri: match.homeTeam.crest }} style={styles.upcomingCrest} resizeMode="contain" />
          ) : (
            <View style={[styles.upcomingCrest, styles.crestPlaceholder]} />
          )}
          <Text style={styles.upcomingTeamName} numberOfLines={2}>
            {match.homeTeam.shortName ?? match.homeTeam.name}
          </Text>
        </View>

        {/* VS divider */}
        <View style={styles.upcomingVsCol}>
          <Text style={styles.upcomingVs}>VS</Text>
          <View style={styles.upcomingVsLine} />
        </View>

        {/* Away */}
        <View style={styles.upcomingTeamCol}>
          {match.awayTeam.crest ? (
            <Image source={{ uri: match.awayTeam.crest }} style={styles.upcomingCrest} resizeMode="contain" />
          ) : (
            <View style={[styles.upcomingCrest, styles.crestPlaceholder]} />
          )}
          <Text style={styles.upcomingTeamName} numberOfLines={2}>
            {match.awayTeam.shortName ?? match.awayTeam.name}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const [selectedLeague, setSelectedLeague] = useState<League>(LEAGUES[0]);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: liveData,
    loading: liveLoading,
    refetch: refetchLive,
  } = useApi(() => fetchLiveMatches(), []);

  const {
    data: standingsData,
    loading: standingsLoading,
    refetch: refetchStandings,
  } = useApi(() => fetchStandings(selectedLeague.id), [selectedLeague.id]);

  const {
    data: upcomingData,
    loading: upcomingLoading,
    refetch: refetchUpcoming,
  } = useApi(
    () => fetchLeagueMatches(selectedLeague.id, { status: 'SCHEDULED,TIMED' }),
    [selectedLeague.id]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLive(), refetchStandings(), refetchUpcoming()]);
    setRefreshing(false);
  }, [refetchLive, refetchStandings, refetchUpcoming]);

  const liveMatches: Match[] =
    (liveData as any)?.matches?.filter(
      (m: Match) => m.competition?.id === selectedLeague.id
    ) ?? [];

  const standingTable: StandingEntry[] =
    (standingsData as any)?.standings?.[0]?.table ?? [];

  // First 5 upcoming fixtures sorted by date ascending
  const upcomingMatches: Match[] = ((upcomingData as any)?.matches ?? [] as Match[])
    .slice()
    .sort((a: Match, b: Match) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    .slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentGreen}
            colors={[Colors.accentGreen]}
          />
        }
      >
        {/* Header */}
        <ScreenHeader
          title="FootSnap"
          subtitle="Live · Standings · Insights"
          right={
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          }
        />

        {/* Hero gradient strip */}
        <LinearGradient
          colors={[Colors.accentGreen + '18', Colors.bg]}
          style={styles.heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        {/* League selector */}
        <LeagueSelector
          selectedId={selectedLeague.id}
          onSelect={setSelectedLeague}
        />

        {/* Live Fixtures */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Fixtures</Text>
          {liveLoading ? (
            <LoadingSpinner label="Loading matches..." />
          ) : liveMatches.length === 0 ? (
            <EmptyState
              icon="🕐"
              title="No live matches"
              subtitle="Check back when your league is in action."
            />
          ) : (
            liveMatches.map((m) => <MatchCard key={m.id} match={m} />)
          )}
        </View>

        {/* Standings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Standings</Text>
          <Card noPadding>
            {/* Table header */}
            <View style={[styles.standingRow, styles.standingHeader]}>
              <Text style={[styles.standingHeaderText, { width: 32 }]}>#</Text>
              <View style={{ width: 22 }} />
              <Text style={[styles.standingHeaderText, { flex: 1 }]}>Club</Text>
              {['P', 'W', 'D', 'L', 'Pts'].map((h) => (
                <Text key={h} style={styles.standingHeaderStat}>
                  {h}
                </Text>
              ))}
              <Text style={styles.standingHeaderForm}>Form</Text>
            </View>

            {standingsLoading ? (
              <LoadingSpinner label="Loading standings..." />
            ) : standingTable.length === 0 ? (
              <EmptyState title="No standings available" />
            ) : (
              standingTable.map((entry, i) => (
                <StandingRow key={entry.team.id} entry={entry} index={i} />
              ))
            )}
          </Card>
        </View>

        {/* Upcoming Fixtures */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Fixtures</Text>
          {upcomingLoading ? (
            <LoadingSpinner label="Loading fixtures..." />
          ) : upcomingMatches.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No upcoming fixtures"
              subtitle="Check back closer to the next matchday."
            />
          ) : (
            upcomingMatches.map((m) => <UpcomingFixtureCard key={m.id} match={m} />)
          )}
        </View>

        {/* Bottom padding for tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, backgroundColor: Colors.bg },

  heroGradient: {
    height: 6,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },

  // Live indicator
  liveIndicator: {
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
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.loss,
  },
  liveText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.loss,
    letterSpacing: Typography.wide,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: Typography.tight,
    marginBottom: Spacing.xs,
  },

  // Match card
  matchCard: {
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  matchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  competitionLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    letterSpacing: Typography.wide,
    textTransform: 'uppercase',
  },
  matchBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  crest: {
    width: 36,
    height: 36,
  },
  crestPlaceholder: {
    width: 36,
    height: 36,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
  },
  teamName: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.semibold,
    textAlign: 'center',
  },
  scoreCol: {
    flex: 0.8,
    alignItems: 'center',
  },
  score: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    letterSpacing: Typography.tight,
  },
  scoreLive: {
    color: Colors.accentGreen,
  },
  scoreVs: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
  },

  // Standings
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  standingRowAlt: {
    backgroundColor: Colors.bgElevated + '50',
  },
  standingHeader: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
  },
  standingHeaderText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
    letterSpacing: Typography.wide,
    textTransform: 'uppercase',
  },
  standingHeaderStat: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
    width: 28,
    textAlign: 'center',
  },
  standingHeaderForm: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
    width: 70,
    textAlign: 'right',
  },
  standingPos: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 32,
    gap: 4,
  },
  posIndicator: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  posChampions: {
    backgroundColor: Colors.accentBlue,
  },
  posRelegation: {
    backgroundColor: Colors.loss,
  },
  standingPosText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  crestSmall: {
    width: 22,
    height: 22,
    marginRight: Spacing.sm,
  },
  standingTeam: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.medium,
  },
  standingStat: {
    width: 28,
    textAlign: 'center',
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  standingPoints: {
    color: Colors.textPrimary,
    fontWeight: Typography.bold,
  },
  formRow: {
    flexDirection: 'row',
    gap: 3,
    width: 70,
    justifyContent: 'flex-end',
  },
  formDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Upcoming fixture card
  upcomingCard: {
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upcomingDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accentBlue + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.accentBlue + '35',
  },
  upcomingDayText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.accentBlue,
    letterSpacing: 0.3,
  },
  upcomingTimeText: {
    fontSize: Typography.xs,
    color: Colors.accentBlue + 'CC',
    fontWeight: Typography.medium,
  },
  upcomingRound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upcomingRoundText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
  upcomingTeams: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upcomingTeamCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  upcomingCrest: {
    width: 44,
    height: 44,
  },
  upcomingTeamName: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 18,
  },
  upcomingVsCol: {
    width: 48,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  upcomingVs: {
    fontSize: Typography.xs,
    fontWeight: Typography.black,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  upcomingVsLine: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
  },
});
