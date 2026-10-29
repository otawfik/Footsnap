/**
 * Your teams: follow clubs from any of the six competitions. Followed clubs lead Home with
 * their next fixture. Stored on the device only (lib/storage.ts → useFavorites).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, NavBar, FilterChips, KitChip, Row, Overline, Skeleton, Failed, tap } from '../components/ui';
import { useLeague } from '../context/league';
import { LEAGUES, LEAGUE_MAP } from '../constants/leagues';
import { useTeams } from '../hooks/data';
import { clubColors } from '../lib/colors';
import { isFavorite, toggleFavorite, useFavorites } from '../lib/storage';
import { color, font, space, type } from '../constants/design';

export default function Teams() {
  const { league } = useLeague();
  const [idx, setIdx] = useState(Math.max(0, LEAGUES.findIndex((l) => l.id === league.id)));
  const comp = LEAGUES[idx];
  const teams = useTeams(comp);
  const [favorites, setFavorites] = useFavorites();
  const list = useMemo(() => (teams.data?.teams ?? []).slice().sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name)), [teams.data]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen tabBar={false}>
      <NavBar title="Your teams" back="close" onBack={close} right={<Pressable onPress={close} hitSlop={10} accessibilityRole="button"><Text style={styles.done}>Done</Text></Pressable>} />
      <Text style={[type.largeTitle, { marginTop: space.sm }]} accessibilityRole="header">Your teams</Text>
      <Text style={[type.body, { marginTop: space.xs, marginBottom: space.xl }]}>Follow clubs and their next match leads Home, ready to pick. Saved on this device only.</Text>

      {favorites.length ? (
        <View style={{ marginBottom: space.xxl }}>
          <Overline right={`${favorites.length}`}>Following</Overline>
          {favorites.map((f, i) => (
            <Row
              key={f.teamId}
              left={<KitChip colors={f.colors} />}
              title={f.name}
              subtitle={LEAGUE_MAP[f.competitionId]?.name}
              divider={i < favorites.length - 1}
              right={
                <Pressable
                  onPress={() => {
                    tap('light');
                    setFavorites((all) => all.filter((x) => x.teamId !== f.teamId));
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Unfollow ${f.name}`}
                >
                  <Ionicons name="remove-circle-outline" size={22} color={color.text3} />
                </Pressable>
              }
            />
          ))}
        </View>
      ) : null}

      <Overline>Add clubs</Overline>
      <FilterChips options={LEAGUES.map((l) => l.name)} value={idx} onChange={setIdx} style={{ marginBottom: space.sm }} />
      {teams.error && !teams.data ? (
        <Failed message={teams.error} code={teams.errorCode} onRetry={teams.refetch} />
      ) : teams.loading && !teams.data ? (
        <Skeleton rows={8} height={44} />
      ) : (
        list.map((t, i) => {
          const on = isFavorite(favorites, t.id);
          const colors = clubColors(t.clubColors, t.id);
          const name = t.shortName ?? t.name;
          return (
            <Row
              key={t.id}
              left={<KitChip colors={colors} />}
              title={name}
              divider={i < list.length - 1}
              accessibilityLabel={on ? `${name}, following. Tap to unfollow` : `Follow ${name}`}
              accessibilityState={{ checked: on }}
              onPress={() => {
                tap('light');
                setFavorites((all) => toggleFavorite(all, { competitionId: comp.id, teamId: t.id, name, tla: t.tla, colors }));
              }}
              right={
                on ? (
                  <View style={styles.on}>
                    <Ionicons name="checkmark" size={16} color={color.onAccent} />
                  </View>
                ) : (
                  <View style={styles.off}>
                    <Ionicons name="add" size={16} color={color.text2} />
                  </View>
                )
              }
            />
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: { fontFamily: font.semibold, fontSize: 15, color: color.accentText },
  on: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  off: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
});
