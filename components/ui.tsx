/**
 * FootSnap UI primitives, design system v2.1 (docs/redesign/SPEC.md §3, tokens in constants/design.ts).
 *
 * A calm shell on ink navy: hairline rows instead of boxes, big tabular numbers, chalk for the
 * primary action, pitch green for links and progress. Colour comes from the clubs: anything
 * about one team is drawn in its kit (clubTone / fixtureTones / solidFill / onFill below), and
 * broadcast moments (ScoreBug, KitField, straps) set times and scores like a TV graphic.
 * Club colours are only ever text through clubText(), which guarantees 4.5:1.
 *
 * The names exported by the v1 shell (Header, Section, Panel, Pill, LeagueTabs, Form, OddsBar,
 * Crest, KitStripe, LiveLamp, Num, Coin, Wallet…) are kept and restyled, so screens that
 * haven't moved to the new components keep compiling and look at home.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Image,
  ViewStyle,
  StyleProp,
  TextStyle,
  Platform,
  Modal,
  Switch,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Polygon, RadialGradient, Rect, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { color, font, kitChip, motion, radius, size, space, type } from '../constants/design';
import { LEAGUES, League } from '../constants/leagues';
import { useLeague } from '../context/league';
import type { Team } from '../lib/types';
import type { Result } from '../lib/football';
import { alpha, ClubColors, contrast, mix } from '../lib/colors';
import { subscribeOffline } from '../services/api';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const easeOut = Easing.bezier(...motion.easeOut);
const easeInOut = Easing.bezier(...motion.easeInOut);

/** Haptics: select on segment or tab change, light on pick, medium on pack tear, heavy on an Icon reveal or a duel win. */
export const tap = (kind: 'light' | 'medium' | 'heavy' | 'select' = 'light') => {
  if (Platform.OS === 'web') return;
  if (kind === 'select') Haptics.selectionAsync().catch(() => {});
  else
    Haptics.impactAsync(
      kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
    ).catch(() => {});
};

/** Whole percentages, "<1%" instead of "0%", ">99%" instead of "100%" (SPEC §10). */
export const pctText = (p: number, sign = true) => {
  const s = sign ? '%' : '';
  if (p > 0 && p < 0.005) return `<1${s}`;
  if (p >= 0.995 && p < 1) return `>99${s}`;
  return `${Math.round(p * 100)}${s}`;
};

/** Tab bar height above the home indicator (SPEC §3: 49 plus the safe area). */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return size.tabBar + Math.max(insets.bottom, 8);
}


// ---------------------------------------------------------------- club colour (SPEC §2, "colour from football")

const near = (a: string, b: string) => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.hypot(p(a, 0) - p(b, 0), p(a, 1) - p(b, 1), p(a, 2) - p(b, 2)) < 70;
};

/**
 * A club's colour as a graphic (bars, stripes, fields) on `ground`: its primary, unless that
 * would vanish (under 2.2:1, e.g. navy on the ink ground), then its secondary, then the
 * primary lifted toward white until it shows.
 */
export function clubTone(c?: ClubColors | null, ground: string = color.bg): string {
  if (!c) return color.text3;
  for (const x of [c.primary, c.secondary]) if (contrast(x, ground) >= 2.2) return x;
  for (let t = 0.2; t <= 1; t += 0.2) {
    const x = mix(c.primary, '#FFFFFF', t);
    if (contrast(x, ground) >= 2.2) return x;
  }
  return '#FFFFFF';
}

/** Home and away tones for one fixture. Two red clubs (Liverpool v Arsenal) can't both be red, so the away side takes its other colour. */
export function fixtureTones(h?: ClubColors | null, a?: ClubColors | null, ground: string = color.bg): [string, string] {
  const th = clubTone(h, ground);
  let ta = clubTone(a, ground);
  if (near(th, ta)) {
    // the away side's other colour, lifted until it shows on the ground (Spurs navy → a visible navy)
    let pick: string | null = null;
    for (const alt of [a?.secondary, a?.primary]) {
      if (!alt || near(th, alt) || pick) continue;
      for (let t = 0; t <= 0.8 && !pick; t += 0.1) {
        const x = t ? mix(alt, '#FFFFFF', t) : alt;
        if (contrast(x, ground) >= 2.2 && !near(th, x)) pick = x;
      }
    }
    // no usable second colour: a darker or lighter version of the same kit, whichever is further from home
    ta = pick ?? (contrast(th, '#FFFFFF') < 3 ? mix(th, '#5A6580', 0.6) : mix(ta, '#FFFFFF', 0.55));
  }
  return [th, ta];
}

/** Ink or chalk, whichever reads better on `fill`. */
export const onFill = (fill: string) => (contrast(color.onChalk, fill) >= contrast(color.chalk, fill) ? color.onChalk : color.chalk);

/** `tone` as a solid fill that carries text: darkened just enough that ink or chalk clears 4.5:1 on it. */
export function solidFill(tone: string): string {
  for (let t = 0; t <= 0.7; t += 0.05) {
    const f = t ? mix(tone, '#000000', t) : tone;
    if (Math.max(contrast(color.chalk, f), contrast(color.onChalk, f)) >= 4.5) return f;
  }
  return mix(tone, '#000000', 0.7);
}

/** Any tone made safe as text on `ground` (≥ 4.5:1), lifted toward chalk until it reads. */
export function toneText(tone: string, ground: string = color.bg): string {
  for (let t = 0; t <= 1; t += 0.1) {
    const x = t ? mix(tone, color.chalk, t) : tone;
    if (contrast(x, ground) >= 4.5) return x;
  }
  return color.text;
}

/** A club colour safe as text on `ground` (≥ 4.5:1): the tone, lifted toward chalk until it reads. */
export function clubText(c?: ClubColors | null, ground: string = color.bg): string {
  const base = clubTone(c, ground);
  for (let t = 0; t <= 1; t += 0.1) {
    const x = t ? mix(base, color.chalk, t) : base;
    if (contrast(x, ground) >= 4.5) return x;
  }
  return color.text;
}

// ---------------------------------------------------------------- screen

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  gutter = true,
  tabBar = true,
  style,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** 20 pt side gutters (default). Turn off for full-bleed layouts; use <Bleed> for one full-bleed row instead. */
  gutter?: boolean;
  /** bottom padding for the floating tab bar (default) */
  tabBar?: boolean;
  /** @deprecated v1 prop, ignored */
  motif?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bar = useTabBarHeight();
  const pad = { paddingHorizontal: gutter ? space.gutter : 0 };
  return (
    <SafeAreaView style={[styles.safe, style]} edges={['top']}>
      <OfflineNote />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[pad, { paddingBottom: (tabBar ? bar : 0) + space.x3 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.text2} colors={[color.accent]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Cancels the screen gutter for one full-bleed row (horizontal scrollers). */
export function Bleed({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ marginHorizontal: -space.gutter }, style]}>{children}</View>;
}

/** When the data on screen is older than the network's: since what time, or null if everything is live. */
export function useOffline() {
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => subscribeOffline(setSince), []);
  return since;
}

/** A slim line under the status bar while any screen is showing a saved copy instead of live data. */
function OfflineNote() {
  const since = useOffline();
  if (since === null) return null;
  const d = new Date(since);
  const sameDay = d.toDateString() === new Date().toDateString();
  const when = sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={14} color={color.text2} />
      <Text style={styles.offlineText}>Offline · showing data saved {sameDay ? 'at ' : 'on '}{when}</Text>
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

// ---------------------------------------------------------------- press feedback

/** A Pressable that scales to 0.97 while pressed (120 ms); opacity only under reduced motion. */
export function PressScale({
  children,
  style,
  onPress,
  disabled,
  pressedStyle,
  scaleTo = 0.97,
  ...a11y
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  scaleTo?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'radio' | 'switch' | 'checkbox';
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean };
  accessibilityHint?: string;
  hitSlop?: number;
}) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        if (!reduced) s.value = withTiming(scaleTo, { duration: motion.fast, easing: easeOut });
      }}
      onPressOut={() => {
        setPressed(false);
        if (!reduced) s.value = withTiming(1, { duration: motion.fast, easing: easeOut });
      }}
      accessibilityRole={a11y.accessibilityRole ?? 'button'}
      accessibilityLabel={a11y.accessibilityLabel}
      accessibilityState={a11y.accessibilityState ?? (disabled ? { disabled } : undefined)}
      accessibilityHint={a11y.accessibilityHint}
      hitSlop={a11y.hitSlop}
    >
      <Animated.View style={[style, st, pressed && pressedStyle, reduced && pressed && { opacity: 0.7 }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- headers

/** The league menu: a Sheet with the six competitions. The selection is global (context/league.tsx). */
export function LeagueSheet({ visible, onClose, value, onChange }: { visible: boolean; onClose: () => void; value?: number; onChange?: (l: League) => void }) {
  const { league, setLeague } = useLeague();
  const current = value ?? league.id;
  return (
    <Sheet visible={visible} onClose={onClose} title="Competition">
      {LEAGUES.map((l, i) => (
        <Row
          key={l.id}
          title={l.name}
          subtitle={l.nation ?? 'Europe'}
          divider={i < LEAGUES.length - 1}
          right={l.id === current ? <Ionicons name="checkmark" size={20} color={color.accentText} /> : undefined}
          onPress={() => {
            tap('select');
            (onChange ?? setLeague)(l);
            onClose();
          }}
          accessibilityState={{ selected: l.id === current }}
        />
      ))}
    </Sheet>
  );
}

/**
 * Tab title. `eyebrow` sits above in footnote `text3` (the date, or the league menu).
 * `leagueMenu` makes the eyebrow "Premier League ⌄" and wires it to the league Sheet.
 */
export function LargeHeader({
  title,
  eyebrow,
  onEyebrowPress,
  right,
  leagueMenu,
}: {
  title: string;
  eyebrow?: string;
  onEyebrowPress?: () => void;
  right?: React.ReactNode;
  leagueMenu?: boolean;
}) {
  const { league } = useLeague();
  const [open, setOpen] = useState(false);
  const label = leagueMenu ? league.name : eyebrow;
  const press = leagueMenu ? () => setOpen(true) : onEyebrowPress;
  return (
    <View style={styles.large}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {label ? (
          press ? (
            <Pressable
              onPress={() => {
                tap('select');
                press();
              }}
              hitSlop={8}
              style={styles.eyebrowBtn}
              accessibilityRole="button"
              accessibilityLabel={`${label}. Change competition`}
            >
              <Text style={[styles.eyebrow, { color: color.text2 }]} numberOfLines={1}>{label}</Text>
              <Ionicons name="chevron-down" size={14} color={color.text2} />
            </Pressable>
          ) : (
            <Text style={styles.eyebrow} numberOfLines={1}>{label}</Text>
          )
        ) : null}
        <Text style={type.largeTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      </View>
      {right ? <View style={styles.largeRight}>{right}</View> : null}
      {leagueMenu ? <LeagueSheet visible={open} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** A pushed screen's bar: back chevron, a centred title, optional right action. 44 tall. */
export function NavBar({ title, onBack, right, back = 'chevron-back' }: { title?: string; onBack?: () => void; right?: React.ReactNode; back?: 'chevron-back' | 'close' }) {
  return (
    <View style={styles.nav}>
      <Pressable onPress={onBack ?? goBack} hitSlop={12} style={styles.navSide} accessibilityRole="button" accessibilityLabel={back === 'close' ? 'Close' : 'Back'}>
        <Ionicons name={back} size={26} color={color.text} />
      </Pressable>
      <Text style={styles.navTitle} numberOfLines={1}>{title ?? ''}</Text>
      <View style={[styles.navSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** A section title (20/700) with an optional `accentText` action. */
export function SectionHeader({ title, action, style }: { title: string; action?: { label: string; onPress: () => void }; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHead, style]}>
      <Text style={styles.sectionTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10} style={styles.sectionAction} accessibilityRole="button">
          <Text style={styles.sectionActionText}>{action.label}</Text>
          {/^(edit|done)$/i.test(action.label) ? null : <Ionicons name="chevron-forward" size={14} color={color.accentText} />}
        </Pressable>
      ) : null}
    </View>
  );
}

/** An overline ("MODEL'S CHANCE") with optional right-side note. */
export function Overline({ children, right, style }: { children: string; right?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.overlineRow, style]}>
      <Text style={type.overline} accessibilityRole="header">{children}</Text>
      {right ? <Text style={[type.caption, { fontSize: 13 }]}>{right}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- rows

/** A hairline list row: 52 min height, pressed background `raised`. */
export function Row({
  left,
  title,
  subtitle,
  right,
  onPress,
  chevron,
  divider = true,
  titleStyle,
  style,
  accessibilityLabel,
  accessibilityState,
}: {
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
  titleStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean };
}) {
  const body = (pressed: boolean) => (
    <View style={[styles.row, divider && styles.rowDivider, pressed && styles.rowPressed, style]}>
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, titleStyle]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={color.text3} /> : null}
    </View>
  );
  if (!onPress) return <View accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{body(false)}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)} accessibilityState={accessibilityState}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** iOS-style switch, `accent` when on. */
export function Toggle({ value, onValueChange, disabled, label }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        tap('select');
        onValueChange(v);
      }}
      disabled={disabled}
      trackColor={{ false: color.hairlineStrong, true: color.accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={color.hairlineStrong}
      accessibilityLabel={label}
      style={disabled ? { opacity: 0.4 } : undefined}
    />
  );
}

// ---------------------------------------------------------------- club marks

/**
 * The kit chip: a circle split at 135° (primary top-left, secondary bottom-right). It replaces
 * crests in every list row. `colors={null}` draws the empty "draw" ring.
 */
export function KitChip({ colors, size: s = size.kit, style }: { colors?: ClubColors | null; size?: number; style?: StyleProp<ViewStyle> }) {
  const id = useRef(`k${Math.random().toString(36).slice(2, 9)}`).current;
  if (colors === null) {
    return <View style={[{ width: s, height: s, borderRadius: s / 2, borderWidth: 1.5, borderColor: color.hairlineStrong }, style]} />;
  }
  const c1 = colors?.primary ?? '#3A3A41';
  const c2 = colors?.secondary ?? '#8A8A94';
  const r = s / 2;
  return (
    <View style={[{ width: s, height: s }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={s} height={s}>
        <Defs>
          <ClipPath id={id}>
            <Circle cx={r} cy={r} r={r} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${id})`}>
          <Rect x={0} y={0} width={s} height={s} fill={c2} />
          <Path d={`M0 0 L${s} 0 L0 ${s} Z`} fill={c1} />
        </G>
        <Circle cx={r} cy={r} r={r - 0.5} stroke="rgba(0,0,0,0.4)" strokeWidth={1} fill="none" />
        <Circle cx={r} cy={r} r={r - 1.5} stroke={kitChip.ring} strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}

/** A club crest, or a kit chip when there's no image (crests-off builds). Club page header only. */
export function Crest({ team, size: s = 28, colors }: { team: Pick<Team, 'name' | 'crest'>; size?: number; colors?: ClubColors }) {
  if (team.crest) {
    return <Image source={{ uri: team.crest }} style={{ width: s, height: s }} resizeMode="contain" accessibilityLabel={`${team.name} crest`} />;
  }
  return <KitChip colors={colors} size={s} />;
}

/**
 * The kit stripe: a vertical bar in the club's colours (primary 70%, secondary 30%), the mark
 * beside every team name in a list. `colors={null}` draws the quiet Draw stripe; `tone` overrides
 * the primary (fixtureTones, so two red clubs don't match).
 */
export function KitStripe({ colors, height = 28, width = 4, tone }: { colors?: ClubColors | null; height?: number; width?: number; tone?: string }) {
  if (colors === null) return <View style={{ width, height, borderRadius: 2, backgroundColor: color.hairlineStrong }} />;
  const top = tone ?? clubTone(colors);
  const second = colors?.secondary && !near(colors.secondary, top) ? colors.secondary : mix(top, color.bg, 0.45);
  return (
    <View style={{ width, height, borderRadius: 2, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ flex: 7, backgroundColor: top }} />
      <View style={{ flex: 3, backgroundColor: second }} />
    </View>
  );
}

/**
 * The score bug, set like a TV graphic: [club code on its colour][time or score on chalk][club code].
 * `center` is "16:30", "2–1" or "HT".
 */
export function ScoreBug({
  home,
  away,
  center,
  live,
  small,
  style,
}: {
  home: { code: string; colors?: ClubColors | null; tone?: string };
  away: { code: string; colors?: ClubColors | null; tone?: string };
  center: string;
  live?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const h = small ? 30 : 40;
  const tab = (t: { code: string; colors?: ClubColors | null; tone?: string }) => {
    const f = solidFill(t.tone ?? clubTone(t.colors));
    return (
      <View style={[styles.bugTab, { backgroundColor: f, height: h, minWidth: small ? 48 : 62 }]}>
        <Text style={[type.strap, { color: onFill(f), fontSize: small ? 11.5 : 14 }]}>{t.code}</Text>
      </View>
    );
  };
  return (
    <View style={[styles.bug, style]} accessible accessibilityLabel={`${home.code} ${center} ${away.code}`}>
      {tab(home)}
      <View style={[styles.bugMid, { height: h, paddingHorizontal: small ? 10 : 14 }, live && { backgroundColor: color.live }]}>
        <Text style={[type.bug, small && { fontSize: 16, lineHeight: 20 }, live && { color: onFill(color.live) }]}>{center}</Text>
      </View>
      {tab(away)}
    </View>
  );
}

/**
 * A kit field: a full-bleed block in a club's colours with the diagonal sash and pinstripes the
 * photo-less cards use, fading into the ground at the bottom. With `away`, the field splits
 * diagonally into the two clubs' kits (match hero).
 */
export function KitField({ colors, away, tones, height, fade = 0.55, children, style }: { colors?: ClubColors | null; away?: ClubColors | null; tones?: [string, string]; height: number; fade?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width: W } = useWindowDimensions();
  const id = useRef(`f${Math.random().toString(36).slice(2, 9)}`).current;
  const w = Math.min(W, 600);
  const c1 = tones?.[0] ?? clubTone(colors);
  const c2 = tones?.[1] ?? (away ? clubTone(away) : c1);
  const s1 = colors?.secondary && !near(colors.secondary, c1) ? colors.secondary : mix(c1, '#FFFFFF', 0.5);
  const s2 = away?.secondary && !near(away.secondary, c2) ? away.secondary : mix(c2, '#FFFFFF', 0.5);
  // the sash: a band across the field at -28°, edged with the secondary colour
  const band = (cx: number, col: string, sec: string, key: string) => {
    const t = Math.tan((28 * Math.PI) / 180);
    const b = height * 0.34;
    const y0 = height * 0.58 + cx * t;
    const pts = (off: number, thick: number) => `${-20},${y0 - off} ${w + 20},${y0 - off - (w + 40) * t} ${w + 20},${y0 - off - (w + 40) * t + thick} ${-20},${y0 - off + thick}`;
    return (
      <G key={key} opacity={0.55}>
        <Polygon points={pts(b * 0.5, b)} fill={mix(col, '#000000', 0.28)} />
        <Polygon points={pts(b * 0.5 + 6, 2)} fill={sec} />
        <Polygon points={pts(-b * 0.5 + 4, 2)} fill={sec} />
      </G>
    );
  };
  return (
    <View style={[{ height, width: '100%', overflow: 'hidden' }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.bg} stopOpacity={0} />
            <Stop offset={String(1 - fade)} stopColor={color.bg} stopOpacity={0.25} />
            <Stop offset="1" stopColor={color.bg} stopOpacity={1} />
          </SvgLinearGradient>
          <ClipPath id={`${id}l`}>
            <Polygon points={`0,0 ${w * 0.56},0 ${w * 0.44},${height} 0,${height}`} />
          </ClipPath>
          <ClipPath id={`${id}r`}>
            <Polygon points={`${w * 0.56},0 ${w},0 ${w},${height} ${w * 0.44},${height}`} />
          </ClipPath>
        </Defs>
        {away ? (
          <>
            <G clipPath={`url(#${id}l)`}>
              <Rect x={0} y={0} width={w} height={height} fill={c1} />
              {band(0, c1, s1, 'l')}
            </G>
            <G clipPath={`url(#${id}r)`}>
              <Rect x={0} y={0} width={w} height={height} fill={c2} />
              {band(0, c2, s2, 'r')}
            </G>
            <Polygon points={`${w * 0.56 - 1.5},0 ${w * 0.56 + 1.5},0 ${w * 0.44 + 1.5},${height} ${w * 0.44 - 1.5},${height}`} fill={color.bg} opacity={0.9} />
          </>
        ) : (
          <>
            <Rect x={0} y={0} width={w} height={height} fill={c1} />
            {band(0, c1, s1, 'one')}
          </>
        )}
        <Rect x={0} y={0} width={w} height={height} fill={`url(#${id}f)`} />
      </Svg>
      {children}
    </View>
  );
}

export const teamName = (t: Pick<Team, 'name' | 'shortName'>) => t.shortName ?? t.name;

// ---------------------------------------------------------------- credits

/** The credits coin: a round gold coin (radial #FFF0B8 → #E9C46A → #A9822F). */
export function Coin({ size: s = 15 }: { size?: number }) {
  const id = useRef(`c${Math.random().toString(36).slice(2, 9)}`).current;
  return (
    <Svg width={s} height={s} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id={id} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFF0B8" />
          <Stop offset="0.45" stopColor={color.gold} />
          <Stop offset="1" stopColor="#A9822F" />
        </RadialGradient>
      </Defs>
      <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={`url(#${id})`} />
      <Circle cx={s / 2} cy={s / 2} r={s / 2 - 0.75} stroke="rgba(120,80,20,0.5)" strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

/** Credits pill: 30 tall on `raised`, gold coin, tabular number. */
export function Credits({ credits }: { credits: number }) {
  return (
    <View style={styles.credits} accessible accessibilityLabel={`${credits} credits`}>
      <Coin size={15} />
      <Text style={styles.creditsText}>{credits}</Text>
    </View>
  );
}
export const Wallet = Credits;

/** The profile avatar (30): opens the You sheet. */
export function Avatar({ initial, onPress, size: s = 30 }: { initial?: string; onPress?: () => void; size?: number }) {
  const body = (
    <View style={[styles.avatar, { width: s, height: s, borderRadius: s / 2 }]}>
      {initial ? <Text style={styles.avatarText}>{initial}</Text> : <Ionicons name="person" size={s * 0.5} color={color.text} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="You: your teams, picks and settings">
      {body}
    </Pressable>
  );
}

/** The daily pack as a small gold sleeve (34×46 by default), for pack rows and tiles. */
export function MiniPack({ width: w = 34 }: { width?: number }) {
  const h = Math.round(w * 1.35);
  return (
    <LinearGradient
      colors={['#FFF3C4', '#B08A3E', '#FBE39A', '#8F6A26', '#EBCB78']}
      locations={[0, 0.25, 0.48, 0.72, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.pack, { width: w, height: h, padding: w * 0.12 }]}
    >
      <LinearGradient colors={['#1A1710', '#0C0B08']} style={styles.packFace}>
        <LinearGradient colors={['#FFF3C4', '#B08A3E', '#FBE39A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: w * 0.26, height: w * 0.36, borderRadius: 1.5 }} />
      </LinearGradient>
    </LinearGradient>
  );
}

/** "‹  Matchday 9 of 38  ›": steps an integer between min and max. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const btn = (dir: -1 | 1) => {
    const off = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => {
          tap('select');
          onChange(Math.min(max, Math.max(min, value + dir)));
        }}
        disabled={off}
        hitSlop={8}
        style={[styles.stepBtn, off && { opacity: 0.35 }]}
        accessibilityRole="button"
        accessibilityLabel={dir < 0 ? 'Previous' : 'Next'}
      >
        <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={18} color={color.text} />
      </Pressable>
    );
  };
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label}>
      {btn(-1)}
      <Text style={styles.stepText}>{label}</Text>
      {btn(1)}
    </View>
  );
}

/**
 * The pitch: a floodlit-green surface with mowing stripes and faint markings (halfway line,
 * centre circle, the three duel lanes). Game surfaces only: the Play hero and the duel board.
 * Text on it: text / text2 / text3 all clear 4.5:1 on its lightest stripe.
 */
export function Pitch({ children, style, lanes = true, radius: r = radius.lg }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; lanes?: boolean; radius?: number }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { w, h } = box;
  const stripes = 9;
  return (
    <View
      style={[{ backgroundColor: color.pitch, borderRadius: r, overflow: 'hidden' }, style]}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {w ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: stripes }, (_, i) => (i % 2 ? <Rect key={i} x={0} y={(i * h) / stripes} width={w} height={h / stripes} fill="#0F2C21" /> : null))}
          <Rect x={10} y={10} width={w - 20} height={h - 20} rx={4} stroke={color.pitchLine} strokeWidth={1.5} fill="none" />
          <Path d={`M10 ${h / 2} H${w - 10}`} stroke={color.pitchLine} strokeWidth={1.5} />
          <Circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.16} stroke={color.pitchLine} strokeWidth={1.5} fill="none" />
          {lanes ? <Path d={`M${w / 3} 10 V${h - 10} M${(2 * w) / 3} 10 V${h - 10}`} stroke={color.pitchLine} strokeWidth={1} strokeDasharray="3 6" /> : null}
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- buttons and controls

export function Button({
  label,
  onPress,
  kind = 'primary',
  size: sz = 'md',
  icon,
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const fg = kind === 'primary' ? color.onChalk : kind === 'secondary' ? color.text : color.accentText;
  return (
    <PressScale
      disabled={disabled}
      onPress={() => {
        tap('light');
        onPress();
      }}
      style={[
        styles.btn,
        sz === 'sm' && styles.btnSm,
        kind === 'secondary' && { backgroundColor: color.raised },
        kind === 'ghost' && styles.btnGhost,
        disabled && { opacity: 0.4 },
        style,
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
    >
      {icon ? <Ionicons name={icon} size={sz === 'sm' ? 16 : 18} color={fg} /> : null}
      <Text style={[styles.btnText, sz === 'sm' && { fontSize: 14 }, { color: fg }]} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

/**
 * Segmented control: track `raised`, a chalk thumb that slides (200 ms). value −1 shows no thumb.
 * `tones` paints the thumb per option (a pick: the home club's kit, chalk for Draw, the away kit).
 */
export function Segmented({
  options,
  value,
  onChange,
  disabled,
  style,
  tones,
}: {
  options: string[];
  value: number;
  onChange: (i: number) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  tones?: (string | undefined)[];
}) {
  const thumbFill = tones?.[value] ? solidFill(tones[value]!) : color.chalk;
  const [w, setW] = useState(0);
  const reduced = useReducedMotion();
  const seg = w ? (w - 6 - 3 * (options.length - 1)) / options.length : 0;
  const x = useSharedValue(0);
  const shown = value >= 0 && value < options.length;
  useEffect(() => {
    const to = Math.max(0, value) * (seg + 3);
    x.value = reduced || !seg ? to : withTiming(to, { duration: motion.base, easing: easeInOut });
  }, [value, seg, reduced, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      style={[styles.segTrack, disabled && { opacity: 0.5 }, style]}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {shown && seg ? <Animated.View style={[styles.segThumb, { width: seg, backgroundColor: thumbFill }, thumb]} /> : null}
      {options.map((o, i) => {
        const on = i === value;
        return (
          <Pressable
            key={o + i}
            disabled={disabled}
            onPress={() => {
              tap('select');
              onChange(i);
            }}
            style={styles.segItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: !!disabled }}
            accessibilityLabel={o}
          >
            <Text style={[styles.segText, on && { color: onFill(thumbFill), fontFamily: font.bold }]} numberOfLines={1}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Filter chips: 32 tall on `surface`; the selected chip is inverted. `extra` adds trailing toggle chips. */
export function FilterChips({
  options,
  value,
  onChange,
  extra,
  style,
}: {
  options: string[];
  value: number;
  onChange: (i: number) => void;
  extra?: { label: string; on: boolean; onPress: () => void }[];
  style?: StyleProp<ViewStyle>;
}) {
  const chip = (label: string, on: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={() => {
        tap('select');
        onPress();
      }}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <Bleed style={style}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.gutter }}>
        {options.map((o, i) => chip(o, i === value, () => onChange(i), `o${i}`))}
        {extra?.map((x, i) => chip(x.label, x.on, x.onPress, `x${i}`))}
      </ScrollView>
    </Bleed>
  );
}

/** A thin progress bar: 4 tall, track `raised`, fill `accent`. */
export function ProgressBar({ value, style, fill = color.accent }: { value: number; style?: StyleProp<ViewStyle>; fill?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={[styles.progress, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: fill, borderRadius: 2 }} />
    </View>
  );
}

/** Grows from 0 to its final width on first mount (320 ms), static under reduced motion. */
function useGrow() {
  const reduced = useReducedMotion();
  const g = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) g.value = withTiming(1, { duration: motion.slow, easing: easeOut });
  }, [reduced, g]);
  return g;
}

/**
 * Home / draw / away bar. With `tones` (fixtureTones) the two sides are drawn in their kits and
 * the draw in chalk; the leader is full strength, the others at 45%. Without tones: chalk leader.
 */
export function ProbabilityBar({ home, draw, away, lead, style, tones, height: bh = 8 }: { home: number; draw: number; away: number; lead: 'H' | 'D' | 'A'; style?: StyleProp<ViewStyle>; tones?: [string, string]; height?: number }) {
  const g = useGrow();
  const st = useAnimatedStyle(() => ({ width: `${g.value * 100}%` }));
  const fills = { H: tones?.[0] ?? color.chalk, D: tones ? color.text2 : color.chalk, A: tones?.[1] ?? color.chalk };
  const seg = (p: number, on: boolean, o: 'H' | 'D' | 'A' = 'H') => (
    <View style={{ flex: Math.max(p, 0.02), height: bh, borderRadius: bh / 2, backgroundColor: tones || on ? fills[o] : color.hairlineStrong, opacity: tones && !on ? 0.72 : 1 }} />
  );
  return (
    <View style={style} accessible accessibilityLabel={`Model's chance: home ${pctText(home)}, draw ${pctText(draw)}, away ${pctText(away)}`}>
      <Animated.View style={[{ flexDirection: 'row', gap: 3 }, st]}>
        {seg(home, lead === 'H', 'H')}
        {seg(draw, lead === 'D', 'D')}
        {seg(away, lead === 'A', 'A')}
      </Animated.View>
    </View>
  );
}

/** A thin 3 pt bar (width = p), used under outcome labels and in projections. */
export function MiniBar({ value, fill = color.hairlineStrong, width, height = 3, track = color.raised }: { value: number; fill?: string; width?: number; height?: number; track?: string }) {
  const g = useGrow();
  const v = Math.max(0, Math.min(1, value));
  const st = useAnimatedStyle(() => ({ width: `${g.value * v * 100}%` }));
  return (
    <View style={{ width, alignSelf: width ? undefined : 'stretch', height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: fill, borderRadius: height }, st]} />
    </View>
  );
}

/**
 * The core "market row": kit | label with a 3 pt bar under it | a 64×36 % pill.
 * Picked: the pill turns `accent` with a check. `result` marks the outcome that happened.
 */
export function OutcomeRow({
  kit,
  label,
  pct,
  picked,
  lead,
  onPress,
  disabled,
  result,
  tone,
}: {
  kit?: ClubColors | null;
  label: string;
  pct: number | null;
  picked: boolean;
  lead: boolean;
  onPress?: () => void;
  disabled?: boolean;
  result?: boolean;
  /** the side's colour in this fixture (fixtureTones); defaults to clubTone(kit), chalk for the draw */
  tone?: string;
}) {
  const t = kit === null ? color.text2 : tone ?? clubTone(kit);
  const fill = t;
  const pill = picked ? (kit === null ? color.chalk : solidFill(t)) : null;
  const inner = (pressed: boolean) => (
    <View style={[styles.out, pressed && { opacity: 0.75 }]}>
      <KitStripe colors={kit} tone={kit === null ? undefined : t} height={34} width={4} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.outLabel} numberOfLines={1}>{label}</Text>
          {result ? <Ionicons name="checkmark-circle" size={16} color={color.win} accessibilityLabel="Result" /> : null}
        </View>
        <MiniBar value={pct ?? 0} fill={fill} />
      </View>
      <View style={[styles.outPill, pill ? { backgroundColor: pill } : null]}>
        {pill ? <Ionicons name="checkmark" size={14} color={onFill(pill)} /> : null}
        <Text style={[styles.outPct, pill ? { color: onFill(pill), fontFamily: font.bold } : null]}>{pct === null ? '–' : pctText(pct)}</Text>
      </View>
    </View>
  );
  if (!onPress || disabled) return <View accessible accessibilityLabel={`${label}${pct !== null ? `, ${pctText(pct)} chance` : ''}${picked ? ', your pick' : ''}${result ? ', the result' : ''}`}>{inner(false)}</View>;
  return (
    <Pressable
      onPress={() => {
        tap('light');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={`Pick ${label}${pct !== null ? `, ${pctText(pct)} chance` : ''}`}
    >
      {({ pressed }) => inner(pressed)}
    </Pressable>
  );
}

/** Form pills, oldest first: W `win` on winSoft, L `loss` on lossSoft, D `text2` on `raised`. */
export function FormPills({ results, size: s = 24 }: { results: Result[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityLabel={`Last ${results.length}: ${results.join(' ') || 'none yet'}`}>
      {results.map((r, i) => (
        <View
          key={i}
          style={{
            width: s,
            height: s,
            borderRadius: radius.xs,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: r === 'W' ? color.winSoft : r === 'L' ? color.lossSoft : color.raised,
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: s * 0.46, color: r === 'W' ? color.win : r === 'L' ? color.loss : color.text2 }}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

/** @deprecated v1 name: small form dots. Prefer FormPills. */
export function Form({ results, size: s = 8 }: { results: Result[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessible accessibilityLabel={`Form: ${results.join(' ') || 'none yet'}`}>
      {results.map((r, i) => (
        <View key={i} style={{ width: s, height: s, borderRadius: 2, backgroundColor: r === 'W' ? color.win : r === 'L' ? color.loss : color.text3 }} />
      ))}
    </View>
  );
}

/** @deprecated v1 name. Home/draw/away bar with labels, now the ProbabilityBar look. */
export function OddsBar({ home, draw, away, labels = true }: { home: number; draw: number; away: number; homeColor?: string; awayColor?: string; labels?: boolean }) {
  const lead = home >= draw && home >= away ? 'H' : away >= draw ? 'A' : 'D';
  return (
    <View>
      <ProbabilityBar home={home} draw={draw} away={away} lead={lead} />
      {labels ? (
        <View style={styles.oddsLabels}>
          <Text style={styles.oddsNum}>{pctText(home)}</Text>
          <Text style={[styles.oddsNum, { color: color.text3 }]}>Draw {pctText(draw)}</Text>
          <Text style={styles.oddsNum}>{pctText(away)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- sheet

/** Bottom sheet: `surface`, radius 28 at the top, a grabber, scrim rgba(0,0,0,.6). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(1);
  const o = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      o.value = withTiming(1, { duration: motion.base });
      y.value = reduced ? 0 : withTiming(0, { duration: motion.slow, easing: easeOut });
    } else if (mounted) {
      o.value = withTiming(0, { duration: motion.base });
      y.value = reduced ? 1 : withTiming(1, { duration: motion.base, easing: easeInOut });
      const t = setTimeout(() => setMounted(false), motion.base + 20);
      return () => clearTimeout(t);
    }
  }, [visible, reduced, y, o, mounted]);
  const scrim = useAnimatedStyle(() => ({ opacity: o.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * Math.min(height, 700) }], opacity: reduced ? o.value : 1 }));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }, scrim]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm, maxHeight: height * 0.86 }, panel]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          {title ? <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text> : null}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- states

/** Pulsing `raised` blocks instead of spinners (static under reduced motion). */
export function Skeleton({ rows = 3, height = 52, gap = space.sm, style }: { rows?: number; height?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(0.5, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={[{ gap }, style]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={[{ height, borderRadius: radius.sm, backgroundColor: color.raised }, st]} />
      ))}
    </View>
  );
}

export function Empty({ icon = 'football-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={28} color={color.text3} />
      <Text style={[type.headline, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[type.body, { textAlign: 'center' }]}>{text}</Text> : null}
      {action ? <Button label={action.label} kind="secondary" size="sm" onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

export function Failed({ message, code, onRetry }: { message: string; code?: string; onRetry?: () => void }) {
  const title = code === 'RATE_LIMIT' ? 'Busy for a moment' : code === 'NO_KEY' ? 'Live data unavailable' : "Couldn't load this";
  const text =
    code === 'RATE_LIMIT'
      ? 'The free data feed is taking a breather. It retries on its own, or try again in a moment.'
      : code === 'NO_KEY'
      ? "FootSnap can't reach its data service right now. Try again in a little while."
      : message;
  return (
    <View style={styles.empty}>
      <Ionicons name={code === 'RATE_LIMIT' ? 'timer-outline' : 'cloud-offline-outline'} size={28} color={color.text3} />
      <Text style={[type.headline, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { textAlign: 'center' }]}>{text}</Text>
      {onRetry ? <Button label="Try again" kind="secondary" size="sm" onPress={onRetry} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

/** The live dot: `live`, breathing (static under reduced motion). */
export function LiveDot({ size: s = 8 }: { size?: number }) {
  const o = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 700 })), -1);
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: s, height: s, borderRadius: s / 2, backgroundColor: color.live }, st]} />;
}

/** A live dot with a label ("Live", "Half time"). */
export function LiveLamp({ label = 'Live' }: { label?: string }) {
  return (
    <View style={styles.live}>
      <LiveDot />
      <Text style={styles.liveText}>{label === label.toUpperCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label}</Text>
    </View>
  );
}

export function Num({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.num, style]}>{children}</Text>;
}

// ---------------------------------------------------------------- v1 compatibility

/** @deprecated v1. A tab title with an eyebrow; prefer LargeHeader. */
export function Header({ kicker, title, right }: { kicker?: string; title: string; right?: React.ReactNode }) {
  return <LargeHeader title={title} eyebrow={kicker} right={right} />;
}

/** @deprecated v1 league tab strip. The league is a menu now (LargeHeader leagueMenu); this renders chips. */
export function LeagueTabs({ value, onChange }: { value: number; onChange: (l: League) => void }) {
  return <FilterChips options={LEAGUES.map((l) => l.name)} value={LEAGUES.findIndex((l) => l.id === value)} onChange={(i) => onChange(LEAGUES[i])} style={{ marginBottom: space.md }} />;
}

/** @deprecated v1. A titled block; prefer SectionHeader + rows. */
export function Section({ title, note, action, children, style }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeadOld}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {note ? <Text style={[type.footnote, { marginTop: 2 }]}>{note}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/** @deprecated v1. A `surface` block, for promos and sheets only. */
export function Panel({ children, style, onPress, label }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string; label?: string }) {
  if (!onPress) return <View style={[styles.panel, style]}>{children}</View>;
  return (
    <PressScale
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.panel, style]}
      pressedStyle={{ backgroundColor: color.raised }}
      accessibilityLabel={label}
    >
      {children}
    </PressScale>
  );
}

/** @deprecated v1 toggle chip; prefer FilterChips. */
export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable
      onPress={() => {
        tap('select');
        onPress?.();
      }}
      style={[styles.chip, active && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  offline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: color.raised, paddingVertical: 6, paddingHorizontal: space.md },
  offlineText: { ...type.caption, color: color.text2 },

  large: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 10, paddingBottom: space.xl, gap: space.md },
  largeRight: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  eyebrow: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.text3, marginBottom: 2 },
  eyebrowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },

  nav: { height: 44, flexDirection: 'row', alignItems: 'center' },
  navSide: { width: 56, height: 44, justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontFamily: font.semibold, fontSize: 15, color: color.text2 },

  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: space.md },
  sectionHeadOld: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  sectionTitle: { fontFamily: font.cardHeavy, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: color.text, flexShrink: 1 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { fontFamily: font.medium, fontSize: 14, color: color.accentText },
  section: { marginTop: space.sm, marginBottom: space.xl, gap: space.md },
  overlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },

  row: { minHeight: size.row, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  rowPressed: { backgroundColor: color.raised },
  rowLeft: { minWidth: 20, alignItems: 'center' },
  rowTitle: { fontFamily: font.medium, fontSize: 16, lineHeight: 21, letterSpacing: -0.1, color: color.text },
  rowSub: { ...type.footnote, marginTop: 1 },

  credits: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 8, paddingRight: 11, borderRadius: radius.pill, backgroundColor: color.raised },
  creditsText: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  avatar: { backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.hairlineStrong },
  avatarText: { fontFamily: font.semibold, fontSize: 13, color: color.text },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: size.button, paddingHorizontal: space.xl, borderRadius: 12, backgroundColor: color.chalk },
  btnSm: { height: size.buttonSm, paddingHorizontal: space.lg, borderRadius: radius.pill },
  btnGhost: { backgroundColor: 'transparent', paddingHorizontal: space.sm },
  btnText: { fontFamily: font.bold, fontSize: 15, color: color.onChalk },

  segTrack: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 12, backgroundColor: color.raised },
  segThumb: { position: 'absolute', left: 3, top: 3, height: 40, borderRadius: 9, backgroundColor: color.chalk },
  segItem: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segText: { fontFamily: font.semibold, fontSize: 15, color: color.text2 },

  chip: { height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.text },
  chipText: { fontFamily: font.medium, fontSize: 14, color: color.text2 },
  chipTextOn: { fontFamily: font.semibold, color: color.bg },

  progress: { height: 4, borderRadius: 2, backgroundColor: color.raised, overflow: 'hidden' },

  out: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 5 },
  outLabel: { fontFamily: font.medium, fontSize: 16, lineHeight: 21, letterSpacing: -0.15, color: color.text, flexShrink: 1 },
  outPill: { minWidth: 64, height: 36, borderRadius: radius.sm, backgroundColor: color.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8 },
  outPct: { fontFamily: font.semibold, fontSize: 15, color: color.text, fontVariant: ['tabular-nums'] },

  bug: { flexDirection: 'row', alignSelf: 'center', borderRadius: 6, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  bugTab: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  bugMid: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.chalk, minWidth: 74 },

  oddsLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  oddsNum: { ...type.numSmall, color: color.text2 },

  sheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.gutter, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: color.hairlineStrong, marginBottom: space.md },
  sheetTitle: { ...type.headline, marginBottom: space.xs },

  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.x4, paddingHorizontal: space.xl },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { fontFamily: font.semibold, fontSize: 13, color: color.live },
  panel: { backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden' },
  pack: { borderRadius: 5, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 4 } },
  packFace: { flex: 1, borderRadius: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(255,230,160,0.5)' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, borderRadius: 12, backgroundColor: color.surface, paddingHorizontal: 4 },
  stepBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
});
