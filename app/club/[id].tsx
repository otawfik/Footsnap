/**
 * A club: follow it, its next fixtures (pick right here) and results, its squad as cards, and
 * how the model rates it: league position all season, attack and defence, projected finish.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, InteractionManager, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, NavBar, Segmented, Overline, KitChip, Row, Skeleton, Empty, tap, teamName, pctText } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { SnapCard } from '../../components/SnapCard';
import { MatchMarket, CompactMatchRow } from '../../components/Match';
import { useLeague } from '../../context/league';
import { LEAGUE_MAP } from '../../constants/leagues';
import { useCards, useClubColors, useSeason, useSettlePicks, useTable, useTeams } from '../../hooks/data';
import { fit, predict } from '../../lib/model';
import { isFinished, isLive, isUpcoming, recentForm } from '../../lib/football';
import { simulate, trajectory, Projection } from '../../lib/season';
import { applyPick, applyPress, pressedIn } from '../../lib/picks';
import { isFavorite, toggleFavorite, useCollection, useFavorites, usePicks } from '../../lib/storage';
import { lookOf } from '../../lib/collection';
import { clubColors } from '../../lib/colors';
import { SHOW_CRESTS } from '../../services/api';
import { color, font, space, type } from '../../constants/design';

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
const rel = (x: number) => `${x >= 1 ? '+' : '−'}${Math.abs(Math.round((x - 1) * 100))}%`;

export default function Club() {
  const { id, c } = useLocalSearchParams<{ id: string; c?: string }>();
  const teamId = Number(id);
  const ctx = useLeague();
  const league = (c && LEAGUE_MAP[Number(c)]) || ctx.league;
  const season = useSeason(league);
  const teams = useTeams(league);
  const standings = useTable(league);
  const colors = useClubColors(league);
  const { list, loading: cardsLoading } = useCards(league);
  const [collection] = useCollection();
  const [favorites, setFavorites] = useFavorites();
  const [picks, setPicks] = usePicks();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState(0);
  const [proj, setProj] = useState<Projection | null>(null);
  const matches = useMemo(() => season.data?.matches ?? [], [season.data]);
  useSettlePicks(matches);
  const team = teams.data?.teams.find((t) => t.id === teamId);
  const row = standings.table.find((r) => r.team.id === teamId);
  const cc = colors.get(teamId);
  const ratings = useMemo(() => fit(matches), [matches]);
  const owned = collection[String(league.id)] ?? {};
  const followed = isFavorite(favorites, teamId);
  const contentW = Math.min(width, 600) - space.gutter * 2;

  useEffect(() => {
    setProj(null);
    if (tab !== 2 || !ratings || !standings.table.length) return;
    const task = InteractionManager.runAfterInteractions(() => setProj(simulate(standings.table, matches, ratings, league.id, { runs: 2000 }).get(teamId) ?? null));
    return () => task.cancel();
  }, [tab, ratings, standings.table, matches, league.id, teamId]);

  const mine = (m: (typeof matches)[number]) => m.homeTeam.id === teamId || m.awayTeam.id === teamId;
  const next = matches.filter((m) => (isUpcoming(m) || isLive(m)) && mine(m)).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 4);
  const last = matches.filter((m) => isFinished(m) && mine(m)).sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 6);
  const squad = list.filter((x) => x.team.id === teamId);
  const traj = useMemo(() => trajectory(matches, teamId), [matches, teamId]);
  const attack = ratings?.attack.get(teamId);
  const defence = ratings?.defence.get(teamId);
  const name = team?.shortName ?? row?.team.shortName ?? row?.team.name ?? 'Club';
  const form = recentForm(matches, teamId);
  const venueOf = (tid: number) => teams.data?.teams.find((t) => t.id === tid)?.venue ?? undefined;
  const cols = 3;
  const cardW = Math.floor((contentW - 20) / cols);

  const follow = () => {
    tap('light');
    const t = team ?? row?.team;
    if (!t) return;
    setFavorites((f) =>
      toggleFavorite(f, { competitionId: league.id, teamId, name: t.shortName ?? t.name, tla: t.tla, colors: team ? clubColors(team.clubColors) : cc ?? clubColors(null) })
    );
  };

  return (
    <Screen tabBar={false}>
      <NavBar
        title={league.name}
        right={
          <Pressable onPress={follow} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: followed }} accessibilityLabel={followed ? `Following ${name}. Tap to unfollow` : `Follow ${name}`}>
            <Ionicons name={followed ? 'star' : 'star-outline'} size={24} color={followed ? color.accentText : color.text} />
          </Pressable>
        }
      />

      <View style={styles.hero}>
        {SHOW_CRESTS && team?.crest ? <Image source={{ uri: team.crest }} style={{ width: 64, height: 64 }} resizeMode="contain" accessibilityLabel={`${name} crest`} /> : <KitChip colors={cc} size={64} />}
        <Text style={[type.title, { textAlign: 'center' }]} accessibilityRole="header">{name}</Text>
        <Text style={styles.heroMeta}>
          {[row ? `${ordinal(row.position)} · ${row.points} pts` : null, form.length ? form.join(' ') : null].filter(Boolean).join(' · ')}
        </Text>
        {team?.venue || team?.coach?.name ? <Text style={type.footnote}>{[team?.coach?.name ? `Coach ${team.coach.name}` : null, team?.venue].filter(Boolean).join(' · ')}</Text> : null}
      </View>

      <Segmented options={['Fixtures', 'Squad', 'Stats']} value={tab} onChange={setTab} style={{ marginBottom: space.lg }} />

      {season.loading && !season.data ? (
        <Skeleton rows={3} height={110} gap={space.lg} />
      ) : tab === 0 ? (
        <View>
          {next.length ? (
            <View style={{ paddingBottom: space.xl }}>
              <Overline right="Free · points only">Next up</Overline>
              {next.map((m, i) => {
                const group = m.matchday ? matches.filter((x) => x.matchday === m.matchday) : [m];
                const other = pressedIn(picks, group.filter((x) => x.id !== m.id));
                return isLive(m) ? (
                  <CompactMatchRow key={m.id} match={m} homeColors={colors.get(m.homeTeam.id)} awayColors={colors.get(m.awayTeam.id)} onPress={() => router.push({ pathname: '/match/[id]', params: { id: String(m.id), c: String(league.id) } })} divider={i < next.length - 1} />
                ) : (
                  <MatchMarket
                    key={m.id}
                    match={m}
                    prediction={ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null}
                    pick={picks[String(m.id)]}
                    onPick={(o) => setPicks((all) => applyPick(all, m.id, o))}
                    homeColors={colors.get(m.homeTeam.id)}
                    awayColors={colors.get(m.awayTeam.id)}
                    venue={venueOf(m.homeTeam.id)}
                    competition={m.matchday ? `Matchday ${m.matchday}` : league.name}
                    onOpen={() => router.push({ pathname: '/match/[id]', params: { id: String(m.id), c: String(league.id) } })}
                    press={{ available: !other, onToggle: () => setPicks((all) => applyPress(all, m, group)) }}
                    divider={i < next.length - 1}
                  />
                );
              })}
            </View>
          ) : null}
          {last.length ? (
            <View>
              <Overline>Results</Overline>
              {last.map((m, i) => (
                <CompactMatchRow
                  key={m.id}
                  match={m}
                  homeColors={colors.get(m.homeTeam.id)}
                  awayColors={colors.get(m.awayTeam.id)}
                  pick={picks[String(m.id)]}
                  time={`${new Date(m.utcDate).getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date(m.utcDate).getMonth()]}`}
                  onPress={() => router.push({ pathname: '/match/[id]', params: { id: String(m.id), c: String(league.id) } })}
                  divider={i < last.length - 1}
                />
              ))}
            </View>
          ) : null}
          {!next.length && !last.length ? <Empty icon="calendar-outline" title="No fixtures yet" /> : null}
        </View>
      ) : tab === 1 ? (
        cardsLoading && !squad.length ? (
          <Skeleton rows={2} height={cardW * 1.4} />
        ) : !squad.length ? (
          <Empty icon="people-outline" title="No squad listed" text="football-data.org hasn't published this squad yet." />
        ) : (
          <View>
            <Text style={[type.footnote, { marginBottom: space.md }]}>{squad.filter((x) => owned[String(x.id)]).length} of {squad.length} collected</Text>
            <View style={styles.grid}>
              {squad.map((k, i) => (
                <Pressable key={k.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(k.id) } })} accessibilityRole="button" accessibilityLabel={`${k.name} card`}>
                  <SnapCard card={k} width={cardW} competition={league.name} collected={!!owned[String(k.id)]} loadPhoto={i < 12 || !!owned[String(k.id)]} look={lookOf(owned[String(k.id)])} />
                </Pressable>
              ))}
            </View>
          </View>
        )
      ) : (
        <View>
          {traj.length > 1 ? (
            <View style={{ paddingBottom: space.xl }}>
              <Overline>League position</Overline>
              <LineChart width={contentW} invert yMin={1} yMax={standings.table.length || 20} series={[{ label: name, points: traj.map((t) => ({ x: t.matchday, y: t.position })) }]} yLabel="Position" />
            </View>
          ) : null}
          {row ? (
            <View style={{ paddingBottom: space.xl }}>
              <Overline>Season</Overline>
              <Row title="Played" right={<Text style={styles.val}>{row.playedGames}</Text>} />
              <Row title="Won · drawn · lost" right={<Text style={styles.val}>{row.won} · {row.draw} · {row.lost}</Text>} />
              <Row title="Goals" right={<Text style={styles.val}>{row.goalsFor}–{row.goalsAgainst}</Text>} divider={false} />
            </View>
          ) : null}
          {attack !== undefined && defence !== undefined ? (
            <View style={{ paddingBottom: space.xl }}>
              <Overline right="vs an average side">Model ratings</Overline>
              <Row title="Attack" subtitle="Goals scored" right={<Text style={[styles.val, { color: attack >= 1 ? color.win : color.loss }]}>{rel(attack)}</Text>} />
              <Row title="Defence" subtitle="Goals conceded" right={<Text style={[styles.val, { color: defence <= 1 ? color.win : color.loss }]}>{rel(defence)}</Text>} divider={false} />
            </View>
          ) : null}
          {ratings ? (
            <View>
              <Overline right="2,000 simulations">Projection</Overline>
              {!proj ? (
                <Skeleton rows={4} height={44} />
              ) : (
                <>
                  <Row title="Projected finish" right={<Text style={styles.val}>{ordinal(Math.round(proj.avgPosition))} · {Math.round(proj.avgPoints)} pts</Text>} />
                  <Row title="Title" right={<Text style={styles.val}>{pctText(proj.title)}</Text>} />
                  <Row title={league.id === 2001 ? 'Top 8' : 'Top 4'} right={<Text style={styles.val}>{pctText(proj.top)}</Text>} />
                  <Row title={league.id === 2001 ? 'Out' : 'Relegation'} right={<Text style={[styles.val, proj.relegation >= 0.3 && { color: color.loss }]}>{pctText(proj.relegation)}</Text>} divider={false} />
                </>
              )}
            </View>
          ) : (
            <Empty icon="analytics-outline" title="Not enough results yet" text="Ratings and projections start after a few rounds." />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingTop: space.md, paddingBottom: space.xxl },
  heroMeta: { fontFamily: font.medium, fontSize: 14, color: color.text2, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 14 },
  val: { fontFamily: font.semibold, fontSize: 15, color: color.text, fontVariant: ['tabular-nums'] },
});
