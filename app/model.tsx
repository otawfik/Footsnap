/**
 * How good is the model? Its record this season, scored the honest way: every played match was
 * forecast from the results before its kick-off day only (lib/model.ts backtestCalls), then
 * checked against what happened. Hit rate, Brier score against two baselines, a calibration
 * chart, and the results it saw coming least.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { Screen, NavBar, SectionHeader, Row, Skeleton, teamName } from '../components/ui';
import { useLeague } from '../context/league';
import { useRatings } from '../hooks/data';
import { backtestCalls, brier, calibration, chanceOf, COIN_BRIER, pick, upsets, type Call } from '../lib/model';
import { color, font, radius, space, type } from '../constants/design';

const MIN_PRIOR = 30;
// scripts/baselines.ts, run 8 Nov 2026: [label, value, is the model]
const FIVE: [string, string, boolean][] = [
  ['FootSnap model: results called', '51.1%', true],
  ['Always backing the home side', '44.1%', false],
  ['FootSnap model: Brier score', '0.599', true],
  ['League averages: Brier score', '0.655', false],
  ['A third each: Brier score', '0.667', false],
];
// scripts/inplay-backtest.ts, run 9 Nov 2026: 3,536 matches, five leagues, 2024-25 to 2026-27 [label, Brier, log loss, is the in-play model]
const HALF_TIME: [string, string, string, boolean][] = [
  ['In-play model at half-time', '0.482', '0.820', true],
  ['Half-time score alone', '0.505', '0.860', false],
  ['The forecast before kick-off', '0.593', '0.994', false],
];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ModelReport() {
  const { league } = useLeague();
  const { data, loading, prior } = useRatings(league);
  const { width } = useWindowDimensions();
  const calls = useMemo(() => backtestCalls(data?.matches ?? [], MIN_PRIOR, prior), [data, prior]);
  const n = calls.length;
  const right = calls.filter((c) => pick(c.p) === c.o).length;
  const home = calls.filter((c) => c.o === 'H').length;
  const b = {
    model: n ? calls.reduce((t, c) => t + brier(c.p, c.o), 0) / n : 0,
    rates: n ? calls.reduce((t, c) => t + brier(c.rates, c.o), 0) / n : 0,
    coin: COIN_BRIER,
  };
  const bins = useMemo(() => calibration(calls, 5), [calls]);
  const miss = useMemo(() => upsets(calls, 5), [calls]);
  const W = Math.min(width - space.lg * 2, 420);

  return (
    <Screen tabBar={false}>
      <NavBar title="How good is the model?" />
      {loading && !data ? (
        <Skeleton rows={4} height={96} gap={space.lg} />
      ) : !n ? (
        <Text style={[type.body, { marginTop: space.lg }]}>
          Too early to tell: the model is only scored once {league.name} has {MIN_PRIOR} results behind it.
        </Text>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.big}>{pct(right / n)}</Text>
            <Text style={type.headline}>of results called right</Text>
            <Text style={[type.body, styles.sub]}>
              {n} {league.name} games this season, each forecast before kick-off from the results before it, never after. Always
              backing the home side gets {pct(home / n)}.
            </Text>
          </View>

          <View style={styles.sec}>
            <SectionHeader title="Brier score" />
            <Text style={[type.footnote, styles.note]}>How far the forecasts were from what happened. Lower is better; 0 is perfect.</Text>
            <BrierBar label="FootSnap model" value={b.model} best fill={color.accent} />
            <BrierBar label="League averages so far" value={b.rates} fill={color.hairlineStrong} />
            <BrierBar label="A third each (no knowledge)" value={b.coin} fill={color.hairlineStrong} />
          </View>

          <View style={styles.sec}>
            <SectionHeader title="Does 30% mean 30%?" />
            <Text style={[type.footnote, styles.note]}>
              Every forecast home win, draw and away win, grouped by the chance the model gave it. On the dashed line, things
              it called 30% happened 30% of the time. Bigger dots hold more forecasts.
            </Text>
            <Calibration bins={bins} size={W} />
          </View>

          <View style={styles.sec}>
            <SectionHeader title="Didn't see these coming" />
            {miss.map((c, i) => (
              <Upset key={c.match.id} c={c} last={i === miss.length - 1} />
            ))}
          </View>

          <View style={styles.sec}>
            <SectionHeader title="Across five leagues" />
            <Text style={[type.footnote, styles.note]}>
              The same walk-forward test on the Premier League, La Liga, Bundesliga, Serie A and Ligue 1: 1,894 matches from
              2025-26 and 2026-27 to November 2026 (scripts/baselines.ts).
            </Text>
            <View style={styles.cmp}>
              {FIVE.map(([label, v, best]) => (
                <View key={label} style={styles.cmpRow} accessible accessibilityLabel={`${label}: ${v}`}>
                  <Text style={[styles.barLabel, best && { color: color.text, fontFamily: font.semibold }]}>{label}</Text>
                  <Text style={[styles.barValue, best && { color: color.accentText }]}>{v}</Text>
                </View>
              ))}
            </View>
            <Text style={[type.footnote, { marginTop: space.sm }]}>
              Bookmakers usually call 53–55%. This model sees results only, no lineups, injuries or market prices.
            </Text>
          </View>

          <View style={styles.sec}>
            <SectionHeader title="During a match" />
            <Text style={[type.footnote, styles.note]}>
              Match pages follow the chance through the game: the goals still to come are the forecast's expected goals scaled
              by the time left, added to the score. Checked at half-time on 3,536 matches in five leagues from 2024-25 to
              2026-27, against the 90-minute result (scripts/inplay-backtest.ts). Lower is better.
            </Text>
            <View style={styles.cmp}>
              <View style={styles.cmpRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Text style={[type.caption, { flex: 1 }]}>At half-time</Text>
                <Text style={[type.caption, styles.num]}>Brier</Text>
                <Text style={[type.caption, styles.num]}>Log loss</Text>
              </View>
              {HALF_TIME.map(([label, b, l, best]) => (
                <View key={label} style={styles.cmpRow} accessible accessibilityLabel={`${label}: Brier ${b}, log loss ${l}`}>
                  <Text style={[styles.barLabel, { flex: 1 }, best && { color: color.text, fontFamily: font.semibold }]}>{label}</Text>
                  <Text style={[styles.barValue, styles.num, best && { color: color.accentText }]}>{b}</Text>
                  <Text style={[styles.barValue, styles.num, best && { color: color.accentText }]}>{l}</Text>
                </View>
              ))}
            </View>
            <Text style={[type.footnote, { marginTop: space.sm }]}>
              "Half-time score alone" is how often each half-time margin ended in a win, draw or loss in 2021-22 to 2023-24; the
              model adds who is playing. Its numbers come from those seasons too: 45% of goals come before half-time, and a
              side that's behind scores about 11% more than expected, a side ahead about 4% fewer. The free data feed has no
              goal minutes, so a match page draws the curve only where the score stayed the same.
            </Text>
          </View>

          <View style={styles.sec}>
            <SectionHeader title="How it works" />
            <Text style={type.body}>
              Every team gets an attack and a defence strength, fitted to this season's goals by iterative scaling (a Poisson
              goals model in the style of Maher, 1982). A match's expected goals are home attack × away defence × the
              league's home scoring rate, and the same the other way; independent Poisson scores give every scoreline's
              chance, and adding them up gives the win, draw and loss.
            </Text>
            <Text style={[type.body, { marginTop: space.md }]}>
              Early in a season nine games say little, so each team starts from last season's strengths, pulled 15% back toward
              average (promoted sides start from the teams they replaced). In a backtest of 2,105 matches that cut the Brier
              score over the first ten rounds from 0.628 to 0.597.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function BrierBar({ label, value, fill, best }: { label: string; value: number; fill: string; best?: boolean }) {
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${value.toFixed(3)}`}>
      <View style={styles.barHead}>
        <Text style={[styles.barLabel, best && { color: color.text, fontFamily: font.semibold }]}>{label}</Text>
        <Text style={[styles.barValue, best && { color: color.accentText }]}>{value.toFixed(3)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, (value / 0.75) * 100)}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

function Calibration({ bins, size }: { bins: ReturnType<typeof calibration>; size: number }) {
  const pad = 40;
  const S = size - pad - 8;
  const X = (v: number) => pad + v * S;
  const Y = (v: number) => 8 + (1 - v) * S;
  const max = Math.max(...bins.map((b) => b.n));
  const line = bins.map((b, i) => `${i ? 'L' : 'M'} ${X(b.said)} ${Y(b.happened)}`).join(' ');
  return (
    <View accessible accessibilityLabel={`Calibration: ${bins.map((b) => `said ${pct(b.said)}, happened ${pct(b.happened)}`).join('; ')}`}>
      <Svg width={size} height={size}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <React.Fragment key={t}>
            <Line x1={X(0)} x2={X(1)} y1={Y(t)} y2={Y(t)} stroke={color.hairline} strokeWidth={1} />
            <SvgText x={pad - 6} y={Y(t) + 4} fontSize={11} fill={color.text2} textAnchor="end" fontFamily={font.medium}>
              {pct(t)}
            </SvgText>
            <SvgText x={X(t)} y={size - 0} fontSize={11} fill={color.text2} textAnchor="middle" fontFamily={font.medium}>
              {t === 0 ? '' : pct(t)}
            </SvgText>
          </React.Fragment>
        ))}
        <Line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke={color.text2} strokeWidth={1.2} strokeDasharray="5 5" />
        <Path d={line} stroke={color.accent} strokeWidth={2} fill="none" />
        {bins.map((b) => (
          <Circle key={b.lo} cx={X(b.said)} cy={Y(b.happened)} r={4 + 8 * Math.sqrt(b.n / max)} fill={color.accent} fillOpacity={0.85} stroke={color.bg} strokeWidth={2} />
        ))}
      </Svg>
      <View style={styles.axes}>
        <Text style={type.caption}>Model said →</Text>
        <Text style={type.caption}>↑ Happened</Text>
      </View>
    </View>
  );
}

function Upset({ c, last }: { c: Call; last: boolean }) {
  const m = c.match;
  const h = teamName(m.homeTeam);
  const a = teamName(m.awayTeam);
  const what = c.o === 'H' ? `${h} win` : c.o === 'A' ? `${a} win` : 'a draw';
  return (
    <Row
      title={`${h} ${m.score.fullTime.home}–${m.score.fullTime.away} ${a}`}
      subtitle={`The model gave ${what} ${pct(chanceOf(c))}`}
      right={<Text style={styles.upsetPct}>{pct(chanceOf(c))}</Text>}
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: String(m.id) } })}
      chevron
      divider={!last}
    />
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface, gap: 2 },
  big: { fontFamily: font.cardHeavy, fontSize: 64, lineHeight: 70, color: color.accentText, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  sub: { marginTop: space.sm, color: color.text2 },
  sec: { marginTop: space.xl },
  note: { marginBottom: space.md },
  barRow: { marginBottom: space.md, gap: 6 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontFamily: font.medium, fontSize: 15, color: color.text2 },
  barValue: { fontFamily: font.semibold, fontSize: 15, color: color.text2, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: color.raised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  cmp: { borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space.md, paddingVertical: space.sm },
  cmpRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  num: { width: 64, textAlign: 'right' },
  axes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  upsetPct: { fontFamily: font.semibold, fontSize: 15, color: color.loss, fontVariant: ['tabular-nums'], marginRight: 4 },
});
