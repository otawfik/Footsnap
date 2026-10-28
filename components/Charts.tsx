/** Line charts in SVG: 2 pt lines in `text` / `text2`, hairline grid, no fills (SPEC §5). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { color, font } from '../constants/design';

export interface Series {
  label: string;
  /** defaults to `text` for the first series and `text2` for the others */
  color?: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
}

export function LineChart({
  series,
  width,
  height = 168,
  invert = false,
  yMin,
  yMax,
  yLabel,
  xLabel = 'Matchday',
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
  const pad = { l: 26, r: 8, t: 8, b: 22 };
  const all = series.flatMap((s) => s.points);
  if (!all.length || width <= 0) return null;
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
  const ticks = [...new Set([y0, Math.round((y0 + y1) / 2), y1])];
  const tone = (s: Series, i: number) => s.color ?? (i === 0 ? color.text : color.text2);

  return (
    <View>
      <Svg width={width} height={height} accessibilityLabel={series.map((s) => `${s.label}: ${s.points.map((p) => p.y).join(', ')}`).join('. ')}>
        {ticks.map((t) => (
          <React.Fragment key={t}>
            <Line x1={pad.l} x2={width - pad.r} y1={py(t)} y2={py(t)} stroke={color.hairline} strokeWidth={1} />
            <SvgText x={pad.l - 6} y={py(t) + 4} fontSize={11} fill={color.text3} fontFamily={font.medium} textAnchor="end">
              {t}
            </SvgText>
          </React.Fragment>
        ))}
        <SvgText x={pad.l} y={height - 5} fontSize={11} fill={color.text3} fontFamily={font.medium}>
          {x0}
        </SvgText>
        <SvgText x={width - pad.r} y={height - 5} fontSize={11} fill={color.text3} fontFamily={font.medium} textAnchor="end">
          {`${xLabel} ${x1}`}
        </SvgText>
        {series.map((s, i) => {
          if (!s.points.length) return null;
          const d = s.points.map((p, k) => `${k ? 'L' : 'M'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
          const last = s.points[s.points.length - 1];
          return (
            <React.Fragment key={s.label + i}>
              <Path d={d} stroke={tone(s, i)} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '4 4' : undefined} />
              <Circle cx={px(last.x)} cy={py(last.y)} r={3.5} fill={tone(s, i)} stroke={color.bg} strokeWidth={2} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        {series.map((s, i) => (
          <View key={s.label + i} style={styles.item}>
            <View style={[styles.swatch, { backgroundColor: tone(s, i) }]} />
            <Text style={styles.label}>{s.label}</Text>
          </View>
        ))}
        {yLabel ? <Text style={[styles.label, { marginLeft: 'auto', color: color.text3 }]}>{yLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 2, borderRadius: 1 },
  label: { fontFamily: font.medium, fontSize: 13, color: color.text2 },
});
