/**
 * "What this result means" on a finished match page: each side's season chances just before
 * kick-off and with the result, from lib/impact.ts. Computed after the page has drawn (two
 * rankings of 2,000 simulated seasons, ~130 ms on a laptop), and labelled as model output.
 */
import React, { useEffect, useState } from 'react';
import { InteractionManager, StyleSheet, Text, View } from 'react-native';
import { KitStripe, Overline, Skeleton, pctText, teamName } from './ui';
import type { ClubColors } from '../lib/colors';
import { resultImpact, stakesFor, ResultImpact as Impact, TeamImpact } from '../lib/impact';
import type { Ratings } from '../lib/model';
import type { Match } from '../lib/types';
import { color, font, space, type } from '../constants/design';

/** below half a percent either way, a stake isn't worth a row */
const SHOWN = 0.005;

const ordinalish = (x: number) => x.toFixed(1);

export function ResultImpact({ match, matches, ratings, competitionId, tones, colors }: { match: Match; matches: Match[]; ratings: Ratings; competitionId: number; tones: [string, string]; colors: [ClubColors | undefined, ClubColors | undefined] }) {
  const [impact, setImpact] = useState<Impact | null | undefined>(undefined);
  useEffect(() => {
    setImpact(undefined);
    const task = InteractionManager.runAfterInteractions(() => setImpact(resultImpact(match, matches, ratings, competitionId)));
    return () => task.cancel();
  }, [match, matches, ratings, competitionId]);

  if (impact === null) return null;
  const stakes = stakesFor(competitionId);
  return (
    <View style={styles.sec}>
      <Overline right="Model output">What this result means</Overline>
      {impact === undefined ? (
        <Skeleton rows={2} height={72} gap={space.md} />
      ) : (
        <>
          {[impact.home, impact.away].map((side, i) => (
            <Side key={side.team.id} side={side} stakes={stakes} tone={tones[i]} colors={colors[i]} />
          ))}
          <Text style={styles.caption}>
            From the table at kick-off, the rest of the season ({impact.fixtures} games, this one included) simulated{' '}
            {impact.runs.toLocaleString('en-GB')} times with the goals model, then ranked twice: with this result, and with the match left to chance. The
            same {impact.runs.toLocaleString('en-GB')} seasons both ways, so the change is this result alone.
          </Text>
        </>
      )}
    </View>
  );
}

function Side({ side, stakes, tone, colors }: { side: TeamImpact; stakes: ReturnType<typeof stakesFor>; tone: string; colors?: ClubColors }) {
  const name = teamName(side.team);
  const rows = stakes.filter((s) => Math.max(side.before[s.key], side.after[s.key]) >= SHOWN);
  return (
    <View style={styles.side}>
      <View style={styles.sideHead}>
        <KitStripe colors={colors} tone={tone} height={18} width={3} />
        <Text style={styles.sideName} numberOfLines={1}>{name}</Text>
      </View>
      {rows.length ? (
        rows.map((s) => {
          const b = side.before[s.key];
          const a = side.after[s.key];
          // the change between the two numbers as shown, so 3% → 3% never reads ▲1
          const d = pctText(a) === pctText(b) ? 0 : Math.round(a * 100) - Math.round(b * 100);
          const good = s.bad ? d < 0 : d > 0;
          const change = d === 0 ? 'unchanged' : `${d > 0 ? 'up' : 'down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'}`;
          return (
            <View key={s.key} style={styles.row} accessible accessibilityLabel={`${name}, ${s.label.toLowerCase()}: ${pctText(b)} before this result, ${pctText(a)} after, ${change}.`}>
              <Text style={styles.label} numberOfLines={1}>{s.label}</Text>
              <Text style={styles.before}>{pctText(b)}</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.after}>{pctText(a)}</Text>
              <Text style={[styles.delta, { color: d === 0 ? color.text3 : good ? color.win : color.loss }]}>{d === 0 ? '–' : `${d > 0 ? '▲' : '▼'}${Math.abs(d)}`}</Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.quiet} accessible>
          Under 1% for every stake either way. Average finish {ordinalish(side.before.avgPosition)} → {ordinalish(side.after.avgPosition)}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { paddingTop: space.xs, paddingBottom: 22 },
  side: { paddingTop: 4, paddingBottom: 8 },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  sideName: { flex: 1, minWidth: 0, fontFamily: font.semibold, fontSize: 15, color: color.text },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 6, paddingLeft: 13, borderBottomWidth: 1, borderBottomColor: color.hairline },
  label: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 14, color: color.text2 },
  before: { width: 42, textAlign: 'right', fontFamily: font.medium, fontSize: 14, color: color.text3, fontVariant: ['tabular-nums'] },
  arrow: { fontFamily: font.medium, fontSize: 13, color: color.text3 },
  after: { width: 42, fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  delta: { width: 36, textAlign: 'right', fontFamily: font.semibold, fontSize: 12, fontVariant: ['tabular-nums'] },
  quiet: { ...type.footnote, paddingLeft: 13 },
  caption: { ...type.footnote, marginTop: space.sm },
});
