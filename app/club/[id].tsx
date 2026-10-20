/**
 * A club: its colours and crest, where it has stood all season, how the model
 * rates it and where it's projected to finish, its fixtures, and its squad as cards.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions, InteractionManager, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Section, Panel, Skeleton, Form, Num } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { SnapCard } from '../../components/SnapCard';
import { FixtureCard, ResultRow } from '../../components/Match';
import { useLeague } from '../../context/league';
import { useCards, useClubColors, useSeason, useTable, useTeams } from '../../hooks/data';
import { fit, predict } from '../../lib/model';
import { isFinished, isUpcoming, recentForm } from '../../lib/football';
import { simulate, trajectory, Projection } from '../../lib/season';
import { useCollection } from '../../lib/storage';
import { lookOf } from '../../lib/collection';
import { alpha } from '../../lib/colors';
import { C, F, R, S, T } from '../../constants/theme';

const pct = (x: number) => (x >= 0.995 ? '>99%' : x > 0 && x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`);
const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

function Stat({ label, value, color = C.chalk }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Num style={{ fontFamily: F.numHeavy, fontSize: 26, color }}>{value}</Num>
      <Text style={[T.kicker, { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

export default function Club() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const { league } = useLeague();
  const season = useSeason(league);
  const teams = useTeams(league);
  const standings = useTable(league);
  const colors = useClubColors(league);
  const { list } = useCards(league);
  const [collection] = useCollection();
  const { width } = useWindowDimensions();
  const [proj, setProj] = useState<Projection | null>(null);
  const matches = season.data?.matches ?? [];
  const team = teams.data?.teams.find((t) => t.id === teamId);
  const row = standings.table.find((r) => r.team.id === teamId);
  const cc = colors.get(teamId);
  const ratings = useMemo(() => fit(matches), [matches]);
  const chartW = Math.min(width, 560) - S.base * 2 - S.md * 2 - 2;
  const owned = collection[String(league.id)] ?? {};

  useEffect(() => {
    setProj(null);
    if (!ratings || !standings.table.length) return;
    const task = InteractionManager.runAfterInteractions(() => setProj(simulate(standings.table, matches, ratings, league.id, { runs: 2000 }).get(teamId) ?? null));
    return () => task.cancel();
  }, [ratings, standings.table, matches, league.id, teamId]);

  const traj = useMemo(() => trajectory(matches, teamId), [matches, teamId]);
  const next = matches.filter((m) => isUpcoming(m) && (m.homeTeam.id === teamId || m.awayTeam.id === teamId)).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 3);
  const last = matches.filter((m) => isFinished(m) && (m.homeTeam.id === teamId || m.awayTeam.id === teamId)).sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 5);
  const squad = list.filter((c) => c.team.id === teamId);
  const attack = ratings?.attack.get(teamId);
  const defence = ratings?.defence.get(teamId);
  const name = team?.shortName ?? row?.team.shortName ?? row?.team.name ?? 'Club';

  return (
    <Screen motif={false}>
      <View style={styles.hero}>
        <LinearGradient colors={[cc?.primary ?? C.turf, alpha(cc?.primary ?? C.turf, 0.4), C.night]} style={StyleSheet.absoluteFill} />
        {team?.crest ? <Image source={{ uri: team.crest }} style={styles.watermark} resizeMode="contain" /> : null}
        <View style={styles.top}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/table'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={C.chalk} />
          </Pressable>
        </View>
        <View style={styles.heroBody}>
          {team?.crest ? <Image source={{ uri: team.crest }} style={{ width: 72, height: 72 }} resizeMode="contain" /> : null}
          <Text style={styles.name}>{name.toUpperCase()}</Text>
          <Text style={T.small}>{[team?.coach?.name ? `Coach ${team.coach.name}` : null, team?.venue].filter(Boolean).join(' · ')}</Text>
          {row ? (
            <View style={styles.heroStats}>
              <Stat label="POSITION" value={`${row.position}`} />
              <Stat label="POINTS" value={`${row.points}`} />
              <Stat label="GOAL DIFF" value={row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`} />
              <View style={{ flex: 1, alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Form results={recentForm(matches, teamId)} size={9} />
                <Text style={[T.kicker, { fontSize: 10 }]}>FORM</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {traj.length > 1 ? (
        <Section title="Season so far" note="League position after every matchday">
          <Panel style={{ padding: S.md }}>
            <LineChart width={chartW} invert yMin={1} yMax={standings.table.length || 20} series={[{ label: name, color: cc?.accent ?? C.chalk, points: traj.map((t) => ({ x: t.matchday, y: t.position })) }]} yLabel="POSITION" />
          </Panel>
        </Section>
      ) : null}

      {attack !== undefined && defence !== undefined ? (
        <Section title="How the model rates them" note="Against an average side in this competition">
          <Panel style={styles.ratings}>
            <Stat label="ATTACK" value={`${attack >= 1 ? '+' : '−'}${Math.abs(Math.round((attack - 1) * 100))}%`} color={attack >= 1 ? C.win : C.loss} />
            <Stat label="GOALS CONCEDED" value={`${defence >= 1 ? '+' : '−'}${Math.abs(Math.round((defence - 1) * 100))}%`} color={defence <= 1 ? C.win : C.loss} />
            {proj ? <Stat label={league.id === 2001 ? 'TOP 8' : 'TOP 4'} value={pct(proj.top)} /> : null}
            {proj ? <Stat label={league.id === 2001 ? 'OUT' : 'RELEGATION'} value={pct(proj.relegation)} color={proj.relegation > 0.3 ? C.loss : C.chalk} /> : null}
          </Panel>
          {proj ? <Text style={T.small}>Projected {Math.round(proj.avgPoints)} points, finishing around {ordinal(Math.round(proj.avgPosition))}. Title: {pct(proj.title)}.</Text> : null}
        </Section>
      ) : null}

      {next.length ? (
        <Section title="Next up">
          {next.map((m) => (
            <FixtureCard key={m.id} match={m} colors={colors} prediction={ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null} onPress={() => router.push({ pathname: '/match/[id]', params: { id: String(m.id) } })} />
          ))}
        </Section>
      ) : null}

      {last.length ? (
        <Section title="Results">
          <Panel>
            {last.map((m, i) => (
              <Pressable key={m.id} onPress={() => router.push({ pathname: '/match/[id]', params: { id: String(m.id) } })}>
                <ResultRow match={m} colors={colors} last={i === last.length - 1} />
              </Pressable>
            ))}
          </Panel>
        </Section>
      ) : null}

      <Section title="Squad cards" note={squad.length ? `${squad.filter((c) => owned[String(c.id)]).length} of ${squad.length} collected` : undefined}>
        {teams.loading && !teams.data ? (
          <Skeleton rows={1} height={160} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingRight: S.base }} style={{ marginHorizontal: -S.base, paddingLeft: S.base }}>
            {squad.map((c, i) => (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })} accessibilityRole="button">
                <SnapCard card={c} width={112} competition={league.name} collected={!!owned[String(c.id)]} loadPhoto={i < 10 || !!owned[String(c.id)]} look={lookOf(owned[String(c.id)])} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingBottom: S.xl, overflow: 'hidden' },
  watermark: { position: 'absolute', right: -60, top: 10, width: 260, height: 260, opacity: 0.08 },
  top: { paddingHorizontal: S.base, paddingTop: S.md },
  heroBody: { alignItems: 'center', gap: 6, paddingHorizontal: S.base, marginTop: S.sm },
  name: { fontFamily: F.display, fontSize: 40, color: C.chalk, textAlign: 'center' },
  heroStats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: S.md, backgroundColor: 'rgba(10,14,11,0.55)', borderRadius: R.md, paddingVertical: S.md },
  ratings: { flexDirection: 'row', paddingVertical: S.base },
});
