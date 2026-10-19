import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { LeagueSelector } from '../../components/LeagueSelector';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { PlayerCardModal, getTier, Tier } from '../../components/PlayerCardModal';
import { useApi } from '../../hooks/useApi';
import { fetchScorers } from '../../services/api';
import { useLeague } from '../../context/league';
import { ErrorState } from '../../components/ErrorState';
import type { Scorer } from '../../lib/types';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export type { Scorer };

const TIER_ACCENT: Record<string, string> = {
  S: '#FFD700',
  A: '#9B61FF',
  B: '#00C2FF',
  C: '#00FF87',
};

function ScorerCard({
  scorer,
  rank,
  tier,
  onPress,
}: {
  scorer: Scorer;
  rank: number;
  tier: Tier;
  onPress: () => void;
}) {
  const tierColor = TIER_ACCENT[tier];

  const medalColor =
    rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : Colors.textMuted;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card style={[styles.scorerCard, { borderLeftColor: tierColor, borderLeftWidth: 3 }]}>
        {/* Rank */}
        <View style={[styles.rankBadge, { borderColor: medalColor + '60' }]}>
          <Text style={[styles.rankText, { color: medalColor }]}>
            {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
          </Text>
        </View>

        {/* Team crest */}
        <View style={styles.teamCrestWrap}>
          {scorer.team.crest ? (
            <Image source={{ uri: scorer.team.crest }} style={styles.teamCrest} resizeMode="contain" />
          ) : (
            <View style={[styles.teamCrest, styles.crestPlaceholder]} />
          )}
        </View>

        {/* Player info */}
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{scorer.player.name}</Text>
          <Text style={styles.teamName}>{scorer.team.name}</Text>
          <Text style={styles.nationality}>{scorer.player.nationality}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: tierColor }]}>{scorer.goals}</Text>
            <Text style={styles.statLabel}>Goals</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{scorer.assists ?? '—'}</Text>
            <Text style={styles.statLabel}>Ast</Text>
          </View>
        </View>

        {/* Tier badge + chevron */}
        <View style={styles.rightCol}>
          <View style={[styles.tierBadge, { backgroundColor: tierColor + '20', borderColor: tierColor + '50' }]}>
            <Text style={[styles.tierText, { color: tierColor }]}>{tier}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 4 }} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export default function PlayersScreen() {
  const { league: selectedLeague, setLeague: setSelectedLeague } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ scorer: Scorer; tier: Tier } | null>(null);

  const { data, loading, error, errorCode, refetch } = useApi(
    (force) => fetchScorers(selectedLeague.id, force),
    [selectedLeague.id]
  );

  // Sort by composite score: (goals × 2) + (assists × 1.5), then assign tiers by rank.
  const rankedScorers: { scorer: Scorer; rank: number; tier: Tier }[] = (
    data?.scorers ?? []
  )
    .slice()
    .sort((a, b) => {
      const scoreA = a.goals * 2 + (a.assists ?? 0) * 1.5;
      const scoreB = b.goals * 2 + (b.assists ?? 0) * 1.5;
      return scoreB - scoreA;
    })
    .map((scorer, i) => {
      const rank = i + 1;
      return { scorer, rank, tier: getTier(rank) };
    });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setSelectedEntry(null);
    setRefreshing(false);
  };

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
        <ScreenHeader title="Players" subtitle="Tap a player for their card" />

        <LinearGradient
          colors={[Colors.accentBlue + '18', Colors.bg]}
          style={styles.accentStrip}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        <LeagueSelector selectedId={selectedLeague.id} onSelect={setSelectedLeague} />

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Top Scorers</Text>
            <Text style={styles.leagueLabel}>
              {selectedLeague.flag} {selectedLeague.name}
            </Text>
          </View>

          <Text style={styles.method}>Ranked by goals × 2 + assists × 1.5 · tiers by rank</Text>
          {loading && !data ? (
            <LoadingSpinner label="Loading scorers..." />
          ) : error && !data ? (
            <ErrorState message={error} code={errorCode} onRetry={refetch} />
          ) : rankedScorers.length === 0 ? (
            <EmptyState icon="🏆" title="No scorer data" subtitle="Season data may not be available yet." />
          ) : (
            rankedScorers.map(({ scorer, rank, tier }) => (
              <ScorerCard
                key={scorer.player.id}
                scorer={scorer}
                rank={rank}
                tier={tier}
                onPress={() => setSelectedEntry({ scorer, tier })}
              />
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <PlayerCardModal
        visible={selectedEntry !== null}
        onClose={() => setSelectedEntry(null)}
        tier={selectedEntry?.tier ?? 'C'}
        scorer={selectedEntry?.scorer ?? null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  method: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: -4, marginBottom: Spacing.xs },
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  accentStrip: {
    height: 6,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  section: {
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.base,
    gap: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: Typography.tight,
  },
  leagueLabel: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  scorerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  teamCrestWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCrest: { width: 32, height: 32 },
  crestPlaceholder: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
  },
  playerInfo: { flex: 1, gap: 2 },
  playerName: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  teamName: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  nationality: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    letterSpacing: Typography.wide,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 28,
  },
  statValue: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.accentGreen,
  },
  statLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  rightCol: {
    alignItems: 'center',
    gap: 2,
  },
  tierBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierText: {
    fontSize: Typography.sm,
    fontWeight: Typography.black,
    letterSpacing: 0.5,
  },
});
