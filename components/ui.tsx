/**
 * FootSnap UI primitives. Everything visual is built from these so the app
 * reads as one designed thing: chalk on floodlit green-black, club colours as
 * the only other colour, condensed scoreboard type.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Image, ViewStyle, StyleProp, TextStyle, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Line as SvgLine, Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S, T } from '../constants/theme';
import { LEAGUES, League } from '../constants/leagues';
import type { Team } from '../lib/types';
import type { Result } from '../lib/football';
import { alpha, ClubColors } from '../lib/colors';

export const tap = (kind: 'light' | 'medium' | 'heavy' | 'select' = 'light') => {
  if (Platform.OS === 'web') return;
  if (kind === 'select') Haptics.selectionAsync().catch(() => {});
  else Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
};

/** Pitch markings: the centre circle and halfway line, faint, behind every screen header. */
function PitchMotif() {
  return (
    <Svg width="100%" height={220} viewBox="0 0 400 220" preserveAspectRatio="xMidYMin slice" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={330} cy={40} r={92} stroke={C.line} strokeWidth={1.5} fill="none" />
      <Circle cx={330} cy={40} r={4} fill={C.line} />
      <SvgLine x1={330} y1={-60} x2={330} y2={220} stroke={C.line} strokeWidth={1.5} />
      <Rect x={-40} y={150} width={480} height={0.75} fill={C.line} />
    </Svg>
  );
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  motif = true,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  motif?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {motif ? <PitchMotif /> : null}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.chalk} colors={[C.flare]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function Header({ kicker, title, right }: { kicker?: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={T.kicker}>{kicker}</Text> : null}
        <Text style={T.hero} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** League switcher: condensed text tabs with a flare underline. */
export function LeagueTabs({ value, onChange }: { value: number; onChange: (l: League) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
      {LEAGUES.map((l) => {
        const on = l.id === value;
        return (
          <Pressable
            key={l.id}
            onPress={() => {
              if (!on) tap('select');
              onChange(l);
            }}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={l.name}
            hitSlop={6}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{l.code}</Text>
            <View style={[styles.tabBar, on && styles.tabBarOn]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Section({ title, note, action, children, style }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={T.h2}>{title}</Text>
          {note ? <Text style={[T.small, { marginTop: 2 }]}>{note}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Panel({ children, style, onPress, accent, label }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string; label?: string }) {
  const body = (
    <>
      {accent ? <View style={[styles.panelAccent, { backgroundColor: accent }]} /> : null}
      {children}
    </>
  );
  if (!onPress) return <View style={[styles.panel, style]}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.panel, pressed && { backgroundColor: C.turf }, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
    </Pressable>
  );
}

/** A club crest, or a disc in the club's colours when there's no image. */
export function Crest({ team, size = 28, colors }: { team: Pick<Team, 'name' | 'crest'>; size?: number; colors?: ClubColors }) {
  if (team.crest) {
    return <Image source={{ uri: team.crest }} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={`${team.name} crest`} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors?.primary ?? C.turf, borderWidth: 2, borderColor: colors?.secondary ?? C.line }} />
  );
}

/** Two-tone kit stripe: the quickest way to know whose row this is. */
export function KitStripe({ colors, height = 28, width = 4 }: { colors?: ClubColors; height?: number; width?: number }) {
  return (
    <View style={{ width, height, borderRadius: width, overflow: 'hidden' }}>
      <View style={{ flex: 1, backgroundColor: colors?.primary ?? C.line }} />
      <View style={{ flex: 1, backgroundColor: colors?.secondary ?? C.lineHi }} />
    </View>
  );
}

export const teamName = (t: Pick<Team, 'name' | 'shortName'>) => t.shortName ?? t.name;

export function Form({ results, size = 8 }: { results: Result[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessible accessibilityLabel={`Form: ${results.join(' ') || 'none yet'}`}>
      {results.map((r, i) => (
        <View
          key={i}
          style={{ width: size, height: size, borderRadius: 2, backgroundColor: r === 'W' ? C.win : r === 'L' ? C.loss : C.draw }}
        />
      ))}
    </View>
  );
}

/** Home / draw / away split bar in the two clubs' colours. */
export function OddsBar({ home, draw, away, homeColor, awayColor, labels = true }: { home: number; draw: number; away: number; homeColor: string; awayColor: string; labels?: boolean }) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <View accessible accessibilityLabel={`Model odds: home ${pct(home)}, draw ${pct(draw)}, away ${pct(away)}`}>
      <View style={styles.odds}>
        <View style={{ flex: Math.max(home, 0.02), backgroundColor: homeColor }} />
        <View style={{ flex: Math.max(draw, 0.02), backgroundColor: C.lineHi }} />
        <View style={{ flex: Math.max(away, 0.02), backgroundColor: awayColor }} />
      </View>
      {labels ? (
        <View style={styles.oddsLabels}>
          <Text style={styles.oddsNum}>{pct(home)}</Text>
          <Text style={[styles.oddsNum, { color: C.muted }]}>DRAW {pct(draw)}</Text>
          <Text style={styles.oddsNum}>{pct(away)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Pill({ label, active, onPress, color = C.flare }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable
      onPress={() => {
        tap('select');
        onPress?.();
      }}
      style={[styles.pill, active && { backgroundColor: alpha(color, 0.16), borderColor: color }]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.pillText, active && { color: C.chalk }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; icon?: React.ComponentProps<typeof Ionicons>['name']; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tap('medium');
        onPress();
      }}
      style={({ pressed }) => [styles.btn, kind === 'ghost' && styles.btnGhost, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
    >
      {icon ? <Ionicons name={icon} size={18} color={kind === 'primary' ? C.night : C.chalk} /> : null}
      <Text style={[styles.btnText, kind === 'ghost' && { color: C.chalk }]}>{label}</Text>
    </Pressable>
  );
}

/** Pulsing placeholder blocks instead of spinners. */
export function Skeleton({ rows = 3, height = 72 }: { rows?: number; height?: number }) {
  const o = useSharedValue(0.45);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(0.9, { duration: 700 }), withTiming(0.45, { duration: 700 })), -1);
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={{ gap: S.sm }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={[{ height, borderRadius: R.md, backgroundColor: C.pitch, borderWidth: 1, borderColor: C.line }, st]} />
      ))}
    </View>
  );
}

export function Empty({ icon = 'football-outline', title, text }: { icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={26} color={C.muted} />
      <Text style={[T.label, { color: C.chalk, fontSize: 16 }]}>{title}</Text>
      {text ? <Text style={[T.small, { textAlign: 'center' }]}>{text}</Text> : null}
    </View>
  );
}

export function Failed({ message, code, onRetry }: { message: string; code?: string; onRetry?: () => void }) {
  const title = code === 'RATE_LIMIT' ? 'Busy for a moment' : code === 'NO_KEY' ? 'Live data unavailable' : "Couldn't load this";
  const text =
    code === 'RATE_LIMIT'
      ? 'The free data feed is taking a breather. Retrying on its own.'
      : code === 'NO_KEY'
      ? "FootSnap can't reach its data service right now. Try again in a little while."
      : message;
  return (
    <View style={[styles.empty, { borderColor: alpha(C.draw, 0.35), backgroundColor: alpha(C.draw, 0.06) }]}>
      <Ionicons name={code === 'RATE_LIMIT' ? 'timer-outline' : 'cloud-offline-outline'} size={24} color={C.draw} />
      <Text style={[T.label, { color: C.chalk, fontSize: 16 }]}>{title}</Text>
      <Text style={[T.small, { textAlign: 'center' }]}>{text}</Text>
      {onRetry && code !== 'RATE_LIMIT' ? <Button label="Try again" kind="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

/** A thin "LIVE" lamp that breathes. */
export function LiveLamp({ label = 'LIVE' }: { label?: string }) {
  const o = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(0.25, { duration: 650, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 650 })), -1);
  }, [o, reduced]);
  const dot = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={styles.live}>
      <Animated.View style={[styles.liveDot, dot]} />
      <Text style={styles.liveText}>{label}</Text>
    </View>
  );
}

export function Num({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.num, style]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.night },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: S.base, paddingTop: S.lg, paddingBottom: S.sm, gap: S.md },
  tabs: { paddingHorizontal: S.base, gap: S.lg, paddingVertical: S.sm },
  tab: { alignItems: 'center', paddingTop: 4 },
  tabText: { fontFamily: F.label, fontSize: 15, letterSpacing: 1.2, color: C.muted },
  tabTextOn: { color: C.chalk },
  tabBar: { height: 3, alignSelf: 'stretch', marginTop: 5, borderRadius: 2, backgroundColor: 'transparent' },
  tabBarOn: { backgroundColor: C.flare },
  section: { paddingHorizontal: S.base, marginTop: S.xl, gap: S.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: S.md },
  panel: { backgroundColor: C.pitch, borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  panelAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  odds: { flexDirection: 'row', height: 6, gap: 2, borderRadius: 3, overflow: 'hidden' },
  oddsLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  oddsNum: { fontFamily: F.num, fontSize: 13, color: C.chalk2, letterSpacing: 0.5 },
  pill: { paddingHorizontal: S.md, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, backgroundColor: C.pitch },
  pillText: { fontFamily: F.label, fontSize: 13, letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, backgroundColor: C.chalk, paddingVertical: 13, paddingHorizontal: S.xl, borderRadius: R.sm },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.lineHi },
  btnText: { fontFamily: F.label, fontSize: 16, letterSpacing: 1, color: C.night, textTransform: 'uppercase' },
  empty: { alignItems: 'center', gap: S.sm, padding: S.xl, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.pitch },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.flare },
  liveText: { fontFamily: F.label, fontSize: 12, letterSpacing: 1.6, color: C.flare },
});

/** The credits coin: a gold hexagon, the in-app currency mark. */
export function Coin({ size = 14 }: { size?: number }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${size / 2 + (size / 2) * Math.cos(a)},${size / 2 + (size / 2) * Math.sin(a)}`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Path d={`M ${pts.split(' ').join(' L ')} Z`} fill={C.icon} />
      <Path d={`M ${size * 0.5} ${size * 0.25} L ${size * 0.5} ${size * 0.75}`} stroke={C.night} strokeWidth={size * 0.14} strokeLinecap="round" />
    </Svg>
  );
}

export function Wallet({ credits }: { credits: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: alpha(C.icon, 0.12), borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 }} accessible accessibilityLabel={`${credits} credits`}>
      <Coin size={13} />
      <Text style={{ fontFamily: F.num, fontSize: 15, color: C.icon }}>{credits}</Text>
    </View>
  );
}

/** False during static web pre-rendering and the first client render, then true. Use it for anything that
 * depends on the clock or the device, so the pre-rendered HTML and the first render match. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
