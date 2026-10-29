/**
 * A match: the kick-off (or the score), the model's chance for each outcome (for finished games,
 * what it said before kick-off), your free pick, the likeliest scores, form, the points race
 * and each side's key card.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, NavBar, Overline, ProbabilityBar, Segmented, Toggle, KitStripe, KitField, ScoreBug, Bleed, FormPills, Skeleton, Empty, LiveDot, tap, teamName, pctText, fixtureTones, clubText } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { SnapCard } from '../../components/SnapCard';
import { clock, shortDate, statusLabel } from '../../components/Match';
import { useLeague } from '../../context/league';
import { LEAGUE_MAP } from '../../constants/leagues';
import { useCards, useClubColors, useSeason, useSettlePicks, useTable, useTeams } from '../../hooks/data';
import { backtest, fit, outcome as resultOf, pick as leadOf, predict, scoreGrid, Outcome } from '../../lib/model';
import { isFinished, isLive, recentForm } from '../../lib/football';
import { applyPick, applyPress, locked, points, pressedIn } from '../../lib/picks';
import { trajectory } from '../../lib/season';
import { useCollection, usePicks } from '../../lib/storage';
import { lookOf } from '../../lib/collection';
import type { Match } from '../../lib/types';
import { color, font, space, type } from '../../constants/design';

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
const OUTCOMES: Outcome[] = ['H', 'D', 'A'];
const ROLE = new Set(['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Squad player']);

export default function MatchScreen() {
  const { id, c } = useLocalSearchParams<{ id: string; c?: string }>();
  const ctx = useLeague();
  const league = (c && LEAGUE_MAP[Number(c)]) || ctx.league;
  const season = useSeason(league);
  const standings = useTable(league);
  const teams = useTeams(league);
  const colors = useClubColors(league);
  const { list } = useCards(league);
  const [collection] = useCollection();
  const [picks, setPicks] = usePicks();
  const { width } = useWindowDimensions();
  const [allScores, setAllScores] = useState(false);
  const [cell, setCell] = useState<[number, number] | null>(null);
  const matches = useMemo(() => season.data?.matches ?? [], [season.data]);
  const m = matches.find((x) => x.id === Number(id));
  useSettlePicks(matches);

  // finished or live games: the model as it stood before kick-off; otherwise the current fit
  const ratings = useMemo(() => {
    if (!m) return null;
    const day = m.utcDate.slice(0, 10);
    return fit(isFinished(m) || isLive(m) ? matches.filter((g) => isFinished(g) && g.utcDate.slice(0, 10) < day) : matches);
  }, [m, matches]);
  const bt = useMemo(() => backtest(matches), [matches]);
  const p = m && ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null;
  const grid = m && ratings ? scoreGrid(ratings, m.homeTeam.id, m.awayTeam.id) : null;

  if (!m) {
    return (
      <Screen tabBar={false}>
        <NavBar title={league.name} />
        <View style={{ paddingTop: space.xl }}>{season.loading ? <Skeleton rows={4} height={96} gap={space.lg} /> : <Empty icon="search-outline" title="Match not found" text="It may have moved to another competition." />}</View>
      </Screen>
    );
  }

  const done = isFinished(m);
  const live = isLive(m);
  const isLocked = locked(m);
  const h = m.score.fullTime.home ?? 0;
  const a = m.score.fullTime.away ?? 0;
  const hc = colors.get(m.homeTeam.id);
  const ac = colors.get(m.awayTeam.id);
  const venue = teams.data?.teams.find((t) => t.id === m.homeTeam.id)?.venue;
  const row = (teamId: number) => standings.table.find((r) => r.team.id === teamId);
  const lead = p ? leadOf(p) : 'H';
  const result = done ? resultOf(m) : null;
  const pick = picks[String(m.id)];
  const group = m.matchday ? matches.filter((x) => x.matchday === m.matchday) : [m];
  const otherPressed = pressedIn(picks, group.filter((x) => x.id !== m.id));
  const canPress = !!pick && !isLocked && (!otherPressed || !locked(otherPressed));
  const contentW = Math.min(width, 600) - space.gutter * 2;

  const top5 = grid
    ? grid
        .flatMap((r, i) => r.map((v, j) => ({ i, j, v })))
        .filter((x) => x.i < 5 && x.j < 5)
        .sort((x, y) => y.v - x.v)
        .slice(0, 5)
    : [];
  const maxTop = top5[0]?.v ?? 1;
  const maxGrid = grid ? Math.max(...grid.flat()) : 1;

  const homeT = trajectory(matches, m.homeTeam.id);
  const awayT = trajectory(matches, m.awayTeam.id);
  const best = (teamId: number) => {
    const mine = list.filter((x) => x.team.id === teamId);
    return mine.find((x) => x.rank !== null) ?? mine.find((x) => x.abilities[0] && !ROLE.has(x.abilities[0].title)) ?? mine[0];
  };
  const keyCards = [best(m.homeTeam.id), best(m.awayTeam.id)].filter((x): x is NonNullable<typeof x> => !!x);
  const owned = collection[String(league.id)] ?? {};
  const cardW = Math.min(150, (contentW - space.md) / 2);
  const openClub = (teamId: number) => router.push({ pathname: '/club/[id]', params: { id: String(teamId), c: String(league.id) } });

  const share = () => {
    const what = done || live ? `${teamName(m.homeTeam)} ${h}–${a} ${teamName(m.awayTeam)}` : `${teamName(m.homeTeam)} v ${teamName(m.awayTeam)}, ${shortDate(m.utcDate)} ${clock(m.utcDate)}`;
    const chance = p ? ` Model's chance: ${pctText(p.home)} / ${pctText(p.draw)} / ${pctText(p.away)}.` : '';
    Share.share({ message: `${what} · ${league.name}.${chance} Via FootSnap.` }).catch(() => {});
  };

  const [th, ta] = fixtureTones(hc, ac);
  const code = (t: Match['homeTeam']) => (t.tla ?? teamName(t).slice(0, 3)).toUpperCase();
  const team = (t: Match['homeTeam'], align: 'flex-start' | 'flex-end') => {
    const r = row(t.id);
    return (
      <Pressable style={[styles.team, { alignItems: align }]} onPress={() => openClub(t.id)} accessibilityRole="button" accessibilityLabel={`${t.name}${r ? `, ${ordinal(r.position)}, ${r.points} points` : ''}. Open club`}>
        <Text style={[styles.teamName, { textAlign: align === 'flex-start' ? 'left' : 'right' }]} numberOfLines={2}>{teamName(t)}</Text>
        {r ? <Text style={styles.teamMeta}>{ordinal(r.position)} · {r.points} pts</Text> : null}
      </Pressable>
    );
  };
  const bugCenter = done || live ? `${h}–${a}` : m.status === 'POSTPONED' ? 'TBC' : clock(m.utcDate);

  return (
    <Screen tabBar={false}>
      <View style={{ zIndex: 2 }}>
      <NavBar
        title={`${league.name}${m.matchday ? ` · Matchday ${m.matchday}` : ''}`}
        right={
          <Pressable onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share this match">
            <Ionicons name="ellipsis-horizontal" size={22} color={color.text} />
          </Pressable>
        }
      />
      </View>

      {/* the fixture in its two kits, the kick-off (or score) set like a TV score bug */}
      <Bleed style={{ marginTop: 4 }}>
        <KitField colors={hc} away={ac} tones={[th, ta]} height={176} fade={0.6}>
          <View style={styles.bugWrap} pointerEvents="none">
            <ScoreBug home={{ code: code(m.homeTeam), tone: th }} away={{ code: code(m.awayTeam), tone: ta }} center={bugCenter} live={live} />
          </View>
        </KitField>
      </Bleed>
      <View style={styles.hero}>
        {team(m.homeTeam, 'flex-start')}
        {team(m.awayTeam, 'flex-end')}
      </View>
      <View style={styles.koRow}>
        {live ? <LiveDot size={7} /> : null}
        <Text style={[styles.koMeta, live && { color: color.live }]} numberOfLines={1}>
          {[live ? statusLabel(m) : done ? 'Full time' : m.status === 'POSTPONED' ? 'Postponed' : shortDate(m.utcDate), venue].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {p ? (
        <View style={styles.sec}>
          <Overline>{done || live ? 'What the model said before kick-off' : "Model's chance"}</Overline>
          <View style={styles.big}>
            {OUTCOMES.map((o, i) => {
              const v = o === 'H' ? p.home : o === 'D' ? p.draw : p.away;
              const txt = pctText(v, false);
              return (
                <View key={o} style={[styles.bigCol, { alignItems: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end' }]}>
                  <Text style={[type.numHero, { color: lead === o ? color.text : color.text2 }]}>
                    {txt}
                    <Text style={styles.bigPct}>%</Text>
                  </Text>
                  <Text style={[styles.bigLabel, o !== 'D' && { color: clubText(o === 'H' ? hc : ac), fontFamily: font.semibold }]} numberOfLines={1}>
                    {o === 'H' ? teamName(m.homeTeam) : o === 'D' ? 'Draw' : teamName(m.awayTeam)}
                    {result === o ? '  ✓' : ''}
                  </Text>
                </View>
              );
            })}
          </View>
          <ProbabilityBar home={p.home} draw={p.draw} away={p.away} lead={lead} tones={[th, ta]} style={{ marginVertical: 14 }} />
          <View style={styles.xg}>
            <Text style={styles.xgLabel}>Expected goals</Text>
            <Text style={styles.xgValue}>{p.xgHome.toFixed(2)} – {p.xgAway.toFixed(2)}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sec}>
        <Overline right="Free · points only">Your pick</Overline>
        <Segmented
          options={[teamName(m.homeTeam), 'Draw', teamName(m.awayTeam)]}
          value={pick ? OUTCOMES.indexOf(pick.outcome) : -1}
          tones={[th, undefined, ta]}
          onChange={(i) => setPicks((all) => applyPick(all, m.id, OUTCOMES[i]))}
          disabled={isLocked}
        />
        {done && pick ? (
          <Text style={[styles.caption, { color: pick.outcome === result ? color.win : color.text2 }]}>
            {pick.outcome === result ? 'Right' : 'Not this time'} · {(() => {
              const pts = points(pick.outcome === result, pick.snapped);
              return pts > 0 ? `+${pts} points` : pts < 0 ? `−${-pts} points` : 'no points';
            })()}
          </Text>
        ) : isLocked ? (
          <Text style={styles.caption}>Locked at kick-off</Text>
        ) : !pick ? (
          <Text style={styles.caption}>+2 points if right</Text>
        ) : null}
        {!done ? (
          <View style={styles.press}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.pressTitle}>Press</Text>
              <Text style={type.footnote}>
                {otherPressed && !pick?.snapped ? `Right +4, wrong −2. Used on ${teamName(otherPressed.homeTeam)} v ${teamName(otherPressed.awayTeam)}; turning it on moves it here.` : 'Right +4, wrong −2. One per matchday.'}
              </Text>
            </View>
            <Toggle value={!!pick?.snapped} onValueChange={() => setPicks((all) => applyPress(all, m, group))} disabled={!canPress} label="Press this pick" />
          </View>
        ) : null}
      </View>

      {grid ? (
        <View style={styles.sec}>
          <View style={styles.overRow}>
            <Text style={type.overline}>Likeliest scores</Text>
            <Pressable onPress={() => { tap('select'); setAllScores((x) => !x); }} hitSlop={8} accessibilityRole="button" style={styles.more}>
              <Text style={styles.moreText}>{allScores ? 'Top five' : 'All scores'}</Text>
              <Ionicons name={allScores ? 'chevron-up' : 'chevron-forward'} size={14} color={color.accentText} />
            </Pressable>
          </View>
          {!allScores ? (
            <View style={styles.scores}>
              {top5.map((x, k) => (
                <View key={`${x.i}-${x.j}`} style={styles.scoreCol} accessible accessibilityLabel={`${x.i}–${x.j}: ${pctText(x.v)}`}>
                  <Text style={styles.scoreText}>{x.i}–{x.j}</Text>
                  <View style={styles.sbar}>
                    <View style={{ height: `${(x.v / maxTop) * 100}%`, width: '46%', alignSelf: 'center', backgroundColor: k === 0 ? color.chalk : color.hairlineStrong, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                  </View>
                  <Text style={styles.scorePct}>{pctText(x.v)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View>
              <View style={styles.gridRow}>
                <View style={styles.axis} />
                {grid[0].map((_, j) => (
                  <Text key={j} style={[styles.axisText, { flex: 1 }]}>{j === 5 ? '5+' : j}</Text>
                ))}
              </View>
              {grid.map((r, i) => (
                <View key={i} style={styles.gridRow}>
                  <Text style={[styles.axisText, styles.axis]}>{i === 5 ? '5+' : i}</Text>
                  {r.map((v, j) => {
                    const sel = cell && cell[0] === i && cell[1] === j;
                    const actual = done && h === i && a === j;
                    const strong = v / maxGrid > 0.55;
                    return (
                      <Pressable
                        key={j}
                        onPress={() => {
                          tap('select');
                          setCell([i, j]);
                        }}
                        style={[styles.cell, (sel || actual) && { borderColor: color.text }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${i} to ${j}: ${(v * 100).toFixed(1)} percent`}
                      >
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: color.accent, opacity: Math.max(0.04, v / maxGrid), borderRadius: 6 }]} />
                        <Text style={[styles.cellText, strong && { color: color.onAccent }]}>{Math.round(v * 100)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Text style={[type.footnote, { marginTop: space.sm }]}>
                {cell
                  ? `${teamName(m.homeTeam)} ${cell[0] === 5 ? '5+' : cell[0]}–${cell[1] === 5 ? '5+' : cell[1]} ${teamName(m.awayTeam)}: ${(grid[cell[0]][cell[1]] * 100).toFixed(1)}%`
                  : `Rows are ${teamName(m.homeTeam)} goals, columns ${teamName(m.awayTeam)} goals, in %.${done ? ' The outlined square is what happened.' : ' Tap a square.'}`}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.sec}>
        <Overline>Last five</Overline>
        {[m.homeTeam, m.awayTeam].map((t) => (
          <Pressable key={t.id} style={styles.formRow} onPress={() => openClub(t.id)} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <KitStripe colors={colors.get(t.id)} tone={t.id === m.homeTeam.id ? th : ta} height={18} width={3} />
              <Text style={styles.formName} numberOfLines={1}>{teamName(t)}</Text>
            </View>
            <FormPills results={recentForm(matches, t.id)} />
          </Pressable>
        ))}
      </View>

      {homeT.length > 1 ? (
        <View style={styles.sec}>
          <Overline>Points race</Overline>
          <LineChart
            width={contentW}
            yMin={0}
            series={[
              { label: teamName(m.homeTeam), points: homeT.map((t) => ({ x: t.matchday, y: t.points })) },
              { label: teamName(m.awayTeam), points: awayT.map((t) => ({ x: t.matchday, y: t.points })), dashed: true },
            ]}
            yLabel="Points"
          />
        </View>
      ) : null}

      {keyCards.length ? (
        <View style={styles.sec}>
          <Overline>Key cards</Overline>
          <View style={{ flexDirection: 'row', gap: space.md, justifyContent: 'center' }}>
            {keyCards.map((k) => (
              <Pressable key={k.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(k.id) } })} accessibilityRole="button" accessibilityLabel={`${k.name} card`}>
                <SnapCard card={k} width={cardW} competition={league.name} look={lookOf(owned[String(k.id)])} collected={!!owned[String(k.id)]} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {ratings ? (
        <Text style={styles.fine}>
          From a goals model fitted to this season's {ratings.games} results.
          {bt ? ` Called before each game, it has been right ${Math.round(bt.accuracy * 100)}% of the time (Brier ${bt.brier.toFixed(3)}).` : ''}
        </Text>
      ) : (
        <Text style={styles.fine}>The model's chances start once this season has a few results.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bugWrap: { position: 'absolute', left: 0, right: 0, top: 46, alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'flex-start', marginTop: -34, gap: space.lg },
  team: { flex: 1, gap: 3 },
  teamName: { ...type.clubName, fontSize: 24, lineHeight: 26 },
  koRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: space.md, paddingBottom: 26 },
  teamMeta: { fontFamily: font.medium, fontSize: 13, color: color.text3, fontVariant: ['tabular-nums'] },
  ko: { width: 120, alignItems: 'center', gap: 2, paddingTop: 6 },
  koTime: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: color.text, fontVariant: ['tabular-nums'] },
  koMeta: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.text3, textAlign: 'center' },
  sec: { paddingTop: space.xs, paddingBottom: 22 },
  big: { flexDirection: 'row' },
  bigCol: { flex: 1, gap: 2 },
  bigPct: { fontSize: 22, letterSpacing: -0.4 },
  bigLabel: { fontFamily: font.medium, fontSize: 13, color: color.text3 },
  xg: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: color.hairline },
  xgLabel: { fontFamily: font.medium, fontSize: 14, color: color.text3 },
  xgValue: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  caption: { ...type.footnote, marginTop: space.sm },
  press: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: 14 },
  pressTitle: { fontFamily: font.semibold, fontSize: 15, color: color.text },
  overRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { fontFamily: font.medium, fontSize: 14, color: color.accentText },
  scores: { flexDirection: 'row', gap: 8 },
  scoreCol: { flex: 1, alignItems: 'center', gap: 6 },
  scoreText: { fontFamily: font.semibold, fontSize: 15, color: color.text, fontVariant: ['tabular-nums'] },
  sbar: { alignSelf: 'stretch', height: 34, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: color.hairlineStrong },
  scorePct: { fontFamily: font.medium, fontSize: 13, color: color.text3, fontVariant: ['tabular-nums'] },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  axis: { width: 22 },
  axisText: { textAlign: 'center', fontFamily: font.medium, fontSize: 12, color: color.text3 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', overflow: 'hidden' },
  cellText: { fontFamily: font.semibold, fontSize: 12, color: color.text, fontVariant: ['tabular-nums'] },
  formRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, gap: space.md },
  formName: { fontFamily: font.medium, fontSize: 15, color: color.text, flexShrink: 1 },
  fine: { ...type.footnote, lineHeight: 19, paddingTop: space.xs, paddingBottom: space.xxl },
});


