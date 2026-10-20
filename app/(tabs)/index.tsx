import React, { useCallback, useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, LeagueTabs, Section, Panel, Skeleton, Empty, Failed, LiveLamp, useMounted } from '../../components/ui';
import { Scoreboard, ResultRow, FixtureCard } from '../../components/Match';
import { useLeague } from '../../context/league';
import { useClubColors, useLiveSeason } from '../../hooks/data';
import { fit, predict } from '../../lib/model';
import { C } from '../../constants/theme';

export default function Matchday() {
  const { league, setLeague } = useLeague();
  const season = useLiveSeason(league);
  const colors = useClubColors(league);
  const [refreshing, setRefreshing] = useState(false);
  const ratings = useMemo(() => fit(season.data?.matches ?? []), [season.data]);
  const { live, results, upcoming } = season.view;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await season.refetch();
    setRefreshing(false);
  }, [season]);

  const mounted = useMounted();
  const date = mounted ? new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : ' ';

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        kicker={date}
        title="Matchday"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 8 }}>
            {live.length ? <LiveLamp label={`${live.length} LIVE`} /> : null}
            <Pressable onPress={() => router.push('/about')} hitSlop={10} accessibilityRole="button" accessibilityLabel="About FootSnap">
              <Ionicons name="information-circle-outline" size={24} color={C.muted} />
            </Pressable>
          </View>
        }
      />
      <LeagueTabs value={league.id} onChange={setLeague} />

      {season.error && !season.data ? (
        <Section title="Matchday">
          <Failed message={season.error} code={season.errorCode} onRetry={season.refetch} />
        </Section>
      ) : season.loading && !season.data ? (
        <Section title="Loading">
          <Skeleton rows={4} height={96} />
        </Section>
      ) : (
        <>
          {live.length > 0 && (
            <Section title="Live now">
              {live.map((m) => (
                <Scoreboard key={m.id} match={m} colors={colors} />
              ))}
            </Section>
          )}

          <Section title="Coming up" note={ratings ? 'Odds from a goals model fitted to this season' : undefined}>
            {upcoming.length === 0 ? (
              <Empty icon="calendar-outline" title="Nothing scheduled" text="Check back closer to the next matchday." />
            ) : (
              upcoming.map((m) => (
                <FixtureCard key={m.id} match={m} colors={colors} prediction={ratings ? predict(ratings, m.homeTeam.id, m.awayTeam.id) : null} />
              ))
            )}
          </Section>

          <Section title="Results">
            {results.length === 0 ? (
              <Empty icon="flag-outline" title="No results yet" text="The season hasn't kicked off." />
            ) : (
              <Panel>
                {results.map((m, i) => (
                  <ResultRow key={m.id} match={m} colors={colors} last={i === results.length - 1} />
                ))}
              </Panel>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
