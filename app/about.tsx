/** About: data sources, privacy, and the links Apple requires inside the app. */
import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Screen, Header, Panel, Section } from '../components/ui';
import { DEPLOYED_URL } from '../services/api';
import { C, F, S, T } from '../constants/theme';

function LinkRow({ icon, label, href, last }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; href: string; last?: boolean }) {
  return (
    <Pressable style={[styles.row, !last && styles.line]} onPress={() => Linking.openURL(href)} accessibilityRole="link">
      <Ionicons name={icon} size={18} color={C.chalk2} />
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="open-outline" size={14} color={C.dim} />
    </Pressable>
  );
}

export default function About() {
  return (
    <Screen>
      <View style={styles.back}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={C.chalk} />
        </Pressable>
      </View>
      <Header kicker={`Version ${Constants.expoConfig?.version ?? '1.0.0'}`} title="FootSnap" />
      <View style={{ paddingHorizontal: S.base }}>
        <Image source={require('../assets/icon.png')} style={styles.icon} />
      </View>
      <Section title="Where it all comes from">
        <Text style={T.body}>
          Fixtures, live scores, tables, scorers and squads come from football-data.org. Live scores refresh every 30
          seconds while a match is on. Player photos come from Wikipedia and are credited on each card.
        </Text>
        <Text style={T.body}>
          Odds, projections and the model's picks come from a Poisson goals model fitted to this season's results on
          your phone. They're estimates for fun and insight, not betting advice. Cards, packs and picks are a game
          layer: every number and ability printed on a card is a real stat or fact.
        </Text>
      </Section>
      <Section title="Privacy">
        <Text style={T.body}>
          No account, no ads, no analytics, no tracking. Your collection and picks stay on this device. Data requests go
          through FootSnap's server, which caches football data and keeps standard short-term request logs.
        </Text>
      </Section>
      <Section title="Links">
        <Panel>
          <LinkRow icon="shield-checkmark-outline" label="Privacy policy" href={`${DEPLOYED_URL}/privacy`} />
          <LinkRow icon="help-circle-outline" label="Support" href={`${DEPLOYED_URL}/support`} />
          <LinkRow icon="football-outline" label="football-data.org" href="https://www.football-data.org" />
          <LinkRow icon="logo-github" label="Source code" href="https://github.com/otawfik/Footsnap" last />
        </Panel>
        <Text style={[T.small, { textAlign: 'center' }]}>
          FootSnap is independent and not affiliated with any league, club or football-data.org. Club names and crests
          belong to their owners.
        </Text>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: S.md, paddingTop: S.sm },
  icon: { width: 72, height: 72, borderRadius: 16, marginTop: S.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.base },
  line: { borderBottomWidth: 1, borderBottomColor: C.line },
  rowText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 15, color: C.chalk },
});
