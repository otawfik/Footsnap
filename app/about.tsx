/**
 * About: version, data sources, privacy summary and the links Apple asks for
 * (privacy policy and support must be reachable from inside the app).
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Image, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Card } from '../components/Card';
import { DEPLOYED_URL } from '../services/api';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

function LinkRow({ icon, label, href }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; href: string }) {
  return (
    <Pressable style={styles.linkRow} onPress={() => Linking.openURL(href)} accessibilityRole="link">
      <Ionicons name={icon} size={18} color={Colors.accentGreen} />
      <Text style={styles.linkText}>{label}</Text>
      <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function About() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.barTitle}>About</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Image source={require('../assets/icon.png')} style={styles.icon} accessibilityIgnoresInvertColors />
          <Text style={styles.name}>FootSnap</Text>
          <Text style={styles.version}>Version {version}</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.heading}>Where the data comes from</Text>
          <Text style={styles.p}>
            Fixtures, live scores, tables, scorers and squads come from football-data.org. Live scores refresh every
            30 seconds while a match is on. Player photos come from Wikipedia and are credited on each card.
          </Text>
          <Text style={styles.p}>
            Predictions come from a Poisson goals model fitted to this season's results inside the app. They're
            estimates, not betting advice.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.heading}>Privacy</Text>
          <Text style={styles.p}>
            No account, no ads, no analytics, no tracking. FootSnap doesn't collect or store personal data. Data
            requests go through FootSnap's server, which caches football data and keeps standard short-term request
            logs.
          </Text>
        </Card>

        <Card style={[styles.card, styles.links]} noPadding>
          <LinkRow icon="shield-checkmark-outline" label="Privacy policy" href={`${DEPLOYED_URL}/privacy`} />
          <LinkRow icon="help-circle-outline" label="Support" href={`${DEPLOYED_URL}/support`} />
          <LinkRow icon="football-outline" label="football-data.org" href="https://www.football-data.org" />
          <LinkRow icon="logo-github" label="Source code" href="https://github.com/otawfik/Footsnap" />
        </Card>

        <Text style={styles.small}>
          FootSnap is an independent app, not affiliated with any league, club or football-data.org. Club names and
          crests belong to their owners.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  barTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  body: { padding: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.xxxl },
  hero: { alignItems: 'center', gap: 4, marginVertical: Spacing.md },
  icon: { width: 84, height: 84, borderRadius: 19, marginBottom: Spacing.sm },
  name: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  version: { fontSize: Typography.sm, color: Colors.textMuted },
  card: { gap: Spacing.sm },
  heading: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  p: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  links: { gap: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  linkText: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  small: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 17, paddingHorizontal: Spacing.base },
});
