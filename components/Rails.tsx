/**
 * What goes in the right rail on wide screens (docs/desktop/DESIGN.md §3): the league table and the
 * title race from the season simulation, in a card. Screens render these only when
 * useBreakpoint().desktop is true, so a phone never runs the simulation for them.
 */
import React, { useEffect, useState } from 'react';
import { InteractionManager, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { color, font, radius, space, type } from '../constants/design';
import { zone, Zone } from '../lib/football';
import type { Ratings } from '../lib/model';
import { Projection, simulate } from '../lib/season';
import type { ClubColors } from '../lib/colors';
import type { Match, StandingRow } from '../lib/types';
import { hover } from './layout';
import { clubTone, KitStripe, MiniBar, pctText, Skeleton, teamName } from './ui';

const ZONE: Record<Exclude<Zone, null>, string> = { top: color.accentText, europe: color.text2, playoff: color.text3, relegation: color.loss };
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const openClub = (id: number, c: number) => router.push({ pathname: '/club/[id]', params: { id: String(id), c: String(c) } });

/** A card on `surface` with an overline title and an optional link on the right. */
export function RailCard({ title, action, children, style, flush }: { title?: string; action?: { label: string; onPress: () => void }; children: React.ReactNode; style?: StyleProp<ViewStyle>; /** no side padding: rows run edge to edge */ flush?: boolean }) {
  return (
    <View style={[styles.card, flush && { paddingHorizontal: 0 }, style]}>
      {title ? (
        <View style={[styles.head, flush && { paddingHorizontal: 16 }]}>
          <Text style={type.overline} accessibilityRole="header">{title}</Text>
          {action ? (
            <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="link" style={styles.action}>
              <Text style={styles.actionText}>{action.label}</Text>
              <Ionicons name="chevron-forward" size={13} color={color.accentText} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** The season simulated 2,000 times after the screen has settled; null until it has run. Skipped while `on` is false. */
export function useProjection(table: StandingRow[], matches: Match[], ratings: Ratings | null, competitionId: number, on = true): Map<number, Projection> | null {
  const [p, setP] = useState<Map<number, Projection> | null>(null);
  useEffect(() => {
    setP(null);
    if (!on || !ratings || !table.length) return;
    const task = InteractionManager.runAfterInteractions(() => setP(simulate(table, matches, ratings, competitionId, { runs: 2000 })));
    return () => task.cancel();
  }, [on, table, matches, ratings, competitionId]);
  return p;
}

/** The whole table in 30 px rows: position, club, played, goal difference, points. `mark` highlights clubs (the two in a match, the ones you follow). */
export function MiniTable({ table, competitionId, colors, mark, limit }: { table: StandingRow[]; competitionId: number; colors: Map<number, ClubColors>; mark?: Set<number>; limit?: number }) {
  const n = table.length;
  const rows = limit ? table.slice(0, limit) : table;
  return (
    <View>
      <View style={[styles.trow, styles.thead]}>
        <Text style={[styles.th, { width: 22 }]}>#</Text>
        <Text style={[styles.th, { flex: 1, paddingLeft: 12 }]}>Club</Text>
        <Text style={[styles.th, styles.num]}>P</Text>
        <Text style={[styles.th, styles.num]}>GD</Text>
        <Text style={[styles.th, styles.num]}>Pts</Text>
      </View>
      {rows.map((r) => {
        const z = zone(competitionId, r.position, n);
        const on = mark?.has(r.team.id);
        return (
          <Pressable key={r.team.id} onPress={() => openClub(r.team.id, competitionId)} accessibilityRole="button" accessibilityLabel={`${r.position}, ${r.team.name}, ${r.points} points. Open club`} {...hover('row')}>
            <View style={[styles.trow, styles.tr, on && styles.marked]}>
              <View style={[styles.zone, z && { backgroundColor: ZONE[z] }]} />
              <Text style={styles.pos}>{r.position}</Text>
              <KitStripe colors={colors.get(r.team.id)} height={16} width={3} />
              <Text style={[styles.name, on && { fontFamily: font.bold }]} numberOfLines={1}>{teamName(r.team)}</Text>
              <Text style={[styles.cell, styles.num]}>{r.playedGames}</Text>
              <Text style={[styles.cell, styles.num]}>{signed(r.goalDifference)}</Text>
              <Text style={[styles.cell, styles.num, styles.pts]}>{r.points}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Who wins the league: the clubs with a real title chance (at least 1%, at most `limit`), as bars in their kits. */
export function TitleRace({ projection, table, competitionId, colors, limit = 5 }: { projection: Map<number, Projection> | null; table: StandingRow[]; competitionId: number; colors: Map<number, ClubColors>; limit?: number }) {
  if (!projection) return <Skeleton rows={4} height={26} gap={8} style={{ paddingHorizontal: 16 }} />;
  const rows = table
    .map((r) => ({ r, p: projection.get(r.team.id)?.title ?? 0 }))
    .sort((a, b) => b.p - a.p)
    .filter((x, i) => i < 2 || x.p >= 0.01)
    .slice(0, limit);
  return (
    <View>
      {rows.map(({ r, p }) => (
        <Pressable key={r.team.id} onPress={() => openClub(r.team.id, competitionId)} accessibilityRole="button" accessibilityLabel={`${r.team.name}: ${pctText(p)} to win the title. Open club`} {...hover('row')}>
          <View style={styles.race}>
            <Text style={styles.raceName} numberOfLines={1}>{teamName(r.team)}</Text>
            <View style={{ flex: 1 }}>
              <MiniBar value={p} height={6} fill={clubTone(colors.get(r.team.id), color.surface)} />
            </View>
            <Text style={styles.racePct}>{pctText(p)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, marginBottom: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  actionText: { fontFamily: font.medium, fontSize: 13, color: color.accentText },

  trow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  thead: { height: 24, borderBottomWidth: 1, borderBottomColor: color.hairline },
  th: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.3, color: color.text3 },
  tr: { height: 30 },
  marked: { backgroundColor: 'rgba(246,241,230,0.08)' },
  zone: { position: 'absolute', left: 5, width: 3, height: 16, borderRadius: 2 },
  pos: { width: 22, fontFamily: font.cardBold, fontSize: 13, color: color.text2, fontVariant: ['tabular-nums'] },
  name: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 13.5, color: color.text },
  cell: { fontFamily: font.regular, fontSize: 13, color: color.text2, fontVariant: ['tabular-nums'] },
  num: { width: 28, textAlign: 'right' },
  pts: { fontFamily: font.cardHeavy, fontSize: 14, color: color.text },

  race: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 30, paddingHorizontal: 16 },
  raceName: { width: 112, fontFamily: font.medium, fontSize: 13.5, color: color.text },
  racePct: { width: 38, textAlign: 'right', fontFamily: font.semibold, fontSize: 13.5, color: color.text, fontVariant: ['tabular-nums'] },
});
