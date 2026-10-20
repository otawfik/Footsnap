/** Line charts drawn in SVG: club-coloured series on chalk gridlines. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { C, F } from '../constants/theme';

export interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
}

export function LineChart({
  series,
  width,
  height = 180,
  invert = false,
  yMin,
  yMax,
  yLabel,
  xLabel = 'MATCHDAY',
}: {
  series: Series[];
  width: number;
  height?: number;
  /** positions: 1 at the top */
  invert?: boolean;
  yMin?: number;
  yMax?: number;
  yLabel?: string;
  xLabel?: string;
}) {
  const pad = { l: 28, r: 12, t: 10, b: 22 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const y0 = yMin ?? Math.min(...ys);
  const y1 = yMax ?? Math.max(...ys, y0 + 1);
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const px = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * W;
  const py = (y: number) => (invert ? pad.t + ((y - y0) / (y1 - y0)) * H : pad.t + H - ((y - y0) / (y1 - y0)) * H);
  const ticks = [y0, Math.round((y0 + y1) / 2), y1];

  return (
    <View>
      <Svg width={width} height={height} accessibilityLabel={series.map((s) => `${s.label}: ${s.points.map((p) => p.y).join(', ')}`).join('. ')}>
        {ticks.map((t) => (
          <React.Fragment key={t}>
            <Line x1={pad.l} x2={width - pad.r} y1={py(t)} y2={py(t)} stroke={C.line} strokeWidth={1} />
            <SvgText x={pad.l - 6} y={py(t) + 4} fontSize={10} fill={C.dim} fontFamily={F.num} textAnchor="end">
              {t}
            </SvgText>
          </React.Fragment>
        ))}
        <SvgText x={width - pad.r} y={height - 4} fontSize={9} fill={C.dim} fontFamily={F.label} textAnchor="end" letterSpacing={1}>
          {xLabel}
        </SvgText>
        {series.map((s) => {
          if (!s.points.length) return null;
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
          const last = s.points[s.points.length - 1];
          return (
            <React.Fragment key={s.label}>
              <Path d={d} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <Circle cx={px(last.x)} cy={py(last.y)} r={4} fill={s.color} stroke={C.night} strokeWidth={2} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.item}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.label}>{s.label}</Text>
          </View>
        ))}
        {yLabel ? <Text style={[styles.label, { marginLeft: 'auto', color: C.dim }]}>{yLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 3, borderRadius: 2 },
  label: { fontFamily: F.label, fontSize: 12, letterSpacing: 0.8, color: C.chalk2 },
});
