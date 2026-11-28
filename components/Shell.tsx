/**
 * The desktop shell (docs/desktop/DESIGN.md §1): a sidebar that replaces the bottom tab bar from
 * 1024 px on the web. Icons with small labels up to 1280 (the tab bar turned on its side), then a
 * full sidebar with the brand, every section, the competition switcher, credits and the install
 * button. It is always in the HTML and shown by a media query (lib/layout.ts), so the pre-rendered
 * page and the first client render are the same at any window width.
 */
import React, { useEffect, useState } from 'react';
import { GestureResponderEvent, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { color, font, radius } from '../constants/design';
import { LEAGUES } from '../constants/leagues';
import { useLeague } from '../context/league';
import { isDismissible, navKey, NavKey } from '../lib/layout';
import { useProfile } from '../lib/storage';
import { fs } from './layout';
import { Coin, LeagueSheet } from './ui';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
interface Item {
  key: NavKey;
  href: Href;
  /** under the icon while the sidebar is narrow */
  short: string;
  label: string;
  icon: [Icon, Icon];
}

const MAIN: Item[] = [
  { key: 'home', href: '/', short: 'Home', label: 'Home', icon: ['home-outline', 'home'] },
  { key: 'matches', href: '/matches', short: 'Matches', label: 'Matches', icon: ['calendar-clear-outline', 'calendar-clear'] },
  { key: 'cards', href: '/cards', short: 'Cards', label: 'Cards', icon: ['albums-outline', 'albums'] },
  { key: 'play', href: '/play', short: 'Play', label: 'Play', icon: ['flash-outline', 'flash'] },
];
const MORE: Item[] = [
  { key: 'beat', href: '/beat', short: 'Beat', label: 'Beat the model', icon: ['analytics-outline', 'analytics'] },
  { key: 'model', href: '/model', short: 'Model', label: 'How good is the model?', icon: ['speedometer-outline', 'speedometer'] },
  { key: 'teams', href: '/teams', short: 'Teams', label: 'Your teams', icon: ['star-outline', 'star'] },
];

/**
 * A real link on the web (an <a href>, so it can be opened in a new tab) that navigates inside the
 * app on a plain click. react-native-web turns `href` on a Pressable into an anchor.
 */
function go(href: Href) {
  return {
    href: href as string,
    onPress: (e: GestureResponderEvent) => {
      const n = e?.nativeEvent as unknown as MouseEvent | undefined;
      if (n && (n.metaKey || n.ctrlKey || n.shiftKey || n.button === 1)) return; // let the browser open a tab
      e?.preventDefault?.();
      router.navigate(href);
    },
  };
}

function NavItem({ item, on }: { item: Item; on: boolean }) {
  return (
    <Pressable {...go(item.href)} accessibilityRole="link" accessibilityLabel={item.label} aria-current={on ? 'page' : undefined} style={[styles.item, on && styles.itemOn]} {...fs('side-item', 'nav')}>
        <Ionicons name={on ? item.icon[1] : item.icon[0]} size={20} color={on ? color.text : color.text2} />
        <Text style={[styles.short, on && styles.labelOn]} numberOfLines={1} {...fs('side-narrow')}>{item.short}</Text>
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1} {...fs('side-text')}>{item.label}</Text>
      </Pressable>
  );
}

/** Chrome's "install this site" prompt, kept until the button is pressed. Null where the browser has none. */
function useInstallPrompt() {
  const [evt, setEvt] = useState<(Event & { prompt: () => Promise<unknown> }) | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const keep = (e: Event) => {
      e.preventDefault();
      setEvt(e as Event & { prompt: () => Promise<unknown> });
    };
    const done = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', keep);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  return evt ? () => evt.prompt().then(() => setEvt(null), () => setEvt(null)) : null;
}

/** Esc closes whatever sits on top of a screen (a card, the deck editor, a pack…). Sheets close themselves. */
function useEscToClose(pathname: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isDismissible(pathname)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // an open sheet or dialog handles its own Esc
      if (document.querySelector('[aria-modal="true"]')) return;
      if (router.canGoBack()) router.back();
      else router.replace('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname]);
}

export function Sidebar() {
  const pathname = usePathname();
  const { league, setLeague } = useLeague();
  const [profile] = useProfile();
  const [leagueOpen, setLeagueOpen] = useState(false);
  const install = useInstallPrompt();
  useEscToClose(pathname);
  if (Platform.OS !== 'web') return null;
  const active = navKey(pathname);

  return (
    <View style={styles.side} role="navigation" aria-label="FootSnap" {...fs('sidebar')}>
      <Pressable {...go('/')} style={styles.brand} accessibilityRole="link" accessibilityLabel="FootSnap, home">
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <Text style={styles.wordmark} {...fs('side-text')}>FootSnap</Text>
        </Pressable>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.group}>
          {MAIN.map((i) => (
            <NavItem key={i.key} item={i} on={active === i.key} />
          ))}
        </View>
        <View style={styles.rule} />
        <View style={styles.group}>
          {MORE.map((i) => (
            <NavItem key={i.key} item={i} on={active === i.key} />
          ))}
        </View>
        <View style={styles.rule} />

        {/* the competition: all six when there's room, one button that opens the menu when there isn't */}
        <View style={styles.group} {...fs('side-wide')}>
          <Text style={styles.over}>Competition</Text>
          {LEAGUES.map((l) => {
            const on = l.id === league.id;
            return (
              <Pressable key={l.id} onPress={() => setLeague(l)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={l.name} style={[styles.league, on && styles.itemOn]} {...fs('side-league', 'nav')}>
                <View style={[styles.dot, on && { backgroundColor: color.accent, borderColor: color.accent }]} />
                <Text style={[styles.leagueText, on && styles.labelOn]} numberOfLines={1}>{l.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.group} {...fs('side-narrow')}>
          <Pressable onPress={() => setLeagueOpen(true)} accessibilityRole="button" accessibilityLabel={`${league.name}. Change competition`} style={styles.item} {...fs('side-item', 'nav')}>
            <Ionicons name="trophy-outline" size={20} color={color.text2} />
            <Text style={styles.short} numberOfLines={1}>{league.code}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.foot}>
        {install ? (
          <Pressable onPress={install} accessibilityRole="button" accessibilityLabel="Install FootSnap as an app" style={styles.install} {...fs('side-wide', 'glow')}>
            <Ionicons name="download-outline" size={16} color={color.onChalk} />
            <Text style={styles.installText}>Install app</Text>
          </Pressable>
        ) : null}
        <Pressable {...go('/profile')} accessibilityRole="link" accessibilityLabel={`You: ${profile.credits} credits, your picks and record`} aria-current={active === 'profile' ? 'page' : undefined} style={[styles.item, styles.you, active === 'profile' && styles.itemOn]} {...fs('side-item', 'nav')}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={14} color={color.text} />
            </View>
            <Text style={styles.short} numberOfLines={1} {...fs('side-narrow')}>You</Text>
            <Text style={[styles.label, { flex: 1 }]} numberOfLines={1} {...fs('side-text')}>You</Text>
            <View style={styles.credits} {...fs('side-wide')}>
              <Coin size={13} />
              <Text style={styles.creditsText}>{profile.credits}</Text>
            </View>
          </Pressable>
        <Pressable {...go('/about')} accessibilityRole="link" style={styles.about} {...fs('side-wide')}>
            <Text style={[styles.aboutText, active === 'about' && { color: color.text }]}>Data, credits and privacy</Text>
          </Pressable>
      </View>
      <LeagueSheet visible={leagueOpen} onClose={() => setLeagueOpen(false)} />
    </View>
  );
}

const SIDE = '#13254A'; // between the ground and `surface`: text 13.3:1, text2 8.2:1, text3 6.4:1

const styles = StyleSheet.create({
  side: { backgroundColor: SIDE, borderRightWidth: 1, borderRightColor: color.hairline, paddingTop: 18, paddingBottom: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 40, marginBottom: 14, paddingHorizontal: 14 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  wordmark: { flex: 1, fontFamily: font.cardHeavy, fontSize: 21, letterSpacing: -0.5, color: color.text },
  scroll: { paddingHorizontal: 8, paddingBottom: 8 },
  group: { gap: 2 },
  rule: { height: 1, backgroundColor: color.hairline, marginVertical: 10, marginHorizontal: 6 },
  // narrow by default (icon over a small label); the stylesheet turns it into a row from 1280
  item: { minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.sm, paddingHorizontal: 4, paddingVertical: 6 },
  itemOn: { backgroundColor: 'rgba(246,241,230,0.12)' },
  short: { fontFamily: font.medium, fontSize: 10.5, lineHeight: 13, color: color.text2 },
  label: { fontFamily: font.medium, fontSize: 14.5, lineHeight: 20, color: color.text2 },
  labelOn: { color: color.text, fontFamily: font.semibold },
  over: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.7, textTransform: 'uppercase', color: color.text3, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  league: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 36, borderRadius: radius.sm, paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: color.hairlineStrong, marginHorizontal: 6 },
  leagueText: { flex: 1, fontFamily: font.medium, fontSize: 14, color: color.text2 },
  foot: { paddingHorizontal: 8, gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.hairline },
  install: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 38, borderRadius: radius.sm, backgroundColor: color.chalk, marginBottom: 2 },
  installText: { fontFamily: font.bold, fontSize: 14, color: color.onChalk },
  you: {},
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.raised, borderWidth: 1, borderColor: color.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: color.raised },
  creditsText: { fontFamily: font.semibold, fontSize: 13, color: color.text, fontVariant: ['tabular-nums'] },
  about: { paddingHorizontal: 12, paddingVertical: 6 },
  aboutText: { fontFamily: font.medium, fontSize: 12, color: color.text3 },
});
