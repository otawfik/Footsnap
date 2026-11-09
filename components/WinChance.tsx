/**
 * The chance through the match (lib/inplay.ts): home win, draw and away win from kick-off to full
 * time, or to now while it's live. The free data has the score at half-time and full time (and now),
 * not goal minutes, so a stretch where the score changed is shaded and its ends joined by a dotted
 * line rather than drawn as if we knew when the goals came. Press (or hover, on the web) to read
 * any minute; the readout above the plot shows the latest value otherwise.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { pctText } from './ui';
import { color, font } from '../constants/design';
import type { Chances, CurvePoint, Stretch } from '../lib/inplay';

type Key = keyof Chances;
const KEYS: Key[] = ['home', 'draw', 'away'];

export interface WinChanceProps {
  stretches: Stretch[];
  /** a first guess; the chart measures the width it's given and fills it */
  width: number;
  /** short names for the sides (club codes) and their kit tones, readable on the ground */
  names: [string, string];
  tones: [string, string];
  live?: boolean;
}

const minuteText = (m: number, estimated?: boolean) => (m === 0 ? 'Kick-off' : m === 45 ? 'Half-time' : m === 90 ? 'Full time' : `${estimated ? '≈' : ''}${Math.round(m)}′`);

export function WinChance({ stretches, width: guess, names, tones, live }: WinChanceProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? guess;
  // a little taller on wide screens, so the curve isn't flattened
  const height = Math.round(Math.max(184, Math.min(260, width * 0.32)));
  const pad = { l: 36, r: 10, t: 26, b: 24 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const px = (minute: number) => pad.l + (minute / 90) * W;
  const py = (p: number) => pad.t + (1 - p) * H;
  const tone: Record<Key, string> = { home: tones[0], draw: color.text3, away: tones[1] };
  const label: Record<Key, string> = { home: names[0], draw: 'Draw', away: names[1] };

  const last = stretches.at(-1);
  const end = last?.points.at(-1);
  const endCp = last?.to;

  // what the readout says: the hovered minute, or the latest point
  const readout = useMemo(() => {
    if (!end || !endCp) return null;
    if (scrub === null || scrub > endCp.minute) return { title: live ? `Now · ${minuteText(endCp.minute, endCp.estimated)}` : minuteText(endCp.minute), point: end as CurvePoint | null, note: null as string | null };
    const s = stretches.find((x) => scrub >= x.from.minute && scrub <= x.to.minute)!;
    const exact = s.points.find((p) => p.minute === scrub);
    if (s.known || exact) {
      const p = exact ?? s.points.reduce((a, b) => (Math.abs(b.minute - scrub) < Math.abs(a.minute - scrub) ? b : a));
      return { title: `${minuteText(p.minute)} · ${s.from.home}–${s.from.away}`, point: p, note: null };
    }
    return { title: `${minuteText(s.from.minute)} to ${minuteText(s.to.minute, s.to.estimated).toLowerCase()}`, point: null, note: goalsText(s, names) };
  }, [scrub, stretches, end, endCp, live, names]);

  if (!last || !end || !endCp || width <= 0) return null;

  const at = (x: number) => setScrub(Math.max(0, Math.min(90, Math.round(((x - pad.l) / W) * 90))));
  const pick = (e: GestureResponderEvent) => at(e.nativeEvent.locationX);
  // web: hovering reads a minute too (measured against the plot itself, not whatever line is under the pointer)
  const hover =
    Platform.OS === 'web'
      ? {
          onPointerMove: (e: { clientX: number; currentTarget: { getBoundingClientRect?: () => { left: number } } }) => {
            const r = e.currentTarget.getBoundingClientRect?.();
            if (r) at(e.clientX - r.left);
          },
          onPointerLeave: () => setScrub(null),
        }
      : {};

  const unknown = stretches.filter((s) => !s.known);
  const path = (pts: CurvePoint[], k: Key) => pts.map((p, i) => `${i ? 'L' : 'M'} ${px(p.minute).toFixed(1)} ${py(p[k]).toFixed(1)}`).join(' ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={describe(stretches, names, live)} onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.readout} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={styles.readTitle} numberOfLines={1}>{readout?.title}</Text>
        <View style={styles.readValues}>
          {readout?.point
            ? KEYS.map((k) => (
                <View key={k} style={styles.readItem}>
                  <View style={[styles.swatch, { backgroundColor: tone[k] }]} />
                  <Text style={styles.readName}>{label[k]}</Text>
                  <Text style={styles.readValue}>{pctText(readout.point![k])}</Text>
                </View>
              ))
            : <Text style={styles.readName}>{readout?.note}</Text>}
        </View>
      </View>

      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setScrub(null)}
        onResponderTerminate={() => setScrub(null)}
        {...(hover as object)}
      >
        {/* the plot ignores touches, so positions are measured against this View, not a line under the finger */}
        <View pointerEvents="none">
        <Svg width={width} height={height}>
          {/* stretches where goals came at minutes the data doesn't give */}
          {unknown.map((s) => (
            <React.Fragment key={`u${s.from.minute}`}>
              <Rect x={px(s.from.minute)} y={pad.t} width={px(s.to.minute) - px(s.from.minute)} height={H} fill={color.text} opacity={0.06} />
              <GoalMarks s={s} x0={px(s.from.minute)} x1={px(s.to.minute)} y={pad.t - 10} names={names} tones={tones} />
            </React.Fragment>
          ))}
          {[0, 0.5, 1].map((t) => (
            <React.Fragment key={t}>
              <Line x1={pad.l} x2={width - pad.r} y1={py(t)} y2={py(t)} stroke={t === 0 ? color.hairlineStrong : color.hairline} strokeWidth={1} />
              <SvgText x={pad.l - 6} y={py(t) + 4} fontSize={11} fill={color.text3} fontFamily={font.medium} textAnchor="end">{`${t * 100}%`}</SvgText>
            </React.Fragment>
          ))}
          <Line x1={px(45)} x2={px(45)} y1={pad.t} y2={pad.t + H} stroke={color.hairline} strokeWidth={1} />
          {(
            [
              [0, 'KO', 'start'],
              [45, 'HT', 'middle'],
              [90, 'FT', 'end'],
            ] as const
          )
            // a live match labels its minute on this axis; leave room for it
            .filter(([m]) => !(live && Math.abs(px(m) - px(endCp.minute)) < 34))
            .map(([m, t, anchor]) => (
            <SvgText key={t} x={px(m)} y={height - 6} fontSize={11} fill={color.text3} fontFamily={font.medium} textAnchor={anchor}>{t}</SvgText>
          ))}

          {/* draw first so the two sides sit on top of it */}
          {(['draw', 'away', 'home'] as Key[]).map((k) => (
            <React.Fragment key={k}>
              {stretches.map((s) =>
                s.known ? (
                  // the draw a touch thinner than the two sides, so it never relies on its grey alone
                  <Path key={s.from.minute} d={path(s.points, k)} stroke={tone[k]} strokeWidth={k === 'draw' ? 1.5 : 2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                ) : (
                  <Path key={s.from.minute} d={path([s.points[0], s.points.at(-1)!], k)} stroke={tone[k]} strokeWidth={1.5} fill="none" strokeDasharray="2 4" strokeLinecap="round" opacity={0.75} />
                ),
              )}
            </React.Fragment>
          ))}
          {/* the checkpoints the data gives: half-time, full time, now */}
          {stretches.map((s) =>
            (['draw', 'away', 'home'] as Key[]).map((k) => (
              <Circle key={`${s.to.minute}${k}`} cx={px(s.to.minute)} cy={py(s.points.at(-1)![k])} r={s === last ? 4 : 3} fill={tone[k]} stroke={color.bg} strokeWidth={2} />
            )),
          )}
          {live && endCp.minute < 90 ? (
            <>
              <Line x1={px(endCp.minute)} x2={px(endCp.minute)} y1={pad.t} y2={pad.t + H} stroke={color.live} strokeWidth={1} strokeDasharray="3 3" />
              <SvgText x={px(endCp.minute)} y={height - 6} fontSize={11} fill={color.live} fontFamily={font.semibold} textAnchor={endCp.minute > 84 ? 'end' : 'middle'}>
                {endCp.minute === 45 ? 'HT' : `${endCp.estimated ? '≈' : ''}${endCp.minute}′`}
              </SvgText>
            </>
          ) : null}
          {scrub !== null && scrub <= endCp.minute ? <Line x1={px(scrub)} x2={px(scrub)} y1={pad.t} y2={pad.t + H} stroke={color.text2} strokeWidth={1} /> : null}
        </Svg>
        </View>
      </View>
      {unknown.length ? (
        <View style={styles.key} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.keyBox} />
          <Text style={styles.keyText}>Goals in this stretch; the data doesn't say which minute</Text>
        </View>
      ) : null}
    </View>
  );
}

const goalsText = (s: Stretch, names: [string, string]) => {
  const n = s.goals.home + s.goals.away;
  const who = [s.goals.home ? `${names[0]} ${s.goals.home}` : '', s.goals.away ? `${names[1]} ${s.goals.away}` : ''].filter(Boolean).join(', ');
  return `${n} goal${n === 1 ? '' : 's'} (${who}), minute${n === 1 ? '' : 's'} not in the data`;
};

/** "+1 MUN  +2 AVL" over a shaded stretch, each with a dot in the side's tone. */
function GoalMarks({ s, x0, x1, y, names, tones }: { s: Stretch; x0: number; x1: number; y: number; names: [string, string]; tones: [string, string] }) {
  const items = [s.goals.home ? { t: `+${s.goals.home} ${names[0]}`, c: tones[0] } : null, s.goals.away ? { t: `+${s.goals.away} ${names[1]}`, c: tones[1] } : null].filter(
    (x): x is { t: string; c: string } => !!x,
  );
  // about 6.5 px a character at 11 px, a dot and gaps
  const widths = items.map((i) => 12 + i.t.length * 6.5);
  const total = widths.reduce((a, b) => a + b, 0) + (items.length - 1) * 8;
  let x = (x0 + x1) / 2 - total / 2;
  return (
    <>
      {items.map((i, k) => {
        const at = x;
        x += widths[k] + 8;
        return (
          <React.Fragment key={i.t}>
            <Circle cx={at + 4} cy={y - 4} r={3.5} fill={i.c} />
            <SvgText x={at + 11} y={y} fontSize={11} fill={color.text2} fontFamily={font.semibold}>{i.t}</SvgText>
          </React.Fragment>
        );
      })}
    </>
  );
}

/** The chart in words, for screen readers. */
function describe(stretches: Stretch[], names: [string, string], live?: boolean): string {
  const say = (p: CurvePoint) => `${names[0]} ${pctText(p.home)}, draw ${pctText(p.draw)}, ${names[1]} ${pctText(p.away)}`;
  const parts = [`Chance through the match. Before kick-off: ${say(stretches[0].points[0])}.`];
  for (const s of stretches) {
    const at = s.to.minute === 45 ? 'At half-time' : s.to.minute === 90 ? 'At full time' : `Now, about ${s.to.minute} minutes in`;
    parts.push(`${at}, ${s.to.home}–${s.to.away}: ${say(s.points.at(-1)!)}.`);
    if (!s.known) parts.push(`${goalsText(s, names)}.`);
  }
  if (live && stretches.at(-1)!.to.estimated) parts.push('The minute is estimated from the kick-off time.');
  return parts.join(' ');
}

const styles = StyleSheet.create({
  readout: { minHeight: 44, gap: 4, marginBottom: 2 },
  readTitle: { fontFamily: font.semibold, fontSize: 13, color: color.text2, fontVariant: ['tabular-nums'] },
  readValues: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2, alignItems: 'center' },
  readItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 3, borderRadius: 1.5 },
  readName: { fontFamily: font.medium, fontSize: 13, color: color.text3 },
  readValue: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  key: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  keyBox: { width: 14, height: 10, borderRadius: 2, backgroundColor: 'rgba(246,241,230,0.10)' },
  keyText: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: color.text3, flexShrink: 1 },
});
