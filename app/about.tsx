/** Data and credits: where everything comes from, privacy, and the links Apple requires inside the app. */
import React from 'react';
import { View, Text, StyleSheet, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Screen, NavBar, SectionHeader, Row } from '../components/ui';
import { DEPLOYED_URL } from '../services/api';
import { color, space, type } from '../constants/design';

const link = (label: string, href: string, name: React.ComponentProps<typeof Ionicons>['name'], last = false) => (
  <Row key={label} left={<Ionicons name={name} size={20} color={color.text2} />} title={label} right={<Ionicons name="open-outline" size={16} color={color.text3} />} onPress={() => Linking.openURL(href)} divider={!last} />
);

export default function About() {
  return (
    <Screen tabBar={false}>
      <NavBar title="Data and credits" />
      <View style={styles.head}>
        <Image source={require('../assets/icon.png')} style={styles.icon} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>FootSnap</Text>
          <Text style={type.footnote}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </View>
      </View>

      <View style={styles.sec}>
        <SectionHeader title="Where it all comes from" />
        <Text style={type.body}>
          Fixtures, live scores, tables, scorers and squads come from football-data.org. Live scores refresh every 30
          seconds while a match is on. Player photos come from Wikipedia and are credited on each card.
        </Text>
        <Text style={[type.body, { marginTop: space.md }]}>
          The chances, projections and the model's picks come from a Poisson goals model fitted to this season's results
          on your phone. They're estimates for fun and insight. Picks are free and only ever score points. Cards, packs
          and the Duel are a game layer: every number and ability printed on a card is a real stat or fact.
        </Text>
      </View>

      <View style={styles.sec}>
        <SectionHeader title="Privacy" />
        <Text style={type.body}>
          No account, no ads, no analytics, no tracking. Your teams, collection and picks stay on this device. Data
          requests go through FootSnap's server, which caches football data and keeps standard short-term request logs.
        </Text>
      </View>

      <View style={styles.sec}>
        <SectionHeader title="Links" />
        {link('Privacy policy', `${DEPLOYED_URL}/privacy`, 'shield-checkmark-outline')}
        {link('Support', `${DEPLOYED_URL}/support`, 'help-circle-outline')}
        {link('football-data.org', 'https://www.football-data.org', 'football-outline')}
        {link('Source code', 'https://github.com/otawfik/Footsnap', 'logo-github', true)}
      </View>
      <Text style={[type.caption, { textAlign: 'center' }]}>
        FootSnap is independent and not affiliated with any league, club or football-data.org. Club names and crests
        belong to their owners.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: space.lg, paddingBottom: space.xxl },
  icon: { width: 64, height: 64, borderRadius: 15 },
  sec: { paddingBottom: space.xxl },
});
