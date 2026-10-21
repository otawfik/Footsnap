/**
 * Picks: call the next fixtures, Snap one a matchday to double the stakes, and
 * see whether you can beat the model. Picks lock at kick-off and settle on the
 * real result; everything is stored on the device.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, LeagueTabs, Section, Panel, Skeleton, Failed, Crest, Empty, tap, teamName } from '../../components/ui';
import { clock, dayLabel } from '../../components/Match';
import { useLeague } from '../../context/league';
import { useClubColors, useSeason } from '../../hooks/data';
import { usePicks, useProfile } from '../../lib/storage';
import { REWARDS } from '../../lib/collection';
import { locked, modelCall, points, tally, UserPick } from '../../lib/picks';
import { isFinished, isUpcoming } from '../../lib/football';
import { outcome, Outcome } from '../../lib/model';
import type { Match } from '../../lib/types';
import type { ClubColors } from '../../lib/colors';
import { alpha } from '../../lib/colors';
import { C, F, R, S, T } from '../../constants/theme';

const LABEL: Record<Outcome, string> = { H: 'HOME', D: 'DRAW', A: 'AWAY' };

function Choice({ label, on, color, onPress, disabled }: { label: string; on: boolean; color: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, on && { backgroundColor: alpha(color, 0.18), borderColor: color }, disabled && !on && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
    >
      <Text style={[styles.choiceText, on && { color: C.chalk }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function PickRow({ m, pick, colors, snapTaken, onPick, onSnap, model }: {
  m: Match;
  pick?: UserPick;
  colors: Map<number, ClubColors>;
  snapTaken: boolean;
  onPick: (o: Outcome) => void;
  onSnap: () => void;
  model: { outcome: Outcome; confidence: number } | null;
}) {
  const hc = colors.get(m.homeTeam.id)?.accent ?? C.chalk2;
  const ac = colors.get(m.awayTeam.id)?.accent ?? C.chalk2;
  const isLocked = locked(m);
  const scale = useSharedValue(1);
  const snapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Panel style={styles.pick}>
      <View style={styles.pickTop}>
        <Text style={styles.kick}>{dayLabel(m.utcDate).toUpperCase()} · {clock(m.utcDate)}</Text>
        {isLocked ? <Text style={T.kicker}>LOCKED</Text> : null}
      </View>
      <View style={styles.teams}>
        <View style={styles.side}>
          <Crest team={m.homeTeam} size={26} colors={colors.get(m.homeTeam.id)} />
          <Text style={styles.name} numberOfLines={1}>{teamName(m.homeTeam)}</Text>
        </View>
        <Text style={T.kicker}>VS</Text>
        <View style={[styles.side, { justifyContent: 'flex-end' }]}>
          <Text style={[styles.name, { textAlign: 'right' }]} numberOfLines={1}>{teamName(m.awayTeam)}</Text>
          <Crest team={m.awayTeam} size={26} colors={colors.get(m.awayTeam.id)} />
        </View>
      </View>
      <View style={styles.choices}>
        <Choice label={teamName(m.homeTeam).toUpperCase()} on={pick?.outcome === 'H'} color={hc} disabled={isLocked} onPress={() => onPick('H')} />
        <Choice label="DRAW" on={pick?.outcome === 'D'} color={C.chalk2} disabled={isLocked} onPress={() => onPick('D')} />
        <Choice label={teamName(m.awayTeam).toUpperCase()} on={pick?.outcome === 'A'} color={ac} disabled={isLocked} onPress={() => onPick('A')} />
        <Animated.View style={snapStyle}>
          <Pressable
            disabled={isLocked || !pick || (snapTaken && !pick.snapped)}
            onPress={() => {
              scale.value = 1.25;
              scale.value = withSpring(1, { damping: 6, stiffness: 220 });
              onSnap();
            }}
            style={[styles.snap, pick?.snapped && styles.snapOn, (isLocked || !pick || (snapTaken && !pick?.snapped)) && { opacity: 0.35 }]}
            accessibilityRole="button"
            accessibilityLabel={pick?.snapped ? 'Pressed: double stakes. Tap to undo' : 'Press this pick to double the stakes'}
          >
            <Ionicons name="flash" size={18} color={pick?.snapped ? C.night : C.flare} />
          </Pressable>
        </Animated.View>
      </View>
      {pick && model ? (
        <Text style={T.small}>
          Model's call: <Text style={{ color: C.chalk, fontFamily: F.bodyBold }}>{model.outcome === 'D' ? 'Draw' : model.outcome === 'H' ? teamName(m.homeTeam) : teamName(m.awayTeam)}</Text> ({Math.round(model.confidence * 100)}%)
        </Text>
      ) : null}
    </Panel>
  );
}

export default function Picks() {
  const { league, setLeague } = useLeague();
  const season = useSeason(league);
  const colors = useClubColors(league);
  const [picks, setPicks] = usePicks();
  const [profile, setProfile] = useProfile();
  const matches = season.data?.matches ?? [];

  // the next matchday that still has fixtures open
  const open = useMemo(() => {
    const upcoming = matches.filter((m) => isUpcoming(m)).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    if (!upcoming.length) return [];
    const md = upcoming[0].matchday;
    return (md ? upcoming.filter((m) => m.matchday === md) : upcoming.slice(0, 10)).slice(0, 12);
  }, [matches]);

  const mine = useMemo(() => Object.values(picks).filter((p) => matches.some((m) => m.id === p.matchId)), [picks, matches]);
  const score = useMemo(() => tally(mine, matches), [mine, matches]);
  const calls = useMemo(() => new Map(open.map((m) => [m.id, modelCall(matches, m)])), [open, matches]);
  const allSettled = useMemo(
    () =>
      mine
        .map((p) => ({ p, m: matches.find((x) => x.id === p.matchId)! }))
        .filter((x) => x.m && isFinished(x.m))
        .sort((a, b) => b.m.utcDate.localeCompare(a.m.utcDate)),
    [mine, matches]
  );
  const settled = allSettled.slice(0, 15);
  // correct picks pay credits once each: +10, or +20 if Snapped
  useEffect(() => {
    const due = allSettled.filter(({ p, m }) => p.outcome === outcome(m) && !profile.creditedPicks.includes(m.id));
    if (!due.length) return;
    setProfile((pr) => ({
      ...pr,
      credits: pr.credits + due.reduce((s, { p }) => s + REWARDS.pickRight * (p.snapped ? 2 : 1), 0),
      creditedPicks: [...pr.creditedPicks, ...due.map(({ m }) => m.id)],
    }));
  }, [allSettled, profile.creditedPicks, setProfile]);
  const md = open[0]?.matchday ?? null;
  const snapTaken = open.some((m) => picks[String(m.id)]?.snapped);

  const setPick = (m: Match, o: Outcome) => {
    tap('select');
    setPicks((all) => {
      const cur = all[String(m.id)];
      if (cur?.outcome === o) {
        const { [String(m.id)]: _, ...rest } = all;
        return rest;
      }
      return { ...all, [String(m.id)]: { matchId: m.id, outcome: o, snapped: cur?.snapped ?? false } };
    });
  };
  const toggleSnap = (m: Match) => {
    tap('heavy');
    setPicks((all) => {
      const cur = all[String(m.id)];
      if (!cur) return all;
      return { ...all, [String(m.id)]: { ...cur, snapped: !cur.snapped } };
    });
  };

  return (
    <Screen>
      <Header kicker="You vs the model" title="Picks" />
      <LeagueTabs value={league.id} onChange={setLeague} />

      <View style={{ paddingHorizontal: S.base, marginTop: S.md }}>
        <Panel style={styles.board}>
          <View style={styles.boardSide}>
            <Text style={T.kicker}>YOU</Text>
            <Text style={[styles.boardNum, score.you >= score.model && score.settled > 0 && { color: C.flare }]}>{score.you}</Text>
            <Text style={T.small}>{score.settled ? `${score.youCorrect}/${score.settled} right` : 'No results yet'}</Text>
          </View>
          <View style={styles.boardMid}>
            <Ionicons name="flash" size={18} color={C.flare} />
          </View>
          <View style={styles.boardSide}>
            <Text style={T.kicker}>MODEL</Text>
            <Text style={[styles.boardNum, score.model > score.you && { color: C.flare }]}>{score.model}</Text>
            <Text style={T.small}>{score.settled ? `${score.modelCorrect}/${score.settled} right` : '—'}</Text>
          </View>
        </Panel>
        <Text style={[T.small, { marginTop: S.sm }]}>Right +2 · wrong 0 · Press one pick each matchday to double it: right +4, wrong −2. Every right pick also earns {REWARDS.pickRight} credits for upgrading cards ({REWARDS.pickRight * 2} if pressed).</Text>
      </View>

      {season.error && !season.data ? (
        <Section title="Picks">
          <Failed message={season.error} code={season.errorCode} onRetry={season.refetch} />
        </Section>
      ) : season.loading && !season.data ? (
        <Section title="Loading">
          <Skeleton rows={3} height={130} />
        </Section>
      ) : (
        <>
          <Section title={md ? `Matchday ${md}` : 'Next fixtures'} note={snapTaken ? 'Press used for this matchday' : 'Press still available'}>
            {open.length === 0 ? (
              <Empty icon="calendar-outline" title="No fixtures open" text="New picks open when the next matchday is scheduled." />
            ) : (
              open.map((m) => (
                <PickRow
                  key={m.id}
                  m={m}
                  pick={picks[String(m.id)]}
                  colors={colors}
                  snapTaken={snapTaken}
                  onPick={(o) => setPick(m, o)}
                  onSnap={() => toggleSnap(m)}
                  model={calls.get(m.id) ?? null}
                />
              ))
            )}
          </Section>

          {settled.length > 0 && (
            <Section title="Settled">
              <Panel>
                {settled.map(({ p, m }, i) => {
                  const right = p.outcome === outcome(m);
                  const pts = points(right, p.snapped);
                  return (
                    <View key={m.id} style={[styles.settled, i < settled.length - 1 && styles.line]}>
                      <Ionicons name={right ? 'checkmark-circle' : 'close-circle'} size={18} color={right ? C.win : C.loss} />
                      <Text style={styles.settledText} numberOfLines={1}>
                        {teamName(m.homeTeam)} {m.score.fullTime.home}–{m.score.fullTime.away} {teamName(m.awayTeam)}
                      </Text>
                      <Text style={styles.settledPick}>{LABEL[p.outcome]}{p.snapped ? ' · PRESS' : ''}</Text>
                      <Text style={[styles.settledPts, { color: pts > 0 ? C.win : pts < 0 ? C.loss : C.dim }]}>{pts > 0 ? `+${pts}` : pts}</Text>
                    </View>
                  );
                })}
              </Panel>
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', alignItems: 'center', padding: S.base },
  boardSide: { flex: 1, alignItems: 'center', gap: 2 },
  boardMid: { width: 40, alignItems: 'center' },
  boardNum: { fontFamily: F.numHeavy, fontSize: 48, color: C.chalk, lineHeight: 52 },
  pick: { padding: S.base, gap: S.md },
  pickTop: { flexDirection: 'row', justifyContent: 'space-between' },
  kick: { fontFamily: F.label, fontSize: 12, letterSpacing: 1.2, color: C.chalk2 },
  teams: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: F.bodyBold, fontSize: 15, color: C.chalk, flexShrink: 1 },
  choices: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  choice: { flex: 1, height: 38, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.night, paddingHorizontal: 4 },
  choiceText: { fontFamily: F.label, fontSize: 12, letterSpacing: 0.8, color: C.muted },
  snap: { width: 40, height: 38, borderRadius: R.sm, borderWidth: 1, borderColor: C.flare, alignItems: 'center', justifyContent: 'center' },
  snapOn: { backgroundColor: C.flare },
  settled: { flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.md },
  line: { borderBottomWidth: 1, borderBottomColor: C.line },
  settledText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 13, color: C.chalk },
  settledPick: { fontFamily: F.label, fontSize: 12, letterSpacing: 1, color: C.chalk2 },
  settledPts: { width: 30, textAlign: 'right', fontFamily: F.numHeavy, fontSize: 16 },
});
