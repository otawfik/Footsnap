/**
 * Play (SPEC.md §5): the Duel hero (your 12-card deck, your record, the button into
 * the arena), Who's this?, and how the Duel works.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Button, Credits, LargeHeader, Pitch, Row, Screen, onFill, solidFill, tap } from '../../components/ui';
import { DuelCard } from '../../components/duel/DuelCard';
import { useLeague } from '../../context/league';
import { useCards, useTeams } from '../../hooks/data';
import { today, useCollection, useProfile } from '../../lib/storage';
import { buildDeck, opponentDeck, recordLine, setMatch } from '../../lib/decks';
import { lookOf } from '../../lib/collection';
import { GUESSES_PER_DAY } from '../../lib/guess';
import { CREDITS_PER_PRIZE, CROWD_BOOST, TURNS } from '../../lib/game';
import { groundLabel, pickStadiums, stadiumPool } from '../../lib/stadiums';
import { hash } from '../../lib/rng';
import { color, font, radius, space, type } from '../../constants/design';

const RULES: [string, string][] = [
  [
    'Three stadiums',
    `Three real grounds from the league. A club's players get +${CROWD_BOOST} Power from the home crowd at their own ground. Each ground also has a twist that bends the rules there: the first shows on turn 1, the next on turn 2, the last on turn 3.`,
  ],
  ['Six turns', 'You get as much energy as the turn number. Cards cost energy; play them into a stadium, up to four a side.'],
  ['Win two stadiums', 'After turn 6, more Power at a stadium wins it. Win two of three to win the duel.'],
  [
    'Real abilities',
    "Every card's ability is built from the player's real season, age and passport. Kick-off fires as it lands, While here lasts, Every turn adds up, Full time fires once at the end.",
  ],
  [
    'Press',
    `Confident? Press to double the prize, like a high press. The prize doubles again at full time, and a win pays ${CREDITS_PER_PRIZE} credits for every ×1. Retreat any time; losing never costs credits.`,
  ],
];

const HAND_W = 74;

export default function Play() {
  const { league } = useLeague();
  const { cards, list, loading, error, refetch } = useCards(league);
  const teams = useTeams(league);
  const pool = useMemo(() => stadiumPool(teams.data?.teams ?? []), [teams.data]);
  const [collection] = useCollection();
  const [profile] = useProfile();
  const [rulesOpen, setRulesOpen] = useState(false);
  const reduced = useReducedMotion();
  const owned = useMemo(() => collection[String(league.id)] ?? {}, [collection, league.id]);
  const deck = useMemo(() => {
    if (!cards) return null;
    const mine = list.filter((c) => owned[String(c.id)]);
    return buildDeck(mine, list, hash(`deck:${league.id}`));
  }, [cards, list, owned, league.id]);
  const rec = profile.duel ?? { played: 0, won: 0, drawn: 0, best: 0 };
  const day = today();
  const guessesLeft = Math.max(0, GUESSES_PER_DAY - (profile.guesses.day === day ? profile.guesses.used : 0));

  // the next duel is drawn when the lobby comes into view, so its grounds can be shown before Play;
  // coming back after a duel draws a fresh one
  const [seed, setSeed] = useState(0);
  useFocusEffect(useCallback(() => setSeed(hash(`${Date.now()}:${league.id}`)), [league.id]));
  const next = useMemo(() => {
    if (!deck || !seed) return null;
    const opponent = opponentDeck(deck.cards, list, seed);
    // three real grounds when the competition lists venues; plain zones otherwise
    const stadiums = pool.length >= 3 ? pickStadiums(pool, [deck.cards, opponent], seed) : undefined;
    return { opponent, stadiums };
  }, [deck, list, pool, seed]);

  const start = () => {
    if (!deck || !next) return;
    setMatch({ you: deck.cards, opponent: next.opponent, seed, loans: deck.loans, stadiums: next.stadiums });
    router.push('/arena');
  };

  const mineCount = deck ? deck.cards.length - deck.loans.size : 0;

  return (
    <Screen>
      <LargeHeader title="Play" leagueMenu right={<Credits credits={profile.credits} />} />

      {/* the Duel, on a floodlit pitch */}
      <Pitch style={styles.hero}>
        <View style={styles.heroHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.title} accessibilityRole="header">
              Duel
            </Text>
            <Text style={type.body}>Win 2 of 3 stadiums in {TURNS} turns against the AI Manager</Text>
          </View>
        </View>

        {loading ? (
          <View style={[styles.deckRow, { paddingHorizontal: 16 }]}>
            {Array.from({ length: 4 }, (_, i) => (
              <View key={i} style={styles.ghost} />
            ))}
          </View>
        ) : error ? (
          <View style={styles.failed}>
            <Text style={type.body}>Couldn't load the {league.name} cards.</Text>
            <Button label="Try again" kind="secondary" size="sm" onPress={refetch} />
          </View>
        ) : deck ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(200)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.deckRow}
              style={styles.deckScroll}
              accessibilityLabel={`Your deck: ${deck.cards.length} cards`}
            >
              {deck.cards.map((c) => {
                const loan = deck.loans.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      tap('select');
                      router.push({
                        pathname: '/card/[id]',
                        params: { id: String(c.id) },
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name}${loan ? ', on loan' : ''}. Open card`}
                    style={{ alignItems: 'center', gap: 6 }}
                  >
                    <DuelCard card={c} size="hand" width={HAND_W} tier={lookOf(owned[String(c.id)]).tier} />
                    {deck.loans.size ? <Text style={[styles.loan, !loan && { opacity: 0 }]}>Loan</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.deckNote}>
              {deck.loans.size
                ? `${mineCount} of 12 from your collection, ${deck.loans.size} on loan. Collect cards to replace the loans.`
                : 'All 12 from your collection, the strongest that fit the cost curve.'}
            </Text>
            {next?.stadiums ? (
              <View style={styles.grounds}>
                <Text style={styles.groundsTitle}>Next duel's grounds</Text>
                <View style={styles.groundRow}>
                  {next.stadiums.map((st) => {
                    const fill = st.colors[0] ? solidFill(st.colors[0].primary) : color.raised;
                    const ink = st.colors[0] ? onFill(fill) : color.text2;
                    const yours = deck.cards.filter((c) => st.clubs.includes(c.team.id)).length;
                    return (
                      <View
                        key={st.name}
                        style={styles.ground}
                        accessible
                        accessibilityLabel={`${st.name}. Home crowd for ${st.codes.join(' and ') || 'nobody'}. ${yours ? `${yours} of your cards play here.` : 'None of your cards play here.'}`}
                      >
                        <View style={[styles.groundBand, { backgroundColor: fill }]}>
                          <Text style={[styles.groundName, { color: ink }]} numberOfLines={2}>
                            {groundLabel(st.name)}
                          </Text>
                        </View>
                        <Text style={styles.groundCrowd} numberOfLines={1}>
                          {st.codes.join(' · ')} crowd
                        </Text>
                        <Text style={[styles.groundYours, yours > 0 && { color: color.win }]} numberOfLines={1}>
                          {yours ? `${yours} home card${yours > 1 ? 's' : ''}` : 'No home cards'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <View
          style={styles.record}
          accessible
          accessibilityLabel={
            rec.played
              ? `Record: ${rec.won} won, ${rec.drawn} drawn, ${rec.played - rec.won - rec.drawn} lost. Best prize times ${rec.best}`
              : 'No duels played yet'
          }
        >
          {rec.played ? (
            recordLine(rec).map(([k, v], i) => (
              <Text key={k} style={styles.recordItem}>
                {i ? <Text style={styles.recordSep}>{'  ·  '}</Text> : null}
                <Text style={styles.recordKey}>{k} </Text>
                {v}
              </Text>
            ))
          ) : (
            <Text style={styles.recordKey}>Your first duel. Win to earn credits.</Text>
          )}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Button label="Play" onPress={start} disabled={!deck} accessibilityLabel="Play a duel against the AI Manager" />
        </View>
      </Pitch>

      {/* Who's this? */}
      <View style={{ marginTop: space.lg }}>
        <Row
          left={
            <View style={styles.qmark}>
              <Text style={styles.qmarkText}>?</Text>
            </View>
          }
          title="Who's this?"
          subtitle={`Name ${GUESSES_PER_DAY} players a day`}
          right={<Text style={styles.rowRight}>{guessesLeft ? `${guessesLeft} left` : 'Done today'}</Text>}
          chevron
          onPress={() => router.push('/guess')}
        />

        {/* how it works */}
        <Row
          title="How to play"
          subtitle={rulesOpen ? undefined : 'Stadiums, energy, Press and the prize'}
          right={<Ionicons name={rulesOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.text3} />}
          onPress={() => {
            tap('select');
            setRulesOpen((o) => !o);
          }}
          divider={rulesOpen}
          accessibilityState={{ selected: rulesOpen }}
        />
        {rulesOpen
          ? RULES.map(([t, d], i) => (
              <Animated.View key={t} entering={reduced ? undefined : FadeIn.duration(200)}>
                <View style={[styles.rule, i < RULES.length - 1 && styles.ruleDivider]}>
                  <Text style={styles.ruleNum}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.headline}>{t}</Text>
                    <Text style={type.body}>{d}</Text>
                  </View>
                </View>
              </Animated.View>
            ))
          : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingVertical: 16,
    gap: 14,
    overflow: 'hidden',
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    gap: 12,
  },
  deckScroll: { flexGrow: 0 },
  deckRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  ghost: {
    width: HAND_W,
    height: Math.round(HAND_W * 1.4),
    borderRadius: 8,
    backgroundColor: color.raised,
  },
  loan: {
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 16,
    color: color.text2,
  },
  deckNote: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: color.text2,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  grounds: { paddingHorizontal: 16, marginTop: 12, gap: 8 },
  groundsTitle: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: color.text2 },
  groundRow: { flexDirection: 'row', gap: 8 },
  ground: { flex: 1, borderRadius: radius.md, backgroundColor: 'rgba(11,18,32,0.82)', overflow: 'hidden', paddingBottom: 8, gap: 2 },
  groundBand: { height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginBottom: 4 },
  groundName: { fontFamily: font.bold, fontSize: 9.5, lineHeight: 11.5, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  groundCrowd: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: color.text, textAlign: 'center', paddingHorizontal: 4 },
  groundYours: { fontFamily: font.regular, fontSize: 11, lineHeight: 15, color: color.text2, textAlign: 'center', paddingHorizontal: 4 },
  failed: { paddingHorizontal: 16, gap: 10, alignItems: 'flex-start' },
  record: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  recordItem: {
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  recordKey: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
    color: color.text2,
  },
  recordSep: { color: color.text3 },
  qmark: {
    width: 28,
    height: 38,
    borderRadius: 5,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qmarkText: { fontFamily: font.cardHeavy, fontSize: 18, color: color.text2 },
  rowRight: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.text3,
    marginRight: 4,
    fontVariant: ['tabular-nums'],
  },
  rule: { flexDirection: 'row', gap: 14, paddingVertical: 12 },
  ruleDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  ruleNum: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 22,
    color: color.accentText,
    width: 16,
    fontVariant: ['tabular-nums'],
  },
});
