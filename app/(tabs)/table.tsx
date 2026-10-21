/**
 * Table: the official standings, a time machine that replays the season
 * matchday by matchday, and projected odds from simulating the rest of it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, InteractionManager } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, LeagueTabs, Section, Panel, Skeleton, Failed, Pill, Crest, KitStripe, Form, Empty, tap, teamName } from '../../components/ui';
import { useLeague } from '../../context/league';
import { useClubColors, useSeason, useTable } from '../../hooks/data';
import { recentForm, zone, Zone } from '../../lib/football';
import { fit } from '../../lib/model';
import { lastMatchday, simulate, tableAfter, Projection, remaining } from '../../lib/season';
import type { Match, StandingRow } from '../../lib/types';
import type { Ratings } from '../../lib/model';
import { alpha } from '../../lib/colors';
import type { ClubColors } from '../../lib/colors';
import type { Team } from '../../lib/types';
import { C, F, R, S, T } from '../../constants/theme';

type Mode = 'table' | 'replay' | 'odds' | 'whatif';
const ROW = 46;
const ZONE_COLOR: Record<Exclude<Zone, null>, string> = { top: '#6FB7FF', europe: '#B39DFF', playoff: C.draw, relegation: C.loss };

function legend(id: number): [Exclude<Zone, null>, string][] {
  if (id === 2001) return [['top', 'Round of 16'], ['playoff', 'Play-offs'], ['relegation', 'Out']];
  // the exact number of European places varies by season and cup results, so these are positions, not promises
  const l: [Exclude<Zone, null>, string][] = [['top', 'Top 4'], ['europe', '5th–6th']];
  if (id === 2002 || id === 2015) l.push(['playoff', 'Play-off']);
  l.push(['relegation', 'Relegation']);
  return l;
}

function Head({ cols }: { cols: string[] }) {
  return (
    <View style={[styles.row, styles.head]}>
      <Text style={[styles.headText, { width: 30 }]}>#</Text>
      <Text style={[styles.headText, { flex: 1 }]}>CLUB</Text>
      {cols.map((c) => (
        <Text key={c} style={[styles.headText, styles.stat, c === 'FORM' && { width: 64, textAlign: 'right' }]}>{c}</Text>
      ))}
    </View>
  );
}

function TeamCell({ team, colors }: { team: Team; colors?: ClubColors }) {
  return (
    <View style={styles.teamCell}>
      <KitStripe colors={colors} height={22} width={3} />
      <Crest team={team} size={20} colors={colors} />
      <Text style={styles.team} numberOfLines={1}>{teamName(team)}</Text>
    </View>
  );
}

/** A row that glides to its new position when the matchday changes. */
function ReplayRow({ pos, children }: { pos: number; children: React.ReactNode }) {
  const top = useSharedValue((pos - 1) * ROW);
  const reduced = useReducedMotion();
  useEffect(() => {
    top.value = reduced ? (pos - 1) * ROW : withTiming((pos - 1) * ROW, { duration: 520, easing: Easing.inOut(Easing.cubic) });
  }, [pos, reduced, top]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: top.value }] }));
  return <Animated.View style={[styles.replayRow, st]}>{children}</Animated.View>;
}

function TimeMachine({ matches, colors, competitionId }: { matches: Parameters<typeof tableAfter>[0]; colors: Map<number, ClubColors>; competitionId: number }) {
  const last = lastMatchday(matches);
  const [md, setMd] = useState(last);
  const [playing, setPlaying] = useState(false);
  const scroller = useRef<ScrollView>(null);
  useEffect(() => setMd(last), [last]);
  useEffect(() => {
    if (!playing) return;
    if (md >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setMd((m) => m + 1), 900);
    return () => clearTimeout(t);
  }, [playing, md, last]);
  useEffect(() => {
    scroller.current?.scrollTo({ x: Math.max(0, (md - 4) * 44), animated: true });
  }, [md]);
  const rows = useMemo(() => tableAfter(matches, md), [matches, md]);
  if (!last) return <Empty icon="time-outline" title="Nothing to replay yet" text="The time machine needs a matchday of results." />;

  return (
    <View style={{ gap: S.md }}>
      <View style={styles.controls}>
        <Pressable
          onPress={() => {
            tap('medium');
            if (md >= last) setMd(1);
            setPlaying((p) => !p);
          }}
          style={styles.play}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play the season'}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={20} color={C.night} />
        </Pressable>
        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
          {Array.from({ length: last }, (_, i) => i + 1).map((d) => (
            <Pressable
              key={d}
              onPress={() => {
                tap('select');
                setPlaying(false);
                setMd(d);
              }}
              style={[styles.md, d === md && styles.mdOn]}
              accessibilityRole="button"
              accessibilityLabel={`After matchday ${d}`}
            >
              <Text style={[styles.mdText, d === md && { color: C.night }]}>{d}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Text style={T.kicker}>After matchday {md}</Text>
      <Panel>
        <Head cols={['P', 'GD', 'PTS']} />
        <View style={{ height: rows.length * ROW }}>
          {rows.map((r) => {
            const z = zone(competitionId, r.position, rows.length);
            return (
              <ReplayRow key={r.team.id} pos={r.position}>
                <View style={[styles.row, { height: ROW }]}>
                  <View style={styles.pos}>
                    <View style={[styles.zone, z && { backgroundColor: ZONE_COLOR[z] }]} />
                    <Text style={styles.posText}>{r.position}</Text>
                  </View>
                  <TeamCell team={r.team} colors={colors.get(r.team.id)} />
                  <Text style={styles.stat}>{r.played}</Text>
                  <Text style={styles.stat}>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</Text>
                  <Text style={[styles.stat, styles.pts]}>{r.points}</Text>
                </View>
              </ReplayRow>
            );
          })}
        </View>
      </Panel>
      <Text style={T.small}>Rebuilt from results alone, so point deductions and head-to-head tie-breakers aren't applied.</Text>
    </View>
  );
}


function Stepper({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => { tap('select'); onChange(Math.max(0, value - 1)); }} hitSlop={6} style={styles.stepBtn} accessibilityLabel="One fewer goal">
        <Ionicons name="remove" size={16} color={C.chalk2} />
      </Pressable>
      <Text style={[styles.stepNum, { color }]}>{value}</Text>
      <Pressable onPress={() => { tap('select'); onChange(Math.min(9, value + 1)); }} hitSlop={6} style={styles.stepBtn} accessibilityLabel="One more goal">
        <Ionicons name="add" size={16} color={C.chalk2} />
      </Pressable>
    </View>
  );
}

/** Pin upcoming results and watch every club's odds move. */
function WhatIf({ table, matches, ratings, competitionId, colors }: { table: StandingRow[]; matches: Match[]; ratings: Ratings; competitionId: number; colors: Map<number, ClubColors> }) {
  const fixtures = useMemo(() => remaining(matches, competitionId).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 10), [matches, competitionId]);
  const [forced, setForced] = useState<Map<number, [number, number]>>(new Map());
  const [base, setBase] = useState<Map<number, Projection> | null>(null);
  const [now, setNow] = useState<Map<number, Projection> | null>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setBase(simulate(table, matches, ratings, competitionId, { runs: 1500 })));
    return () => task.cancel();
  }, [table, matches, ratings, competitionId]);
  useEffect(() => {
    if (!forced.size) {
      setNow(null);
      return;
    }
    const t = setTimeout(() => setNow(simulate(table, matches, ratings, competitionId, { runs: 1500, forced })), 220);
    return () => clearTimeout(t);
  }, [forced, table, matches, ratings, competitionId]);

  const set = (id: number, v: [number, number] | null) =>
    setForced((f) => {
      const n = new Map(f);
      if (v) n.set(id, v);
      else n.delete(id);
      return n;
    });
  const shown = now ?? base;
  const delta = (id: number, k: 'title' | 'top' | 'relegation') => (now && base ? (now.get(id)![k] - base.get(id)![k]) * 100 : 0);
  const fmt = (x: number) => (x >= 0.995 ? '>99' : x > 0 && x < 0.005 ? '<1' : `${Math.round(x * 100)}`);

  return (
    <View style={{ gap: S.md }}>
      {fixtures.map((m) => {
        const v = forced.get(m.id);
        const hc = colors.get(m.homeTeam.id)?.accent ?? C.chalk;
        const ac = colors.get(m.awayTeam.id)?.accent ?? C.chalk;
        return (
          <Panel key={m.id} style={[styles.wi, v && { borderColor: alpha(C.flare, 0.5) }]}>
            <View style={styles.wiRow}>
              <View style={styles.wiTeam}>
                <Crest team={m.homeTeam} size={22} colors={colors.get(m.homeTeam.id)} />
                <Text style={styles.wiName} numberOfLines={1}>{v ? m.homeTeam.tla ?? teamName(m.homeTeam) : teamName(m.homeTeam)}</Text>
              </View>
              {v ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Stepper value={v[0]} color={hc} onChange={(x) => set(m.id, [x, v[1]])} />
                  <Stepper value={v[1]} color={ac} onChange={(x) => set(m.id, [v[0], x])} />
                </View>
              ) : (
                <Text style={T.kicker}>Not set</Text>
              )}
              <View style={[styles.wiTeam, { justifyContent: 'flex-end' }]}>
                <Text style={[styles.wiName, { textAlign: 'right' }]} numberOfLines={1}>{v ? m.awayTeam.tla ?? teamName(m.awayTeam) : teamName(m.awayTeam)}</Text>
                <Crest team={m.awayTeam} size={22} colors={colors.get(m.awayTeam.id)} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pill label="Home win" active={!!v && v[0] > v[1]} onPress={() => set(m.id, [2, 0])} color={hc} />
              <Pill label="Draw" active={!!v && v[0] === v[1]} onPress={() => set(m.id, [1, 1])} color={C.chalk2} />
              <Pill label="Away win" active={!!v && v[0] < v[1]} onPress={() => set(m.id, [0, 2])} color={ac} />
              {v ? <Pill label="Clear" onPress={() => set(m.id, null)} /> : null}
            </View>
          </Panel>
        );
      })}

      <Text style={T.kicker}>{forced.size ? `${forced.size} result${forced.size > 1 ? 's' : ''} pinned · changes vs the real projection` : 'Pin a result above to see the odds move'}</Text>
      {!shown ? (
        <Skeleton rows={6} height={40} />
      ) : (
        <Panel>
          <Head cols={['TITLE', competitionId === 2001 ? 'TOP 8' : 'TOP 4', competitionId === 2001 ? 'OUT' : 'DOWN']} />
          {table
            .slice()
            .sort((a, b) => (shown.get(b.team.id)?.avgPoints ?? 0) - (shown.get(a.team.id)?.avgPoints ?? 0))
            .map((r, i) => {
              const p = shown.get(r.team.id)!;
              const cell = (k: 'title' | 'top' | 'relegation', bad = false) => {
                const d = delta(r.team.id, k);
                const up = d >= 1;
                const down = d <= -1;
                return (
                  <View style={[styles.stat, { width: 58 }]}>
                    <Text style={styles.wiPct}>{fmt(p[k])}%</Text>
                    {up || down ? <Text style={[styles.wiDelta, { color: (up !== bad) ? C.win : C.loss }]}>{up ? '▲' : '▼'}{Math.abs(Math.round(d))}</Text> : null}
                  </View>
                );
              };
              return (
                <View key={r.team.id} style={[styles.row, { height: ROW }, i % 2 === 1 && styles.alt]}>
                  <Text style={[styles.posText, { width: 30 }]}>{i + 1}</Text>
                  <TeamCell team={r.team} colors={colors.get(r.team.id)} />
                  {cell('title')}
                  {cell('top')}
                  {cell('relegation', true)}
                </View>
              );
            })}
        </Panel>
      )}
    </View>
  );
}

const pct = (x: number) => (x >= 0.995 ? '>99%' : x > 0 && x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`);

export default function TableScreen() {
  const { league, setLeague } = useLeague();
  const standings = useTable(league);
  const season = useSeason(league);
  const colors = useClubColors(league);
  const [mode, setMode] = useState<Mode>('table');
  const [proj, setProj] = useState<Map<number, Projection> | null>(null);
  const matches = season.data?.matches ?? [];
  const table = standings.table;
  const ratings = useMemo(() => fit(matches), [matches]);
  const left = useMemo(() => remaining(matches, league.id).length, [matches, league.id]);

  useEffect(() => {
    setProj(null);
    if (mode !== 'odds' || !ratings || !table.length) return;
    const task = InteractionManager.runAfterInteractions(() => setProj(simulate(table, matches, ratings, league.id, { runs: 3000 })));
    return () => task.cancel();
  }, [mode, ratings, table, matches, league.id]);

  return (
    <Screen>
      <Header kicker={league.name} title="Table" />
      <LeagueTabs value={league.id} onChange={setLeague} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.base, marginTop: S.sm }}>
        <Pill label="Table" active={mode === 'table'} onPress={() => setMode('table')} />
        <Pill label="Time machine" active={mode === 'replay'} onPress={() => setMode('replay')} />
        <Pill label="Odds" active={mode === 'odds'} onPress={() => setMode('odds')} />
        <Pill label="What if" active={mode === 'whatif'} onPress={() => setMode('whatif')} />
      </ScrollView>

      {standings.error && !standings.data ? (
        <Section title="Table">
          <Failed message={standings.error} code={standings.errorCode} onRetry={standings.refetch} />
        </Section>
      ) : standings.loading && !standings.data ? (
        <Section title="Loading">
          <Skeleton rows={6} height={40} />
        </Section>
      ) : mode === 'table' ? (
        <Section title="Standings">
          <Panel>
            <Head cols={['P', 'GD', 'PTS', 'FORM']} />
            {table.map((r, i) => {
              const z = zone(league.id, r.position, table.length);
              const form = recentForm(matches, r.team.id);
              return (
                <Pressable key={r.team.id} onPress={() => router.push({ pathname: '/club/[id]', params: { id: String(r.team.id) } })} style={({ pressed }) => [styles.row, { height: ROW }, i % 2 === 1 && styles.alt, pressed && { backgroundColor: C.turf }]} accessibilityRole="button" accessibilityLabel={`${r.team.name}, open club`}>
                  <View style={styles.pos}>
                    <View style={[styles.zone, z && { backgroundColor: ZONE_COLOR[z] }]} />
                    <Text style={styles.posText}>{r.position}</Text>
                  </View>
                  <TeamCell team={r.team} colors={colors.get(r.team.id)} />
                  <Text style={styles.stat}>{r.playedGames}</Text>
                  <Text style={styles.stat}>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</Text>
                  <Text style={[styles.stat, styles.pts]}>{r.points}</Text>
                  <View style={{ width: 64, alignItems: 'flex-end' }}>
                    <Form results={form} size={7} />
                  </View>
                </Pressable>
              );
            })}
          </Panel>
          <View style={styles.legend}>
            {legend(league.id).map(([z, l]) => (
              <View key={z} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: ZONE_COLOR[z] }]} />
                <Text style={T.small}>{l}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : mode === 'whatif' ? (
        <Section title="What if" note="Set the score of upcoming games and the rest of the season re-simulates">
          {!ratings ? (
            <Empty icon="analytics-outline" title="Not enough results yet" text="The what-if machine starts after a few rounds." />
          ) : (
            <WhatIf table={table} matches={matches} ratings={ratings} competitionId={league.id} colors={colors} />
          )}
        </Section>
      ) : mode === 'replay' ? (
        <Section title="Time machine" note="Scrub through the season or press play and watch it unfold">
          {season.data ? <TimeMachine matches={matches} colors={colors} competitionId={league.id} /> : <Skeleton rows={6} height={40} />}
        </Section>
      ) : (
        <Section title="Projected finish" note={`${left} fixtures left, simulated 3,000 times with the goals model`}>
          {!ratings ? (
            <Empty icon="analytics-outline" title="Not enough results yet" text="Projections start after a few rounds." />
          ) : !proj ? (
            <Skeleton rows={6} height={40} />
          ) : (
            <Panel>
              <Head cols={['PTS', 'TITLE', league.id === 2001 ? 'TOP 8' : 'TOP 4', league.id === 2001 ? 'OUT' : 'DOWN']} />
              {table
                .slice()
                .sort((a, b) => (proj.get(b.team.id)?.avgPoints ?? 0) - (proj.get(a.team.id)?.avgPoints ?? 0))
                .map((r, i) => {
                  const p = proj.get(r.team.id)!;
                  return (
                    <View key={r.team.id} style={[styles.row, { height: ROW }, i % 2 === 1 && styles.alt]}>
                      <Text style={[styles.posText, { width: 30 }]}>{i + 1}</Text>
                      <TeamCell team={r.team} colors={colors.get(r.team.id)} />
                      <Text style={[styles.stat, styles.pts]}>{Math.round(p.avgPoints)}</Text>
                      <Text style={[styles.stat, { color: p.title > 0.2 ? C.icon : C.chalk2 }]}>{pct(p.title)}</Text>
                      <Text style={styles.stat}>{pct(p.top)}</Text>
                      <Text style={[styles.stat, { color: p.relegation > 0.3 ? C.loss : C.chalk2 }]}>{pct(p.relegation)}</Text>
                    </View>
                  );
                })}
            </Panel>
          )}
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md },
  alt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  head: { height: 34, borderBottomWidth: 1, borderBottomColor: C.line },
  headText: { fontFamily: F.label, fontSize: 11, letterSpacing: 1.2, color: C.dim },
  pos: { width: 30, flexDirection: 'row', alignItems: 'center', gap: 5 },
  zone: { width: 3, height: 18, borderRadius: 2, backgroundColor: 'transparent' },
  posText: { fontFamily: F.num, fontSize: 15, color: C.chalk2 },
  teamCell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { fontFamily: F.bodyBold, fontSize: 14, color: C.chalk, flexShrink: 1 },
  stat: { width: 42, textAlign: 'center', fontFamily: F.num, fontSize: 15, color: C.chalk2 },
  pts: { color: C.chalk, fontFamily: F.numHeavy, fontSize: 17 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.flare, alignItems: 'center', justifyContent: 'center' },
  md: { width: 40, height: 34, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.pitch },
  mdOn: { backgroundColor: C.chalk, borderColor: C.chalk },
  mdText: { fontFamily: F.num, fontSize: 15, color: C.chalk2 },
  replayRow: { position: 'absolute', left: 0, right: 0, top: 0 },
  wi: { padding: S.md, gap: S.sm },
  wiRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  wiTeam: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  wiName: { fontFamily: F.bodyBold, fontSize: 13, color: C.chalk, flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.night, borderRadius: R.sm, borderWidth: 1, borderColor: C.line },
  stepBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  stepNum: { fontFamily: F.numHeavy, fontSize: 20, minWidth: 16, textAlign: 'center' },
  wiPct: { fontFamily: F.num, fontSize: 14, color: C.chalk },
  wiDelta: { fontFamily: F.num, fontSize: 10 },
});
