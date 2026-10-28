/** You: your teams, your picks against the model, the Duel record, and the about rows. */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Screen, NavBar, SectionHeader, KitChip, Row, Credits } from '../components/ui';
import { useLeague } from '../context/league';
import { LEAGUE_MAP } from '../constants/leagues';
import { useSeason } from '../hooks/data';
import { tally } from '../lib/picks';
import { useFavorites, usePicks, useProfile } from '../lib/storage';
import { DEPLOYED_URL } from '../services/api';
import { color, font, space, type } from '../constants/design';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={type.numLarge}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const icon = (name: React.ComponentProps<typeof Ionicons>['name']) => <Ionicons name={name} size={20} color={color.text2} />;

export default function Profile() {
  const { league } = useLeague();
  const season = useSeason(league);
  const [favorites] = useFavorites();
  const [picks] = usePicks();
  const [profile] = useProfile();
  const matches = useMemo(() => season.data?.matches ?? [], [season.data]);
  const t = useMemo(() => tally(Object.values(picks).filter((p) => matches.some((m) => m.id === p.matchId)), matches), [picks, matches]);
  const duel = profile.duel ?? { played: 0, won: 0, drawn: 0, best: 0 };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen tabBar={false}>
      <NavBar back="close" onBack={close} right={<Credits credits={profile.credits} />} />
      <Text style={[type.largeTitle, { marginTop: space.sm, marginBottom: space.xxl }]} accessibilityRole="header">You</Text>

      <View style={styles.sec}>
        <SectionHeader title="Your teams" action={{ label: 'Edit', onPress: () => router.push('/teams') }} />
        {favorites.length ? (
          favorites.map((f, i) => <Row key={f.teamId} left={<KitChip colors={f.colors} />} title={f.name} subtitle={LEAGUE_MAP[f.competitionId]?.name} divider={i < favorites.length - 1} />)
        ) : (
          <Row left={icon('star-outline')} title="Pick your teams" subtitle="Their next matches lead Home" chevron onPress={() => router.push('/teams')} divider={false} />
        )}
      </View>

      <View style={styles.sec}>
        <SectionHeader title="Picks" />
        <Text style={[type.footnote, { marginBottom: space.md }]}>{league.name} · settled picks this season · free, points only</Text>
        <View style={styles.three}>
          <Stat value={`${t.you}`} label="You" />
          <Stat value={`${t.model}`} label="Model" />
          <Stat value={t.settled ? `${Math.round((t.youCorrect / t.settled) * 100)}%` : '–'} label={t.settled ? `${t.youCorrect} of ${t.settled} right` : 'Accuracy'} />
        </View>
      </View>

      <View style={styles.sec}>
        <SectionHeader title="Duel" />
        <View style={styles.three}>
          <Stat value={`${duel.won}`} label="Won" />
          <Stat value={`${duel.drawn}`} label="Drawn" />
          <Stat value={`${Math.max(0, duel.played - duel.won - duel.drawn)}`} label="Lost" />
          <Stat value={duel.best ? `×${duel.best}` : '–'} label="Best prize" />
        </View>
      </View>

      <View style={styles.sec}>
        <SectionHeader title="About" />
        <Row left={icon('information-circle-outline')} title="Data and credits" chevron onPress={() => router.push('/about')} />
        <Row left={icon('shield-checkmark-outline')} title="Privacy" chevron onPress={() => Linking.openURL(`${DEPLOYED_URL}/privacy`)} />
        <Row left={icon('help-circle-outline')} title="Support" chevron onPress={() => Linking.openURL(`${DEPLOYED_URL}/support`)} divider={false} />
      </View>

      <Text style={[type.footnote, { textAlign: 'center' }]}>FootSnap is free. No purchases, no betting.</Text>
      <Text style={[type.caption, { textAlign: 'center', marginTop: space.xs }]}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sec: { paddingBottom: space.x3 },
  three: { flexDirection: 'row', paddingTop: space.xs },
  statLabel: { fontFamily: font.medium, fontSize: 13, color: color.text3 },
});
