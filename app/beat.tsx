/**
 * Beat the model: call the fixtures yourself, with how sure you are, and get scored with the same
 * Brier score as the model on "How good is the model?", on the same matches (lib/beat.ts). Calls
 * lock at kick-off, when the model's own forecast is shown. The record at the top counts your
 * calls in every competition; a scored matchday can be shared as an image; once enough calls are
 * scored, the page says how often each confidence came true. Below, last season's walk-forward
 * test shows how simple strategies would have done, so the page means something before your
 * first match finishes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Empty, Failed, fixtureTones, KitStripe, LeagueSheet, NavBar, pctText, Row, Screen, SectionHeader, Segmented, Skeleton, Stepper, tap, teamName, toneText } from '../components/ui';
import { dayHeader, statusLabel, clock } from '../components/Match';
import { useLeague } from '../context/league';
import { ShareCardSheet, shareAsText } from '../components/ShareCardSheet';
import { currentMatchday, useClubColors, useLastSeasonCalls, usePriorState, useSeason, useSeasons } from '../hooks/data';
import { applyConfidence, applyOutcome, closer as closerOf, combine, competitionsOf, leader, LEVELS, ownCalibration, probs, scoreForecasts, strategies, type BeatRecord, type Forecast, type ScoredMatch } from '../lib/beat';
import { shareCard, type ShareCard } from '../lib/share';
import { forecastBefore, type Outcome, type Probs, type Ratings } from '../lib/model';
import { isFinished, isLive } from '../lib/football';
import { locked } from '../lib/picks';
import { useForecasts } from '../lib/storage';
import type { ClubColors } from '../lib/colors';
import type { Match } from '../lib/types';
import { color, font, radius, space, type } from '../constants/design';
import { LEAGUES, type League } from '../constants/leagues';

const OUTCOMES: Outcome[] = ['H', 'D', 'A'];
const b3 = (x: number) => x.toFixed(3);
const code = (t: Match['homeTeam']) => (t.tla ?? teamName(t).slice(0, 3)).toUpperCase();
const openMatch = (m: Match, c: number) => router.push({ pathname: '/match/[id]', params: { id: String(m.id), c: String(c) } });
const split = (m: Match, p: Probs) => `${code(m.homeTeam)} ${pctText(p.home)} · Draw ${pctText(p.draw)} · ${code(m.awayTeam)} ${pctText(p.away)}`;
const spoken = (m: Match, p: Probs) => `${teamName(m.homeTeam)} ${pctText(p.home)}, draw ${pctText(p.draw)}, ${teamName(m.awayTeam)} ${pctText(p.away)}`;
const scoreLine = (m: Match) => `${teamName(m.homeTeam)} ${m.score.fullTime.home}–${m.score.fullTime.away} ${teamName(m.awayTeam)}`;

export default function BeatTheModel() {
  const { league, setLeague } = useLeague();
  const season = useSeason(league);
  const matches = useMemo(() => season.data?.matches ?? [], [season.data]);
  const { prior, ready: priorReady } = usePriorState(league, season.data?.matches);
  const colors = useClubColors(league);
  const [forecasts, setForecasts, ready] = useForecasts();
  const [leagues, setLeagues] = useState(false);

  // the model's forecasts and your record wait for last season's results, so the model is scored as the app ships it
  const scoring = ready && priorReady;
  const record = useMemo(() => (scoring ? scoreForecasts(Object.values(forecasts), matches, prior) : null), [scoring, forecasts, matches, prior]);
  const byId = useMemo(() => new Map(record?.rows.map((r) => [r.match.id, r]) ?? []), [record]);

  // the record across competitions: the other ones you have calls in load after this one, one at a time
  const mine = useMemo(() => (scoring ? competitionsOf(Object.values(forecasts), LEAGUES.map((l) => l.id)) : []), [scoring, forecasts]);
  const others = useMemo(() => mine.filter((id) => id !== league.id), [mine, league.id]);
  const seasons = useSeasons(others);
  const parts = useMemo<Part[]>(() => {
    if (!record) return [];
    const all = Object.values(forecasts);
    return LEAGUES.filter((l) => l.id === league.id || others.includes(l.id)).map((l) => {
      const s = seasons.loaded[l.id];
      return { league: l, record: l.id === league.id ? record : s ? scoreForecasts(all, s.matches, s.prior) : null, failed: seasons.failed.includes(l.id) };
    });
  }, [record, forecasts, others, league.id, seasons.loaded, seasons.failed]);
  const overall = useMemo(() => (record ? combine(parts.flatMap((p) => (p.record ? [p.record] : []))) : null), [record, parts]);
  const calibration = useMemo(() => (overall ? ownCalibration(overall.rows) : null), [overall]);
  const [sharing, setSharing] = useState<ShareCard | null>(null);

  const days = useMemo(() => [...new Set(matches.map((m) => m.matchday).filter((d): d is number => !!d))].sort((a, b) => a - b), [matches]);
  const cur = useMemo(() => currentMatchday(matches), [matches]);
  const [md, setMd] = useState<number | null>(cur);
  useEffect(() => setMd(cur), [cur]);
  const fixtures = useMemo(() => {
    if (md) return matches.filter((m) => m.matchday === md).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    // competitions without matchdays (knockouts): the next two weeks
    const now = Date.now();
    return matches.filter((m) => Math.abs(new Date(m.utcDate).getTime() - now) < 14 * 86_400_000).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }, [matches, md]);
  // the model's forecast for fixtures that have kicked off: from the results before their day, one fit per day
  const modelFor = useMemo(() => {
    const cache = new Map<string, Ratings | null>();
    return (m: Match) => (scoring && locked(m) ? forecastBefore(matches, m, prior, cache) : null);
  }, [scoring, matches, prior]);

  const loading = (season.loading && !season.data) || !scoring;
  const lead = overall ? leader(overall) : null;
  const names = (ps: Part[]) => ps.map((p) => p.league.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const pending = parts.filter((p) => !p.record && !p.failed);
  const unloaded = parts.filter((p) => p.failed);
  const counted = parts.filter((p) => p.record?.n).length;
  // the scored fixtures of the matchday on screen: what its share card shows
  const scoredHere = fixtures.flatMap((m) => byId.get(m.id) ?? []);
  const share = () => {
    const card = shareCard(scoredHere, md ? `${league.name} · Matchday ${md}` : league.name, (m) => fixtureTones(colors.get(m.homeTeam.id), colors.get(m.awayTeam.id), color.bg));
    if (card && !shareAsText(card)) setSharing(card);
  };

  return (
    <Screen tabBar={false}>
      <NavBar title="Beat the model" />
      <Pressable
        onPress={() => {
          tap('select');
          setLeagues(true);
        }}
        hitSlop={8}
        style={styles.league}
        accessibilityRole="button"
        accessibilityLabel={`${league.name}. Change competition`}
      >
        <Text style={styles.leagueText}>{league.name}</Text>
        <Ionicons name="chevron-down" size={14} color={color.text2} />
      </Pressable>
      <LeagueSheet visible={leagues} onClose={() => setLeagues(false)} />

      {season.error && !season.data ? (
        <Failed message={season.error} code={season.errorCode} onRetry={season.refetch} />
      ) : loading || !record || !overall ? (
        <Skeleton rows={4} height={96} gap={space.lg} />
      ) : (
        <>
          <View style={styles.hero}>
            <View accessible accessibilityLabel={recordLabel(overall, lead)}>
              <View style={styles.vs}>
                <Side label="You" value={overall.you} best={lead === 'you'} />
                <Text style={styles.vsText}>vs</Text>
                <Side label="Model" value={overall.model} best={lead === 'model'} right />
              </View>
              <Text style={type.headline}>
                {lead === 'you' ? "You're ahead" : lead === 'model' ? 'The model is ahead' : lead === 'level' ? 'Level' : 'No matches scored yet'}
              </Text>
              <Text style={[type.body, styles.sub]}>
                {overall.n
                  ? `Average Brier score on ${overall.n} finished ${overall.n === 1 ? 'match' : 'matches'} you both called${counted > 1 ? `, across ${counted} competitions` : ''}. Lower is better. You were closer on ${overall.youCloser}, the model on ${overall.modelCloser}${overall.level ? `, ${overall.level} level` : ''}.`
                  : 'Call a fixture below. It\'s scored when the match finishes, with the same Brier score the model gets.'}
                {overall.waiting ? ` ${overall.waiting} ${overall.waiting === 1 ? 'call is' : 'calls are'} waiting for full time.` : ''}
                {overall.noModel ? ` ${overall.noModel} not scored: the model had no forecast that early in the season.` : ''}
                {overall.late ? ` ${overall.late} not scored: changed after kick-off.` : ''}
                {pending.length ? ` Still loading your calls in ${names(pending)}.` : ''}
              </Text>
            </View>
            {unloaded.length ? (
              <Text style={[type.footnote, styles.sub]}>
                Couldn't load {names(unloaded)}, so {unloaded.length === 1 ? 'its' : 'their'} calls aren't counted here.{' '}
                <Text style={styles.link} onPress={seasons.retry} accessibilityRole="button">
                  Try again
                </Text>
              </Text>
            ) : null}
          </View>

          {parts.length > 1 ? (
            <View style={styles.sec}>
              <SectionHeader title="By competition" />
              {parts.map((p, i) => (
                <CompetitionRow key={p.league.id} part={p} current={p.league.id === league.id} last={i === parts.length - 1} onPress={() => setLeague(p.league)} />
              ))}
            </View>
          ) : null}

          <View style={styles.sec}>
            <SectionHeader title="Make your calls" />
            <Text style={[type.footnote, styles.note]}>
              Pick a result and how sure you are. Lean puts 50% on it, Likely 70%, Sure 90%, and the rest is split between the
              other two. Calls lock at kick-off, when the model's forecast is shown.
            </Text>
            {md && days.length ? <Stepper value={md} min={days[0]} max={days[days.length - 1]} onChange={setMd} label={`Matchday ${md} of ${days[days.length - 1]}`} /> : null}
            {!fixtures.length ? (
              <Empty icon="calendar-outline" title="Nothing scheduled" text="New fixtures appear here as soon as they're announced." />
            ) : (
              fixtures.map((m, i) => (
                <FixtureCall
                  key={m.id}
                  m={m}
                  first={i === 0 || dayHeader(m.utcDate) !== dayHeader(fixtures[i - 1].utcDate)}
                  f={forecasts[String(m.id)]}
                  model={modelFor(m)}
                  scored={byId.get(m.id)}
                  colors={[colors.get(m.homeTeam.id), colors.get(m.awayTeam.id)]}
                  onOutcome={(o) => setForecasts((all) => applyOutcome(all, m, league.id, o))}
                  onConfidence={(c) => setForecasts((all) => applyConfidence(all, m, c))}
                  onOpen={() => openMatch(m, league.id)}
                />
              ))
            )}
            {scoredHere.length ? (
              <Button label={md ? 'Share this matchday' : 'Share these results'} icon="share-outline" kind="secondary" onPress={share} style={{ marginTop: space.lg }} />
            ) : null}
          </View>
          <ShareCardSheet card={sharing} onClose={() => setSharing(null)} />

          {record.n ? (
            <View style={styles.sec}>
              <SectionHeader title="Match by match" />
              <Text style={[type.footnote, styles.note]}>
                {parts.length > 1 ? `${league.name}. ` : ''}Brier score per match, you then the model. Lower is better; 0 is perfect, 2 is as wrong as it gets.
              </Text>
              {record.rows.map((r, i) => (
                <ScoredRow key={r.match.id} r={r} last={i === record.rows.length - 1} onPress={() => openMatch(r.match, league.id)} />
              ))}
            </View>
          ) : null}

          {calibration ? (
            <View style={styles.sec}>
              <SectionHeader title="How sure, how often right" />
              <View style={styles.cmp}>
                {calibration.map((l) => (
                  <View key={l.label} style={styles.cmpRow} accessible accessibilityLabel={`${l.label}, ${l.p * 100}%: right ${l.right} of ${l.n}`}>
                    <Text style={styles.cmpLabel}>
                      {l.label} ({l.p * 100}%)
                    </Text>
                    <Text style={[styles.cmpValue, { color: color.text }]}>
                      right {l.right} of {l.n}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[type.footnote, { marginTop: space.sm }]}>
                Your {overall.n} scored calls{counted > 1 ? ', every competition' : ''}. If your confidence is well judged, Lean comes true about half the time, Likely 7 in
                10, Sure 9 in 10. These are small counts: one result moves them a lot, so read them as a hint.
              </Text>
            </View>
          ) : null}

          <LastSeason thisSeason={season.data?.matches} />

          <View style={styles.sec}>
            <SectionHeader title="How it's scored" />
            <Text style={type.body}>
              The Brier score adds up the squared gaps between the chances given and what happened, over home win, draw and away
              win. Calling the result at 90% scores 0.015; getting it wrong at 90% scores 1.715, so being sure costs a lot when
              you're wrong. A third each scores 0.667 every time.
            </Text>
            <Text style={[type.body, { marginTop: space.md }]}>
              The model's forecast is fitted on the results before the match's day only, the same one scored on{' '}
              <Text style={styles.link} onPress={() => router.push('/model')} accessibilityRole="link">
                How good is the model?
              </Text>{' '}
              Only finished matches with a call from you made before kick-off are scored. Your calls stay on this device.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

/** One competition's share of the record: null while its season loads, `failed` when it couldn't. */
interface Part {
  league: League;
  record: BeatRecord | null;
  failed: boolean;
}

function CompetitionRow({ part, current, last, onPress }: { part: Part; current: boolean; last: boolean; onPress: () => void }) {
  const r = part.record;
  const lead = r ? leader(r) : null;
  const tag = lead === 'you' ? 'You' : lead === 'model' ? 'Model' : lead === 'level' ? 'Level' : '';
  const line = !r
    ? part.failed
      ? "Couldn't load, not counted"
      : 'Loading'
    : r.n
    ? `You ${b3(r.you!)} · Model ${b3(r.model!)} · ${r.n} ${r.n === 1 ? 'match' : 'matches'}`
    : r.waiting
    ? `${r.waiting} waiting for full time`
    : 'No matches scored';
  return (
    <Row
      title={part.league.name}
      subtitle={line}
      right={tag ? <Text style={[styles.tag, lead === 'you' && { color: color.accentText }]}>{tag}</Text> : undefined}
      onPress={current ? undefined : onPress}
      chevron={!current}
      divider={!last}
      accessibilityLabel={`${part.league.name}. ${line}${tag ? `. Ahead: ${tag}` : ''}${current ? '. Shown below' : '. Show its fixtures'}`}
    />
  );
}

function recordLabel(r: BeatRecord, lead: ReturnType<typeof leader>) {
  if (!r.n) return 'No matches scored yet';
  const who = lead === 'you' ? "You're ahead" : lead === 'model' ? 'The model is ahead' : 'Level';
  return `${who}. Your Brier score ${b3(r.you!)}, the model's ${b3(r.model!)}, on ${r.n} matches. You were closer on ${r.youCloser}, the model on ${r.modelCloser}.`;
}

function Side({ label, value, best, right }: { label: string; value: number | null; best: boolean; right?: boolean }) {
  return (
    <View style={[{ flex: 1, gap: 2 }, right && { alignItems: 'flex-end' }]}>
      <Text style={[styles.big, best && { color: color.accentText }]}>{value === null ? '–' : b3(value)}</Text>
      <Text style={styles.sideLabel}>{label}</Text>
    </View>
  );
}

function FixtureCall({
  m,
  first,
  f,
  model,
  scored,
  colors,
  onOutcome,
  onConfidence,
  onOpen,
}: {
  m: Match;
  first: boolean;
  f?: Forecast;
  model: Probs | null;
  scored?: ScoredMatch;
  colors: [ClubColors | undefined, ClubColors | undefined];
  onOutcome: (o: Outcome) => void;
  onConfidence: (c: number) => void;
  onOpen: () => void;
}) {
  const isLocked = locked(m);
  const done = isFinished(m);
  const tones = fixtureTones(colors[0], colors[1], color.surface);
  const yours = f ? probs(f.outcome, f.confidence) : null;
  const when = isLive(m) || done ? statusLabel(m) : clock(m.utcDate);
  const team = (t: Match['homeTeam'], c: ClubColors | undefined, goals: number | null, tone: string) => (
    <View style={styles.team}>
      <KitStripe colors={c} tone={tone} height={18} width={4} />
      <Text style={styles.teamName} numberOfLines={1}>{teamName(t)}</Text>
      {done || isLive(m) ? <Text style={styles.goals}>{goals ?? '–'}</Text> : null}
    </View>
  );
  return (
    <View style={{ paddingTop: first ? space.lg : space.sm }}>
      {first ? <Text style={[type.overline, { marginBottom: space.sm }]}>{dayHeader(m.utcDate)}</Text> : null}
      <View style={styles.card}>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${teamName(m.homeTeam)} v ${teamName(m.awayTeam)}, ${when}. Open match`} style={styles.cardHead}>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {team(m.homeTeam, colors[0], m.score.fullTime.home, tones[0])}
            {team(m.awayTeam, colors[1], m.score.fullTime.away, tones[1])}
          </View>
          <View style={styles.when}>
            {isLocked ? <Ionicons name="lock-closed" size={12} color={color.text3} accessibilityLabel="Locked" /> : null}
            <Text style={[styles.whenText, isLive(m) && { color: color.live }]}>{when}</Text>
          </View>
        </Pressable>

        {!isLocked ? (
          <View style={{ gap: space.sm }}>
            <Segmented
              options={[code(m.homeTeam), 'Draw', code(m.awayTeam)]}
              value={f ? OUTCOMES.indexOf(f.outcome) : -1}
              onChange={(i) => onOutcome(OUTCOMES[i])}
              tones={[tones[0], undefined, tones[1]]}
            />
            {f ? (
              <>
                <Segmented options={LEVELS.map((l) => `${l.label} ${l.p * 100}%`)} value={LEVELS.findIndex((l) => l.p === f.confidence)} onChange={(i) => onConfidence(LEVELS[i].p)} />
                <Text style={[styles.line, { color: f.outcome === 'D' ? color.text : toneText(f.outcome === 'H' ? tones[0] : tones[1], color.surface) }]} accessibilityLabel={`Your forecast: ${spoken(m, yours!)}`}>
                  You · {split(m, yours!)}
                </Text>
              </>
            ) : (
              <Text style={type.footnote}>Tap a result to call it. Tap it again to clear.</Text>
            )}
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={[styles.line, !yours && { color: color.text3 }]} accessibilityLabel={yours ? `Your forecast: ${spoken(m, yours)}` : 'No call made'}>
              {yours ? `You · ${split(m, yours)}` : 'No call made before kick-off'}
            </Text>
            {model ? (
              <Text style={[styles.line, { color: color.text2 }]} accessibilityLabel={`Model's forecast: ${spoken(m, model)}`}>
                Model · {split(m, model)}
              </Text>
            ) : null}
            {scored ? (
              <Text style={styles.verdict}>
                Brier: you {b3(scored.youBrier)}, model {b3(scored.modelBrier)}.{' '}
                <Text style={{ color: scored.youBrier < scored.modelBrier ? color.accentText : color.text2, fontFamily: font.semibold }}>
                  {scored.youBrier < scored.modelBrier ? 'You were closer' : scored.modelBrier < scored.youBrier ? 'The model was closer' : 'Level'}
                </Text>
              </Text>
            ) : yours && !done ? (
              <Text style={type.footnote}>Locked at kick-off. Scored at full time.</Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

function ScoredRow({ r, last, onPress }: { r: ScoredMatch; last: boolean; onPress: () => void }) {
  const closer = { you: 'You', model: 'Model', level: 'Level' }[closerOf(r)];
  return (
    <Row
      title={scoreLine(r.match)}
      subtitle={`You ${b3(r.youBrier)} · Model ${b3(r.modelBrier)}`}
      right={<Text style={[styles.tag, closer === 'You' && { color: color.accentText }]}>{closer}</Text>}
      onPress={onPress}
      chevron
      divider={!last}
      accessibilityLabel={`${scoreLine(r.match)}. Your Brier ${b3(r.youBrier)}, the model's ${b3(r.modelBrier)}. Closer: ${closer}`}
    />
  );
}

/** Last season, walk-forward: how simple ways of filling in this page would have scored against the model. */
function LastSeason({ thisSeason }: { thisSeason?: Match[] }) {
  const { league } = useLeague();
  const { calls, season: year, loading } = useLastSeasonCalls(league, thisSeason);
  const rows = useMemo(() => strategies(calls ?? []), [calls]);
  const label = year ? `${year}-${String(year + 1).slice(2)}` : '';
  return (
    <View style={styles.sec}>
      <SectionHeader title="Last season: simple strategies" />
      {loading ? (
        <Skeleton rows={3} height={28} />
      ) : !calls?.length ? (
        <Text style={type.footnote}>Last season's results aren't available for {league.name} right now.</Text>
      ) : (
        <>
          <Text style={[type.footnote, styles.note]}>
            Historical, not your record: {calls.length} {league.name} matches from {label}, each forecast from the results before
            its day only, after the first 30. Average Brier score, lower is better.
          </Text>
          <View style={styles.cmp}>
            {rows.map((s) => (
              <View key={s.label} style={styles.cmpRow} accessible accessibilityLabel={`${s.label}: ${b3(s.brier)}`}>
                <Text style={[styles.cmpLabel, s.model && { color: color.text, fontFamily: font.semibold }]}>{s.label}</Text>
                <Text style={[styles.cmpValue, s.model && { color: color.accentText }]}>{b3(s.brier)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  league: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: space.sm },
  leagueText: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.text2 },
  hero: { marginTop: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface, gap: 2 },
  vs: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  vsText: { fontFamily: font.medium, fontSize: 15, color: color.text3, paddingHorizontal: space.md },
  big: { fontFamily: font.cardHeavy, fontSize: 44, lineHeight: 48, color: color.text, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  sideLabel: { fontFamily: font.medium, fontSize: 13, color: color.text3 },
  sub: { marginTop: space.sm, color: color.text2 },
  sec: { marginTop: space.xl },
  note: { marginBottom: space.md },
  card: { borderRadius: radius.md, backgroundColor: color.surface, padding: space.md, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  team: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamName: { flex: 1, minWidth: 0, fontFamily: font.semibold, fontSize: 15, color: color.text },
  goals: { fontFamily: font.cardHeavy, fontSize: 16, color: color.text, fontVariant: ['tabular-nums'] },
  when: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  whenText: { fontFamily: font.medium, fontSize: 13, color: color.text3, fontVariant: ['tabular-nums'] },
  line: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.text, fontVariant: ['tabular-nums'] },
  verdict: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.text2, fontVariant: ['tabular-nums'] },
  tag: { fontFamily: font.semibold, fontSize: 13, color: color.text3, marginRight: 4 },
  link: { color: color.accentText, fontFamily: font.semibold },
  cmp: { borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space.md, paddingVertical: space.sm },
  cmpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 6 },
  cmpLabel: { flex: 1, fontFamily: font.medium, fontSize: 15, color: color.text2 },
  cmpValue: { fontFamily: font.semibold, fontSize: 15, color: color.text2, fontVariant: ['tabular-nums'] },
});
