/**
 * A match: both clubs in their colours, the model's odds (for finished games,
 * what it said before kick-off), a scoreline heatmap you can tap, the season
 * so far for both sides, and each side's top card.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Section, Panel, Crest, OddsBar, Skeleton, LiveLamp, Form, tap, teamName } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { SnapCard } from '../../components/SnapCard';
import { dayLabel, clock, ResultRow } from '../../components/Match';
import { useLeague } from '../../context/league';
import { useCards, useClubColors, useSeason } from '../../hooks/data';
import { fit, predict, scoreGrid } from '../../lib/model';
import { isFinished, isLive, recentForm } from '../../lib/football';
import { trajectory } from '../../lib/season';
import { useCollection } from '../../lib/storage';
import { lookOf } from '../../lib/collection';
import { alpha, luminance } from '../../lib/colors';
import { C, F, R, S, T } from '../../constants/theme';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league } = useLeague();
  const season = useSeason(league);
  const colors = useClubColors(league);
  const { list } = useCards(league);
  const [collection] = useCollection();
  const { width } = useWindowDimensions();
  const [cell, setCell] = useState<[number, number] | null>(null);
  const matches = season.data?.matches ?? [];
  const m = matches.find((x) => x.id === Number(id));

  // finished games: the model as it stood before kick-off; otherwise the current fit
  const ratings = useMemo(() => {
    if (!m) return null;
    const day = m.utcDate.slice(0, 10);
    return fit(isFinished(m) || isLive(m) ? matches.filter((g) => isFinished(g) && g.utcDate.slice(0, 10) < day) : matches);
  }, [m, matches]);
  const p = m && ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null;
  const grid = m && ratings ? scoreGrid(ratings, m.homeTeam.id, m.awayTeam.id) : null;
  const max = grid ? Math.max(...grid.flat()) : 1;

  if (!m) {
    return (
      <Screen>
        <View style={{ padding: S.base }}>{season.loading ? <Skeleton rows={3} height={120} /> : <Text style={T.body}>Match not found.</Text>}</View>
      </Screen>
    );
  }

  const hc = colors.get(m.homeTeam.id);
  const ac = colors.get(m.awayTeam.id);
  const done = isFinished(m);
  const live = isLive(m);
  const h = m.score.fullTime.home;
  const a = m.score.fullTime.away;
  const chartW = Math.min(width, 560) - S.base * 2 - 2;
  const homeT = trajectory(matches, m.homeTeam.id);
  const awayT = trajectory(matches, m.awayTeam.id);
  const meeting = matches.find((x) => x.id !== m.id && isFinished(x) && ((x.homeTeam.id === m.homeTeam.id && x.awayTeam.id === m.awayTeam.id) || (x.homeTeam.id === m.awayTeam.id && x.awayTeam.id === m.homeTeam.id)));
  const ROLE = new Set(['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Squad player']);
  const best = (teamId: number) => {
    const mine = list.filter((c) => c.team.id === teamId);
    return mine.find((c) => c.rank !== null) ?? mine.find((c) => c.abilities[0] && !ROLE.has(c.abilities[0].title)) ?? mine[0];
  };
  const keyCards = [best(m.homeTeam.id), best(m.awayTeam.id)].filter((c): c is NonNullable<typeof c> => !!c);
  const owned = collection[String(league.id)] ?? {};

  return (
    <Screen motif={false}>
      <View style={styles.hero}>
        <LinearGradient colors={[alpha(hc?.primary ?? C.turf, 0.85), C.night]} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { right: '50%' }]} />
        <LinearGradient colors={[alpha(ac?.primary ?? C.turf, 0.85), C.night]} start={{ x: 1, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { left: '50%' }]} />
        <View style={styles.heroTop}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={C.chalk} />
          </Pressable>
          {live ? <LiveLamp /> : <Text style={T.kicker}>{done ? 'Full time' : `${dayLabel(m.utcDate)} · ${clock(m.utcDate)}`}</Text>}
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.heroRow}>
          <Pressable style={styles.heroTeam} onPress={() => router.push({ pathname: '/club/[id]', params: { id: String(m.homeTeam.id) } })} accessibilityRole="button">
            <Crest team={m.homeTeam} size={64} colors={hc} />
            <Text style={styles.heroName} numberOfLines={2}>{teamName(m.homeTeam).toUpperCase()}</Text>
            <Form results={recentForm(matches, m.homeTeam.id)} />
          </Pressable>
          <View style={styles.heroMid}>
            {done || live ? (
              <Text style={styles.heroScore}>{h ?? 0}–{a ?? 0}</Text>
            ) : (
              <Text style={styles.heroVs}>VS</Text>
            )}
            {m.matchday ? <Text style={T.kicker}>Matchday {m.matchday}</Text> : null}
          </View>
          <Pressable style={styles.heroTeam} onPress={() => router.push({ pathname: '/club/[id]', params: { id: String(m.awayTeam.id) } })} accessibilityRole="button">
            <Crest team={m.awayTeam} size={64} colors={ac} />
            <Text style={styles.heroName} numberOfLines={2}>{teamName(m.awayTeam).toUpperCase()}</Text>
            <Form results={recentForm(matches, m.awayTeam.id)} />
          </Pressable>
        </View>
      </View>

      {p && grid ? (
        <Section title={done || live ? 'What the model said' : 'The model’s call'} note={done || live ? 'Predicted before kick-off from earlier results only' : `Expected goals ${p.xgHome.toFixed(1)} – ${p.xgAway.toFixed(1)}`}>
          <Panel style={{ padding: S.base, gap: S.md }}>
            <OddsBar home={p.home} draw={p.draw} away={p.away} homeColor={hc?.accent ?? C.chalk2} awayColor={ac?.accent ?? C.chalk2} />
          </Panel>
          <Text style={T.kicker}>Every scoreline · tap a square</Text>
          <Panel style={{ padding: S.md }}>
            <View style={styles.gridRow}>
              <View style={styles.axis} />
              {grid[0].map((_, j) => (
                <Text key={j} style={styles.axisText}>{j === 5 ? '5+' : j}</Text>
              ))}
            </View>
            {grid.map((row, i) => (
              <View key={i} style={styles.gridRow}>
                <Text style={[styles.axisText, styles.axis]}>{i === 5 ? '5+' : i}</Text>
                {row.map((v, j) => {
                  const actual = done && h === i && a === j;
                  const sel = cell && cell[0] === i && cell[1] === j;
                  const tint = i > j ? hc?.accent ?? C.chalk2 : i < j ? ac?.accent ?? C.chalk2 : C.chalk2;
                  return (
                    <Pressable
                      key={j}
                      onPress={() => {
                        tap('select');
                        setCell([i, j]);
                      }}
                      style={[styles.cell, { backgroundColor: alpha(tint, 0.08 + (v / max) * 0.8) }, (actual || sel) && { borderColor: C.chalk, borderWidth: 2 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${i} to ${j}: ${(v * 100).toFixed(1)} percent`}
                    >
                      <Text style={[styles.cellText, v / max > 0.55 && luminance(tint) > 0.35 && { color: C.night }]}>{Math.round(v * 100)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Text style={[T.small, { marginTop: S.sm }]}>
              {cell
                ? `${teamName(m.homeTeam)} ${cell[0] === 5 ? '5+' : cell[0]}–${cell[1] === 5 ? '5+' : cell[1]} ${teamName(m.awayTeam)}: ${(grid[cell[0]][cell[1]] * 100).toFixed(1)}%`
                : `Rows: ${teamName(m.homeTeam)} goals. Columns: ${teamName(m.awayTeam)} goals. Numbers are percentages.${done ? ' The outlined square is what happened.' : ''}`}
            </Text>
          </Panel>
        </Section>
      ) : null}

      {homeT.length > 1 ? (
        <Section title="Points race" note="Points after every matchday this season">
          <Panel style={{ padding: S.md }}>
            <LineChart
              width={chartW - S.md * 2}
              series={[
                { label: teamName(m.homeTeam), color: hc?.accent ?? C.chalk, points: homeT.map((t) => ({ x: t.matchday, y: t.points })) },
                { label: teamName(m.awayTeam), color: ac?.accent ?? C.chalk2, points: awayT.map((t) => ({ x: t.matchday, y: t.points })) },
              ]}
              yMin={0}
              yLabel="POINTS"
            />
          </Panel>
        </Section>
      ) : null}

      {meeting ? (
        <Section title="Earlier this season">
          <Panel onPress={() => router.replace({ pathname: '/match/[id]', params: { id: String(meeting.id) } })}>
            <ResultRow match={meeting} colors={colors} last />
          </Panel>
        </Section>
      ) : null}

      {keyCards.length ? (
        <Section title="Key cards" note="Each side's top scorer, or its most stand-out player">
          <View style={{ flexDirection: 'row', gap: S.md, justifyContent: 'center' }}>
            {keyCards.map((c) => (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })} accessibilityRole="button">
                <SnapCard card={c} width={Math.min(160, (chartW - S.md) / 2)} competition={league.name} look={lookOf(owned[String(c.id)])} collected={!!owned[String(c.id)]} />
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingBottom: S.xl, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.base, paddingTop: S.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.base, marginTop: S.lg },
  heroTeam: { flex: 1, alignItems: 'center', gap: S.sm },
  heroName: { fontFamily: F.display, fontSize: 20, color: C.chalk, textAlign: 'center' },
  heroMid: { width: 112, alignItems: 'center', gap: 4 },
  heroScore: { fontFamily: F.numHeavy, fontSize: 56, color: C.chalk },
  heroVs: { fontFamily: F.display, fontSize: 30, color: C.chalk2 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  axis: { width: 24 },
  axisText: { flex: 1, textAlign: 'center', fontFamily: F.label, fontSize: 11, color: C.dim },
  cell: { flex: 1, aspectRatio: 1, borderRadius: R.xs, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cellText: { fontFamily: F.num, fontSize: 13, color: C.chalk },
});
