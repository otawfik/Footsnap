import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { color, font, size } from '../../constants/design';
import { tap } from '../../components/ui';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
/** The four tabs, in order (SPEC §3, §4). Any other file in (tabs) is never shown in the bar. */
const TABS: { name: string; title: string; icon: [Icon, Icon] }[] = [
  { name: 'index', title: 'Home', icon: ['home-outline', 'home'] },
  { name: 'matches', title: 'Matches', icon: ['calendar-clear-outline', 'calendar-clear'] },
  { name: 'cards', title: 'Cards', icon: ['albums-outline', 'albums'] },
  { name: 'play', title: 'Play', icon: ['flash-outline', 'flash'] },
];

/** A blurred bar over `surface` at 92%, a hairline on top, no indicator. */
function Bar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={[styles.bar, { height: size.tabBar + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) }]}>
      {Platform.OS === 'ios' ? <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(13,21,37,0.92)' : 'rgba(13,21,37,0.97)' }]} />
      {TABS.map((t) => {
        const route = state.routes.find((r) => r.name === t.name);
        if (!route) return null;
        const on = current === t.name;
        return (
          <Pressable
            key={t.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.title}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) {
                tap('select');
                navigation.navigate(route.name);
              }
            }}
            style={styles.item}
          >
            <View style={[styles.mark, on && { backgroundColor: color.accent }]} />
            <Ionicons name={on ? t.icon[1] : t.icon[0]} size={24} color={on ? color.text : color.text3} />
            <Text style={[styles.label, { color: on ? color.text : color.text3 }]}>{t.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(p) => <Bar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: 7,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  /** a short pitch-green mark over the active tab, like a touchline */
  mark: { position: 'absolute', top: -7, width: 22, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  label: { fontFamily: font.medium, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.1 },
});
