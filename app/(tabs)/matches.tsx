/**
 * Matches: every fixture of the selected league, with picks inline (Fixtures), the table with
 * a matchday time machine (Table), and the simulated rest of the season with a what-if
 * machine (Projections).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, InteractionManager, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen,
  LargeHeader,
  SectionHeader,
  Segmented,
  Stepper,
  Skeleton,
  Failed,
  Empty,
  KitChip,
  MiniBar,
  Row,
  tap,
  teamName,
  pctText,
} from '../../components/ui';
import { MatchMarket, CompactMatchRow, dayHeader, shortDate } from '../../components/Match';
import { useLeague } from '../../context/league';
import { currentMatchday, useClubColors, useSeason, useSettlePicks, useTable, useTeams } from '../../hooks/data';
import { isFinished, isLive, isUpcoming, recentForm, zone, Zone } from '../../lib/football';
import { fit, predict, Ratings } from '../../lib/model';
import { lastMatchday, remaining, simulate, tableAfter, Projection } from '../../lib/season';
import { applyPick, applyPress, locked, pressedIn, tally } from '../../lib/picks';
import { usePicks } from '../../lib/storage';
import type { Match, StandingRow, Team } from '../../lib/types';
import type { ClubColors } from '../../lib/colors';
import { color, font, motion, radius, size, space, type } from '../../constants/design';

const openMatch = (m: Match, c: number) => router.push({ pathname: '/match/[id]', params: { id: String(m.id), c: String(c) } });
const openClub = (id: number, c: number) => router.push({ pathname: '/club/[id]', params: { id: String(id), c: String(c) } });
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// ---------------------------------------------------------------- fixtures

function Fixtures({ matches, competitionId, competition, colors, venues, ratings }: { matches: Match[]; competitionId: number; competition: string; colors: Map<number, ClubColors>; venues: Map<number, string>; ratings: Ratings | null }) {
  const [picks, setPicks] = usePicks();
  const days = useMemo(() => [...new Set(matches.map((m) => m.matchday).filter((d): d is number => !!d))].sort((a, b) => a - b), [matches]);
  const cur = useMemo(() => currentMatchday(matches), [matches]);
  const [md, setMd] = useState<number | null>(cur);
  useEffect(() => setMd(cur), [cur]);

  // competitions without matchdays (knockouts): the next two weeks
  const fixtures = useMemo(() => {
    if (md) return matches.filter((m) => m.matchday === md).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    const now = Date.now();
    return matches.filter((m) => Math.abs(new Date(m.utcDate).getTime() - now) < 14 * 86_400_000).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }, [matches, md]);
  const groups = useMemo(() => {
    const g: { day: string; label: string; list: Match[] }[] = [];
    for (const m of fixtures) {
      const d = new Date(m.utcDate).toDateString();
      const last = g[g.length - 1];
      if (last && last.day === d) last.list.push(m);
      else g.push({ day: d, label: dayHeader(m.utcDate), list: [m] });
    }
    return g;
  }, [fixtures]);
  const pressed = pressedIn(picks, fixtures);
  const open = fixtures.some((m) => !locked(m));

  if (!fixtures.length) return <Empty icon="calendar-outline" title="Nothing scheduled" text="New fixtures appear here as soon as they're announced." />;

  return (
    <View>
      {md && days.length ? <Stepper value={md} min={days[0]} max={days[days.length - 1]} onChange={setMd} label={`Matchday ${md} of ${days[days.length - 1]}`} /> : null}
      {open || pressed ? (
        <Row
          left={
            <View style={styles.pressIcon}>
              <Ionicons name="flash" size={15} color={color.accentText} />
            </View>
          }
          title="Press a pick"
          subtitle="Right +4, wrong −2. One per matchday."
          right={
            <Text style={[styles.pressState, pressed && { color: color.accentText }]} numberOfLines={1}>
              {pressed ? (picks[String(pressed.id)]?.outcome === 'D' ? 'Draw' : teamName(picks[String(pressed.id)]?.outcome === 'H' ? pressed.homeTeam : pressed.awayTeam)) : 'Not used'}
            </Text>
          }
          style={{ marginTop: space.md }}
        />
      ) : null}
      {groups.map((g) => (
        <View key={g.day} style={{ paddingTop: space.xl }}>
          <SectionHeader title={g.label} />
          {g.list.map((m, i) => {
            const pred = ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null;
            const last = i === g.list.length - 1;
            if (isLive(m) || isFinished(m) || locked(m)) {
              return (
                <CompactMatchRow key={m.id} match={m} prediction={pred} homeColors={colors.get(m.homeTeam.id)} awayColors={colors.get(m.awayTeam.id)} pick={picks[String(m.id)]} onPress={() => openMatch(m, competitionId)} divider={!last} />
              );
            }
            return (
              <MatchMarket
                key={m.id}
                match={m}
                prediction={pred}
                pick={picks[String(m.id)]}
                onPick={(o) => setPicks((all) => applyPick(all, m.id, o))}
                homeColors={colors.get(m.homeTeam.id)}
                awayColors={colors.get(m.awayTeam.id)}
                venue={venues.get(m.homeTeam.id)}
                competition={competition}
                onOpen={() => openMatch(m, competitionId)}
                press={{ available: !pressed || pressed.id === m.id || !locked(pressed), onToggle: () => setPicks((all) => applyPress(all, m, fixtures)) }}
                divider={!last}
              />
            );
          })}
        </View>
      ))}
      <Text style={[type.footnote, { marginTop: space.xl }]}>Chances come from a goals model fitted to this season's results. Picks are free and only ever score points.</Text>
    </View>
  );
}

// ---------------------------------------------------------------- table

const ROW = size.rowCompact;
const ZONE: Record<Exclude<Zone, null>, string> = { top: color.accentText, europe: color.text2, playoff: color.text3, relegation: color.loss };

function zoneLegend(id: number): [Exclude<Zone, null>, string][] {
  if (id === 2001) return [['top', 'Round of 16'], ['playoff', 'Play-offs'], ['relegation', 'Out']];
  const l: [Exclude<Zone, null>, string][] = [['top', 'Top 4'], ['europe', '5th–6th']];
  if (id === 2002 || id === 2015) l.push(['playoff', 'Play-off']);
  l.push(['relegation', 'Relegation']);
  return l;
}

interface TRow {
  team: Team;
  position: number;
  played: number;
  goalDifference: number;
  points: number;
}

/** A table row that glides to its new place when the matchday changes (320 ms). */
function GlideRow({ pos, children }: { pos: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const y = useSharedValue((pos - 1) * ROW);
  useEffect(() => {
    y.value = reduced ? (pos - 1) * ROW : withTiming((pos - 1) * ROW, { duration: motion.slow, easing: Easing.bezier(...motion.easeInOut) });
  }, [pos, reduced, y]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.glide, st]}>{children}</Animated.View>;
}

function Table({ table, matches, competitionId, colors }: { table: StandingRow[]; matches: Match[]; competitionId: number; colors: Map<number, ClubColors> }) {
  const { width } = useWindowDimensions();
  const wide = width >= 400;
  const last = lastMatchday(matches);
  const total = Math.max(last, ...matches.map((m) => m.matchday ?? 0));
  const [md, setMd] = useState(last);
  useEffect(() => setMd(last), [last]);
  const rows: TRow[] = useMemo(() => {
    if (md >= last || !last) return table.map((r) => ({ team: r.team, position: r.position, played: r.playedGames, goalDifference: r.goalDifference, points: r.points }));
    return tableAfter(matches, md).map((r) => ({ team: r.team, position: r.position, played: r.played, goalDifference: r.goalDifference, points: r.points }));
  }, [md, last, table, matches]);
  const n = rows.length;

  return (
    <View>
      {last ? <Stepper value={md} min={1} max={last} onChange={setMd} label={`Matchday ${md} of ${total}`} /> : null}
      <View style={[styles.trow, styles.thead]}>
        <Text style={[styles.th, { width: 24 }]}>#</Text>
        <Text style={[styles.th, { flex: 1, paddingLeft: 30 }]}>Club</Text>
        <Text style={[styles.th, styles.tnum]}>P</Text>
        <Text style={[styles.th, styles.tnum]}>GD</Text>
        <Text style={[styles.th, styles.tnum]}>Pts</Text>
        {wide ? <Text style={[styles.th, { width: 76, textAlign: 'right' }]}>Form</Text> : null}
      </View>
      <View style={{ height: n * ROW }}>
        {rows.map((r) => {
          const z = zone(competitionId, r.position, n);
          return (
            <GlideRow key={r.team.id} pos={r.position}>
              <Pressable onPress={() => openClub(r.team.id, competitionId)} accessibilityRole="button" accessibilityLabel={`${r.position}, ${r.team.name}, ${r.points} points. Open club`}>
                {({ pressed }) => (
                  <View style={[styles.trow, { height: ROW }, pressed && { backgroundColor: color.raised }]}>
                    <View style={[styles.zone, z && { backgroundColor: ZONE[z] }]} />
                    <Text style={styles.tpos}>{r.position}</Text>
                    <KitChip colors={colors.get(r.team.id)} size={20} />
                    <Text style={styles.tname} numberOfLines={1}>{teamName(r.team)}</Text>
                    <Text style={[styles.tcell, styles.tnum]}>{r.played}</Text>
                    <Text style={[styles.tcell, styles.tnum]}>{signed(r.goalDifference)}</Text>
                    <Text style={[styles.tcell, styles.tnum, styles.tpts]}>{r.points}</Text>
                    {wide ? (
                      <View style={{ width: 76, alignItems: 'flex-end' }}>
                        <FormDots results={md >= last ? recentForm(matches, r.team.id) : recentForm(matches.filter((m) => (m.matchday ?? 0) <= md), r.team.id)} />
                      </View>
                    ) : null}
                  </View>
                )}
              </Pressable>
            </GlideRow>
          );
        })}
      </View>
      <View style={styles.legend}>
        {zoneLegend(competitionId).map(([z, l]) => (
          <View key={z} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: ZONE[z] }]} />
            <Text style={type.footnote}>{l}</Text>
          </View>
        ))}
      </View>
      {md < last ? <Text style={[type.footnote, { marginTop: space.sm }]}>Rebuilt from results alone, so point deductions and head-to-head tie-breakers aren't applied.</Text> : null}
    </View>
  );
}

function FormDots({ results }: { results: ('W' | 'D' | 'L')[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessible accessibilityLabel={`Form ${results.join(' ')}`}>
      {results.map((r, i) => (
        <View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: r === 'W' ? color.win : r === 'L' ? color.loss : color.hairlineStrong, opacity: r === 'D' ? 1 : 0.85 }} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- projections

function GoalStepper({ value, onChange, name }: { value: number | null; onChange: (v: number) => void; name: string }) {
  const b = (d: -1 | 1) => (
    <Pressable
      onPress={() => {
        tap('select');
        onChange(Math.max(0, Math.min(9, (value ?? 0) + (value === null ? 0 : d))));
      }}
      disabled={d < 0 && (value ?? 0) <= 0 && value !== null}
      hitSlop={6}
      style={styles.gbtn}
      accessibilityRole="button"
      accessibilityLabel={`${d < 0 ? 'One fewer' : 'One more'} goal for ${name}`}
    >
      <Ionicons name={d < 0 ? 'remove' : 'add'} size={16} color={color.text2} />
    </Pressable>
  );
  return (
    <View style={styles.gstep}>
      {b(-1)}
      <Text style={[styles.gnum, value === null && { color: color.text3 }]}>{value === null ? '–' : value}</Text>
      {b(1)}
    </View>
  );
}

function Projections({ table, matches, ratings, competitionId, colors }: { table: StandingRow[]; matches: Match[]; ratings: Ratings; competitionId: number; colors: Map<number, ClubColors> }) {
  const fixtures = useMemo(() => remaining(matches, competitionId).filter(isUpcoming).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 10), [matches, competitionId]);
  const [forced, setForced] = useState<Map<number, [number, number]>>(new Map());
  const [base, setBase] = useState<Map<number, Projection> | null>(null);
  const [now, setNow] = useState<Map<number, Projection> | null>(null);
  const left = useMemo(() => remaining(matches, competitionId).length, [matches, competitionId]);

  useEffect(() => {
    setBase(null);
    const task = InteractionManager.runAfterInteractions(() => setBase(simulate(table, matches, ratings, competitionId, { runs: 2000 })));
    return () => task.cancel();
  }, [table, matches, ratings, competitionId]);
  useEffect(() => {
    if (!forced.size) {
      setNow(null);
      return;
    }
    const t = setTimeout(() => setNow(simulate(table, matches, ratings, competitionId, { runs: 2000, forced })), 220);
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
  const ucl = competitionId === 2001;
  const cols: ['title' | 'top' | 'relegation', string][] = [['title', 'Title'], ['top', ucl ? 'Top 8' : 'Top 4'], ['relegation', ucl ? 'Out' : 'Down']];
  const delta = (id: number, k: 'title' | 'top' | 'relegation') => (now && base ? ((now.get(id)?.[k] ?? 0) - (base.get(id)?.[k] ?? 0)) * 100 : 0);

  if (!shown) return <Skeleton rows={8} height={40} />;
  const sorted = table.slice().sort((a, b) => (shown.get(b.team.id)?.avgPoints ?? 0) - (shown.get(a.team.id)?.avgPoints ?? 0));
  const movers = now
    ? table
        .map((r) => ({ r, d: cols.map(([k]) => [k, delta(r.team.id, k)] as const).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] }))
        .filter((x) => Math.abs(x.d[1]) >= 1)
        .sort((a, b) => Math.abs(b.d[1]) - Math.abs(a.d[1]))
        .slice(0, 4)
    : [];

  return (
    <View>
      <Text style={[type.footnote, { marginBottom: space.sm }]}>{left} fixtures left, each simulated 2,000 times with the goals model.</Text>
      <View style={[styles.trow, styles.thead]}>
        <Text style={[styles.th, { width: 24 }]}>#</Text>
        <Text style={[styles.th, { flex: 1, paddingLeft: 30 }]}>Club</Text>
        {cols.map(([k, l]) => (
          <Text key={k} style={[styles.th, styles.pcol, { textAlign: 'left' }]}>{l}</Text>
        ))}
      </View>
      {sorted.map((r, i) => {
        const p = shown.get(r.team.id);
        if (!p) return null;
        return (
          <Pressable key={r.team.id} onPress={() => openClub(r.team.id, competitionId)} accessibilityRole="button" accessibilityLabel={`${r.team.name}: title ${pctText(p.title)}, top ${pctText(p.top)}, ${ucl ? 'out' : 'relegation'} ${pctText(p.relegation)}`}>
            {({ pressed }) => (
              <View style={[styles.trow, { height: 48 }, styles.tdiv, pressed && { backgroundColor: color.raised }]}>
                <Text style={styles.tpos}>{i + 1}</Text>
                <KitChip colors={colors.get(r.team.id)} size={20} />
                <Text style={styles.tname} numberOfLines={1}>{teamName(r.team)}</Text>
                {cols.map(([k]) => {
                  const d = delta(r.team.id, k);
                  const good = k === 'relegation' ? d < 0 : d > 0;
                  return (
                    <View key={k} style={styles.pcol}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                        <Text style={[styles.pnum, k === 'relegation' && p[k] >= 0.3 && { color: color.loss }]}>{pctText(p[k])}</Text>
                        {Math.abs(d) >= 1 ? <Text style={[styles.pdelta, { color: good ? color.win : color.loss }]}>{d > 0 ? '▲' : '▼'}{Math.abs(Math.round(d))}</Text> : null}
                      </View>
                      <MiniBar value={p[k]} width={40} fill={k === 'relegation' ? color.loss : color.text2} />
                    </View>
                  );
                })}
              </View>
            )}
          </Pressable>
        );
      })}

      <View style={{ paddingTop: space.x3 }}>
        <SectionHeader title="What if" action={forced.size ? { label: 'Clear all', onPress: () => setForced(new Map()) } : undefined} />
        <Text style={[type.footnote, { marginBottom: space.sm }]}>Set a score and the rest of the season re-simulates. Changes show in the table above.</Text>
        {movers.length ? (
          <View style={styles.movers}>
            {movers.map(({ r, d }) => {
              const good = d[0] === 'relegation' ? d[1] < 0 : d[1] > 0;
              return (
                <View key={r.team.id} style={styles.mover}>
                  <KitChip colors={colors.get(r.team.id)} size={16} />
                  <Text style={styles.moverName} numberOfLines={1}>{teamName(r.team)}</Text>
                  <Text style={type.footnote}>{cols.find((c) => c[0] === d[0])?.[1]}</Text>
                  <Text style={[styles.pdelta, { fontSize: 13, color: good ? color.win : color.loss }]}>{d[1] > 0 ? '▲' : '▼'} {Math.abs(Math.round(d[1]))}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        {fixtures.map((m, i) => {
          const v = forced.get(m.id) ?? null;
          return (
            <View key={m.id} style={[styles.wi, i < fixtures.length - 1 && styles.tdiv]}>
              <View style={styles.wiMeta}>
                <Text style={type.footnote}>{shortDate(m.utcDate)}</Text>
                {v ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View style={styles.pinned}>
                      <Text style={styles.pinnedText}>Pinned</Text>
                    </View>
                    <Pressable onPress={() => set(m.id, null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear this result">
                      <Text style={[type.footnote, { color: color.text2 }]}>Clear</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {(['home', 'away'] as const).map((side) => {
                const t = side === 'home' ? m.homeTeam : m.awayTeam;
                const val = v ? v[side === 'home' ? 0 : 1] : null;
                return (
                  <View key={side} style={styles.wiTeam}>
                    <KitChip colors={colors.get(t.id)} size={16} />
                    <Text style={styles.wiName} numberOfLines={1}>{teamName(t)}</Text>
                    <GoalStepper
                      value={val}
                      name={teamName(t)}
                      onChange={(x) => {
                        const cur = v ?? [0, 0];
                        set(m.id, side === 'home' ? [x, cur[1]] : [cur[0], x]);
                      }}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- screen

const MODES = ['Fixtures', 'Table', 'Projections'];

export default function Matches() {
  const { league } = useLeague();
  const season = useSeason(league);
  const standings = useTable(league);
  const teams = useTeams(league);
  const colors = useClubColors(league);
  const [picks] = usePicks();
  const [mode, setMode] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const matches = useMemo(() => season.data?.matches ?? [], [season.data]);
  const ratings = useMemo(() => fit(matches), [matches]);
  const venues = useMemo(() => new Map((teams.data?.teams ?? []).filter((t) => t.venue).map((t) => [t.id, t.venue as string])), [teams.data]);
  useSettlePicks(matches);

  const md = useMemo(() => currentMatchday(matches), [matches]);
  const mdPoints = useMemo(() => {
    const ids = new Set(matches.filter((m) => m.matchday === md).map((m) => m.id));
    return tally(Object.values(picks).filter((p) => ids.has(p.matchId)), matches).you;
  }, [picks, matches, md]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([season.refetch(), standings.refetch()]);
    setRefreshing(false);
  }, [season, standings]);

  const failed = mode === 1 ? standings.error && !standings.data : season.error && !season.data;
  const loading = mode === 0 ? season.loading && !season.data : (standings.loading && !standings.data) || (season.loading && !season.data);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <LargeHeader
        leagueMenu
        title="Matches"
        right={
          <View style={styles.pts} accessible accessibilityLabel={`${mdPoints} points from your picks this matchday`}>
            <Text style={styles.ptsText}>{signed(mdPoints).replace(/^\+/, '')} pts</Text>
          </View>
        }
      />
      <Segmented options={MODES} value={mode} onChange={setMode} style={{ marginBottom: space.lg }} />
      {failed ? (
        <Failed message={(mode === 1 ? standings.error : season.error) ?? ''} code={mode === 1 ? standings.errorCode : season.errorCode} onRetry={mode === 1 ? standings.refetch : season.refetch} />
      ) : loading ? (
        <Skeleton rows={6} height={mode === 0 ? 120 : 40} />
      ) : mode === 0 ? (
        <Fixtures matches={matches} competitionId={league.id} competition={league.name} colors={colors} venues={venues} ratings={ratings} />
      ) : mode === 1 ? (
        standings.table.length ? <Table table={standings.table} matches={matches} competitionId={league.id} colors={colors} /> : <Empty icon="podium-outline" title="No table yet" text="The table appears after the first matchday." />
      ) : !ratings || !standings.table.length ? (
        <Empty icon="analytics-outline" title="Not enough results yet" text="Projections start after a few rounds." />
      ) : (
        <Projections table={standings.table} matches={matches} ratings={ratings} competitionId={league.id} colors={colors} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pts: { height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.raised, justifyContent: 'center' },
  ptsText: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  pressIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pressState: { fontFamily: font.medium, fontSize: 13, color: color.text3, maxWidth: 130, textAlign: 'right' },

  thead: { height: 32, borderBottomWidth: 1, borderBottomColor: color.hairline, marginTop: space.md },
  th: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.3, color: color.text3 },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tdiv: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  glide: { position: 'absolute', left: 0, right: 0, top: 0, borderBottomWidth: 1, borderBottomColor: color.hairline },
  zone: { position: 'absolute', left: -space.gutter + 4, width: 3, height: 22, borderRadius: 2, backgroundColor: 'transparent' },
  tpos: { width: 24, fontFamily: font.medium, fontSize: 13, color: color.text3, fontVariant: ['tabular-nums'] },
  tname: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 15, color: color.text },
  tcell: { fontFamily: font.regular, fontSize: 15, color: color.text2, fontVariant: ['tabular-nums'] },
  tnum: { width: 30, textAlign: 'right' },
  tpts: { fontFamily: font.semibold, color: color.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 3, height: 12, borderRadius: 2 },

  pcol: { width: 52, gap: 4 },
  pnum: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  pdelta: { fontFamily: font.semibold, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  movers: { backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs, marginBottom: space.sm },
  mover: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36 },
  moverName: { flex: 1, fontFamily: font.medium, fontSize: 14, color: color.text },
  wi: { paddingVertical: space.md, gap: 8 },
  wiMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 22 },
  wiTeam: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wiName: { flex: 1, fontFamily: font.medium, fontSize: 15, color: color.text },
  gstep: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.raised, borderRadius: radius.sm, height: 34 },
  gbtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  gnum: { minWidth: 18, textAlign: 'center', fontFamily: font.semibold, fontSize: 15, color: color.text, fontVariant: ['tabular-nums'] },
  pinned: { height: 22, paddingHorizontal: 8, borderRadius: radius.xs, backgroundColor: color.accentSoft, justifyContent: 'center' },
  pinnedText: { fontFamily: font.semibold, fontSize: 12, color: color.accentText },
});
