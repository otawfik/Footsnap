/** Match components: the live scoreboard, result rows and fixture cards. */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, useReducedMotion, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Crest, KitStripe, LiveLamp, OddsBar, Panel, teamName } from './ui';
import type { Match } from '../lib/types';
import type { Prediction } from '../lib/model';
import type { ClubColors } from '../lib/colors';
import { alpha } from '../lib/colors';
import { C, F, R, S, T } from '../constants/theme';

export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const t = new Date(now);
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(t.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A score digit that rolls up into place when it changes. */
function RollingNumber({ value, size, color }: { value: number; size: number; color: string }) {
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  const first = useRef(true);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    y.value = size * 0.6;
    o.value = 0;
    y.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.back(1.6)) });
    o.value = withTiming(1, { duration: 260 });
  }, [value, size, reduced, y, o]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: o.value }));
  return (
    <View style={{ height: size * 1.05, overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.Text style={[{ fontFamily: F.numHeavy, fontSize: size, lineHeight: size * 1.05, color, fontVariant: ['tabular-nums'] }, st]}>{value}</Animated.Text>
    </View>
  );
}

// goals seen per match across re-renders and polls, to spot a new goal
const seenGoals = new Map<number, number>();

export function Scoreboard({ match, colors }: { match: Match; colors: Map<number, ClubColors> }) {
  const hc = colors.get(match.homeTeam.id);
  const ac = colors.get(match.awayTeam.id);
  const home = match.score.fullTime.home ?? 0;
  const away = match.score.fullTime.away ?? 0;
  const flash = useSharedValue(0);
  const reduced = useReducedMotion();
  const status = match.status === 'PAUSED' ? 'HALF TIME' : match.status === 'EXTRA_TIME' ? 'EXTRA TIME' : match.status === 'PENALTY_SHOOTOUT' ? 'PENALTIES' : 'LIVE';

  useEffect(() => {
    const total = home + away;
    const before = seenGoals.get(match.id);
    seenGoals.set(match.id, total);
    if (before !== undefined && total > before) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash.value = reduced ? 0 : withSequence(withTiming(1, { duration: 180 }), withDelay(1600, withTiming(0, { duration: 900 })));
    }
  }, [home, away, match.id, flash, reduced]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <Panel style={styles.board}>
      <View style={styles.boardTop}>
        <LiveLamp label={status} />
        <Text style={T.kicker}>Updating every 30s</Text>
      </View>
      <View style={styles.boardRow}>
        <KitStripe colors={hc} height={56} width={5} />
        <View style={styles.boardTeam}>
          <Crest team={match.homeTeam} size={40} colors={hc} />
          <Text style={styles.boardName} numberOfLines={1}>{teamName(match.homeTeam).toUpperCase()}</Text>
        </View>
        <View style={styles.boardScore}>
          <RollingNumber value={home} size={52} color={C.chalk} />
          <Text style={[styles.dash]}>–</Text>
          <RollingNumber value={away} size={52} color={C.chalk} />
        </View>
        <View style={styles.boardTeam}>
          <Crest team={match.awayTeam} size={40} colors={ac} />
          <Text style={styles.boardName} numberOfLines={1}>{teamName(match.awayTeam).toUpperCase()}</Text>
        </View>
        <KitStripe colors={ac} height={56} width={5} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.goal, flashStyle]} pointerEvents="none">
        <Text style={styles.goalText}>GOAL</Text>
      </Animated.View>
    </Panel>
  );
}

/** One finished match as a compact scoreboard row. */
export function ResultRow({ match, colors, last }: { match: Match; colors: Map<number, ClubColors>; last?: boolean }) {
  const { home, away } = match.score.fullTime;
  const w = match.score.winner;
  return (
    <View style={[styles.row, !last && styles.rowLine]} accessible accessibilityLabel={`${match.homeTeam.name} ${home} ${match.awayTeam.name} ${away}`}>
      <Text style={[styles.rowDay]}>{dayLabel(match.utcDate).toUpperCase()}</Text>
      <View style={[styles.rowSide, { justifyContent: 'flex-end' }]}>
        <Text style={[styles.rowName, w === 'AWAY_TEAM' && styles.rowLoser]} numberOfLines={1}>{teamName(match.homeTeam)}</Text>
        <Crest team={match.homeTeam} size={20} colors={colors.get(match.homeTeam.id)} />
      </View>
      <View style={styles.rowScore}>
        <Text style={styles.rowNum}>{home ?? 0}</Text>
        <Text style={[styles.rowNum, { color: C.dim }]}>:</Text>
        <Text style={styles.rowNum}>{away ?? 0}</Text>
      </View>
      <View style={styles.rowSide}>
        <Crest team={match.awayTeam} size={20} colors={colors.get(match.awayTeam.id)} />
        <Text style={[styles.rowName, w === 'HOME_TEAM' && styles.rowLoser]} numberOfLines={1}>{teamName(match.awayTeam)}</Text>
      </View>
    </View>
  );
}

/** A fixture to come, with the model's odds when it has enough results. */
export function FixtureCard({ match, colors, prediction, onPress }: { match: Match; colors: Map<number, ClubColors>; prediction?: Prediction | null; onPress?: () => void }) {
  const hc = colors.get(match.homeTeam.id);
  const ac = colors.get(match.awayTeam.id);
  return (
    <Panel style={styles.fixture} onPress={onPress} label={`${match.homeTeam.name} against ${match.awayTeam.name}`}>
      <View style={styles.fixtureTop}>
        <Text style={styles.kick}>{dayLabel(match.utcDate).toUpperCase()} · {clock(match.utcDate)}</Text>
        {match.matchday ? <Text style={T.kicker}>MD {match.matchday}</Text> : null}
      </View>
      <View style={styles.fixtureRow}>
        <View style={styles.fixtureTeam}>
          <Crest team={match.homeTeam} size={34} colors={hc} />
          <Text style={styles.fixtureName} numberOfLines={1}>{teamName(match.homeTeam)}</Text>
        </View>
        <View style={styles.fixtureMid}>
          {prediction ? (
            <>
              <Text style={styles.likely}>{prediction.score[0]}–{prediction.score[1]}</Text>
              <Text style={[T.kicker, { fontSize: 10 }]}>LIKELIEST</Text>
            </>
          ) : (
            <Text style={[T.kicker]}>VS</Text>
          )}
        </View>
        <View style={styles.fixtureTeam}>
          <Crest team={match.awayTeam} size={34} colors={ac} />
          <Text style={styles.fixtureName} numberOfLines={1}>{teamName(match.awayTeam)}</Text>
        </View>
      </View>
      {prediction ? (
        <OddsBar home={prediction.home} draw={prediction.draw} away={prediction.away} homeColor={hc?.accent ?? C.chalk2} awayColor={ac?.accent ?? C.chalk2} />
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  board: { padding: S.base, gap: S.md, borderColor: alpha(C.flare, 0.4) },
  boardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  boardTeam: { flex: 1, alignItems: 'center', gap: 6 },
  boardName: { fontFamily: F.label, fontSize: 14, letterSpacing: 1, color: C.chalk },
  boardScore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dash: { fontFamily: F.numHeavy, fontSize: 40, color: C.dim },
  goal: { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.flare, 0.92) },
  goalText: { fontFamily: F.display, fontSize: 64, color: C.night, letterSpacing: 6 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: S.md, gap: S.sm },
  rowLine: { borderBottomWidth: 1, borderBottomColor: C.line },
  rowDay: { width: 62, fontFamily: F.label, fontSize: 10, letterSpacing: 1, color: C.dim },
  rowSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontFamily: F.bodyBold, fontSize: 14, color: C.chalk, flexShrink: 1 },
  rowLoser: { color: C.muted, fontFamily: F.bodyMedium },
  rowScore: { flexDirection: 'row', gap: 4, minWidth: 48, justifyContent: 'center', backgroundColor: C.turf, borderRadius: R.xs, paddingVertical: 2, paddingHorizontal: 6 },
  rowNum: { fontFamily: F.numHeavy, fontSize: 18, color: C.chalk },

  fixture: { padding: S.base, gap: S.md },
  fixtureTop: { flexDirection: 'row', justifyContent: 'space-between' },
  kick: { fontFamily: F.label, fontSize: 12, letterSpacing: 1.2, color: C.chalk2 },
  fixtureRow: { flexDirection: 'row', alignItems: 'center' },
  fixtureTeam: { flex: 1, alignItems: 'center', gap: 6 },
  fixtureName: { fontFamily: F.bodyBold, fontSize: 14, color: C.chalk },
  fixtureMid: { width: 88, alignItems: 'center' },
  likely: { fontFamily: F.numHeavy, fontSize: 30, color: C.chalk },
});
