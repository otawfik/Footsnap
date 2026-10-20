import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { C, F, S } from '../../constants/theme';
import { tap } from '../../components/ui';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, [Icon, Icon]> = {
  index: ['radio-outline', 'radio'],
  table: ['podium-outline', 'podium'],
  cards: ['albums-outline', 'albums'],
  picks: ['flash-outline', 'flash'],
};

/** A scoreboard-style tab bar: condensed labels, a flare bar over the active tab. */
function Bar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
        const on = state.index === i;
        const { options } = descriptors[route.key];
        const [off, onIcon] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={options.title}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) {
                tap('select');
                navigation.navigate(route.name);
              }
            }}
            style={styles.item}
          >
            <View style={[styles.indicator, on && styles.indicatorOn]} />
            <Ionicons name={on ? onIcon : off} size={22} color={on ? C.chalk : C.muted} />
            <Text style={[styles.label, on && { color: C.chalk }]}>{(options.title ?? '').toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(p) => <Bar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.night } }}>
      <Tabs.Screen name="index" options={{ title: 'Matchday' }} />
      <Tabs.Screen name="table" options={{ title: 'Table' }} />
      <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
      <Tabs.Screen name="picks" options={{ title: 'Picks' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.night, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 2 },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingTop: S.sm },
  indicator: { position: 'absolute', top: -3, width: 28, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  indicatorOn: { backgroundColor: C.flare },
  label: { fontFamily: F.label, fontSize: 11, letterSpacing: 1.2, color: C.muted },
});
