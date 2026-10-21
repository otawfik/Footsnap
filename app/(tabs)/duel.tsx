/**
 * The Duel lobby: your deck (built from your collection), your record, how it
 * plays, and the button into the arena.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Header, LeagueTabs, Section, Panel, Skeleton, Failed, Button, Wallet } from '../../components/ui';
import { SnapCard } from '../../components/SnapCard';
import { useLeague } from '../../context/league';
import { useCards } from '../../hooks/data';
import { useCollection, useProfile } from '../../lib/storage';
import { buildDeck, opponentDeck, setMatch } from '../../lib/decks';
import { lookOf } from '../../lib/collection';
import { hash } from '../../lib/rng';
import { C, F, R, S, T } from '../../constants/theme';

const RULES = [
  ['Three zones', 'Left wing, Centre, Right wing. Each reveals a condition that bends the rules there.'],
  ['Six turns', 'You get as much energy as the turn number. Cards cost energy to play; play them into a zone.'],
  ['Win two zones', 'After turn 6, more Power in a zone wins it. Win two of three to win the Duel.'],
  ['Real abilities', "Every card's ability comes from the player's real season: top scorers, playmakers, penalty takers, wonderkids, keepers."],
  ['Press', 'Confident? Press to double the stakes, like a high press. Losing? Retreat early to lose less. Wins pay 10 credits per stake.'],
];

export default function Duel() {
  const { league, setLeague } = useLeague();
  const { cards, list, loading, error, errorCode, refetch } = useCards(league);
  const [collection] = useCollection();
  const [profile] = useProfile();
  const { width } = useWindowDimensions();
  const owned = collection[String(league.id)] ?? {};
  const deck = useMemo(() => {
    if (!cards) return null;
    const mine = list.filter((c) => owned[String(c.id)]);
    return buildDeck(mine, list, hash(`deck:${league.id}`));
  }, [cards, list, owned, league.id]);
  const gridW = Math.min(width, 520) - S.base * 2;
  const cw = Math.floor((gridW - S.sm * 3) / 4);
  const rec = profile.duel ?? { played: 0, won: 0, drawn: 0, best: 0 };

  const start = () => {
    if (!deck) return;
    const seed = hash(`${Date.now()}:${league.id}`);
    setMatch({ you: deck.cards, opponent: opponentDeck(deck.cards, list, seed), seed, loans: deck.loans });
    router.push('/arena');
  };

  return (
    <Screen>
      <Header kicker="Card battles with real players" title="Duel" right={<View style={{ paddingBottom: 8 }}><Wallet credits={profile.credits} /></View>} />
      <LeagueTabs value={league.id} onChange={setLeague} />
      {loading ? (
        <Section title="Building your deck">
          <Skeleton rows={2} height={140} />
        </Section>
      ) : error ? (
        <Section title="Duel">
          <Failed message={error} code={errorCode} onRetry={refetch} />
        </Section>
      ) : deck ? (
        <>
          <View style={{ paddingHorizontal: S.base, marginTop: S.md }}>
            <Panel style={styles.hero}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={T.kicker}>{rec.played ? `${rec.won} won · ${rec.played - rec.won - rec.drawn} lost${rec.drawn ? ` · ${rec.drawn} drawn` : ''}` : 'Your first Duel'}</Text>
                <Text style={T.h2}>Take on the AI manager</Text>
                <Text style={T.small}>A {league.name} deck built to the same cost curve as yours.</Text>
              </View>
              <Button label="Play" icon="game-controller" onPress={start} />
            </Panel>
          </View>

          <Section title="Your deck" note={deck.loans.size ? `${12 - deck.loans.size} from your collection, ${deck.loans.size} on loan. Collect cards to replace the loans.` : 'All 12 from your collection'}>
            <View style={[styles.grid, { width: gridW }]}>
              {deck.cards.map((c) => (
                <Pressable key={c.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })} accessibilityRole="button" style={{ opacity: deck.loans.has(c.id) ? 0.7 : 1 }}>
                  <SnapCard card={c} width={cw} look={lookOf(owned[String(c.id)])} loadPhoto competition={league.name} />
                  {deck.loans.has(c.id) ? (
                    <View style={styles.loan}>
                      <Text style={styles.loanText}>LOAN</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title="How it plays">
            <Panel>
              {RULES.map(([t, d], i) => (
                <View key={t} style={[styles.rule, i < RULES.length - 1 && styles.line]}>
                  <Text style={styles.ruleNum}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleTitle}>{t}</Text>
                    <Text style={T.small}>{d}</Text>
                  </View>
                </View>
              ))}
            </Panel>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.base },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, paddingTop: S.md },
  loan: { position: 'absolute', bottom: 6, alignSelf: 'center', backgroundColor: C.draw, borderRadius: R.xs, paddingHorizontal: 5 },
  loanText: { fontFamily: F.label, fontSize: 10, letterSpacing: 1, color: C.night },
  rule: { flexDirection: 'row', gap: S.md, padding: S.md },
  line: { borderBottomWidth: 1, borderBottomColor: C.line },
  ruleNum: { fontFamily: F.numHeavy, fontSize: 22, color: C.flare, width: 22 },
  ruleTitle: { fontFamily: F.label, fontSize: 15, letterSpacing: 0.6, color: C.chalk },
});
