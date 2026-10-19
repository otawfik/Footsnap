import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import type { Match, Team } from '../lib/types';
import type { Prediction } from '../lib/model';
import { isLive } from '../lib/football';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

const teamLabel = (t: Team) => t.shortName ?? t.name;

function Crest({ team, size }: { team: Team; size: number }) {
  return team.crest ? (
    <Image source={{ uri: team.crest }} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={`${team.name} crest`} />
  ) : (
    <View style={[styles.crestPlaceholder, { width: size, height: size }]} />
  );
}

export function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A live or finished match: score front and centre. */
export function ScoreCard({ match }: { match: Match }) {
  const live = isLive(match);
  const { home, away } = match.score.fullTime;
  const status =
    match.status === 'PAUSED' ? 'HT' : match.status === 'EXTRA_TIME' ? 'ET' : match.status === 'PENALTY_SHOOTOUT' ? 'PENS' : null;
  const winner = match.score.winner;

  return (
    <Card style={[styles.card, live && styles.cardLive]}>
      <View style={styles.top}>
        {live ? <StatusBadge variant="live" label={status ? `● ${status}` : undefined} /> : <StatusBadge variant="finished" label="FT" />}
        <Text style={styles.when}>{live ? 'Updating every 30s' : dayLabel(match.utcDate)}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.side}>
          <Crest team={match.homeTeam} size={34} />
          <Text style={[styles.team, winner === 'AWAY_TEAM' && styles.loser]} numberOfLines={1}>
            {teamLabel(match.homeTeam)}
          </Text>
        </View>
        <Text style={[styles.score, live && styles.scoreLive]} accessibilityLabel={`${home ?? 0} to ${away ?? 0}`}>
          {home ?? 0} – {away ?? 0}
        </Text>
        <View style={styles.side}>
          <Crest team={match.awayTeam} size={34} />
          <Text style={[styles.team, winner === 'HOME_TEAM' && styles.loser]} numberOfLines={1}>
            {teamLabel(match.awayTeam)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Home / draw / away probabilities as one split bar. */
export function ProbabilityBar({ p }: { p: Prediction }) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <View accessible accessibilityLabel={`Model: home ${pct(p.home)}, draw ${pct(p.draw)}, away ${pct(p.away)}`}>
      <View style={styles.bar}>
        <View style={{ flex: p.home, backgroundColor: Colors.accentGreen }} />
        <View style={{ flex: p.draw, backgroundColor: Colors.textMuted }} />
        <View style={{ flex: p.away, backgroundColor: Colors.accentBlue }} />
      </View>
      <View style={styles.barLabels}>
        <Text style={[styles.barText, { color: Colors.accentGreen }]}>{pct(p.home)}</Text>
        <Text style={styles.barText}>Draw {pct(p.draw)}</Text>
        <Text style={[styles.barText, { color: Colors.accentBlue }]}>{pct(p.away)}</Text>
      </View>
    </View>
  );
}

/** A fixture still to play, with the model's call when there's enough data. */
export function FixtureCard({ match, prediction }: { match: Match; prediction?: Prediction | null }) {
  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.datePill}>
          <Text style={styles.dateDay}>{dayLabel(match.utcDate)}</Text>
          <Text style={styles.dateTime}>{clock(match.utcDate)}</Text>
        </View>
        {match.matchday ? (
          <View style={styles.matchday}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.when}>Matchday {match.matchday}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        <View style={styles.side}>
          <Crest team={match.homeTeam} size={40} />
          <Text style={styles.team} numberOfLines={2}>{teamLabel(match.homeTeam)}</Text>
        </View>
        <View style={styles.vsCol}>
          {prediction ? (
            <>
              <Text style={styles.likely}>{prediction.score[0]}–{prediction.score[1]}</Text>
              <Text style={styles.likelyLabel}>most likely</Text>
            </>
          ) : (
            <Text style={styles.vs}>VS</Text>
          )}
        </View>
        <View style={styles.side}>
          <Crest team={match.awayTeam} size={40} />
          <Text style={styles.team} numberOfLines={2}>{teamLabel(match.awayTeam)}</Text>
        </View>
      </View>
      {prediction ? <ProbabilityBar p={prediction} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.sm, gap: Spacing.md },
  cardLive: { borderColor: Colors.loss + '55' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  when: { fontSize: Typography.xs, color: Colors.textMuted, letterSpacing: 0.2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  team: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'center' },
  loser: { color: Colors.textSecondary },
  score: {
    width: 96,
    textAlign: 'center',
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    letterSpacing: Typography.tight,
  },
  scoreLive: { color: Colors.accentGreen },
  crestPlaceholder: { backgroundColor: Colors.bgElevated, borderRadius: Radius.sm },
  datePill: {
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
  dateDay: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.accentBlue },
  dateTime: { fontSize: Typography.xs, color: Colors.accentBlue, fontWeight: Typography.medium },
  matchday: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vsCol: { width: 96, alignItems: 'center' },
  vs: { fontSize: Typography.xs, fontWeight: Typography.black, color: Colors.textMuted, letterSpacing: 2 },
  likely: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  likelyLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  bar: { flexDirection: 'row', height: 6, borderRadius: Radius.full, overflow: 'hidden', gap: 2 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  barText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
});
