import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IoniconName;
  focused: boolean;
  size: number;
}

function TabIcon({ name, focused, size }: TabIconProps) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons
        name={name}
        size={size - 2}
        color={focused ? Colors.accentGreen : Colors.tabInactive}
      />
    </View>
  );
}

export default function TabLayout() {
  // sized from the device's real bottom inset (home indicator), not a guess per platform
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 60 + bottom, paddingBottom: bottom }],
        tabBarActiveTintColor: Colors.accentGreen,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarLabelStyle: styles.label,
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="squads"
        options={{
          title: 'Squads',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="predictions"
        options={{
          title: 'Predictions',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'analytics' : 'analytics-outline'} focused={focused} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
    backgroundColor: Platform.OS === 'android' ? Colors.tabBar : 'transparent',
    elevation: 0,
  },
  androidBg: {
    backgroundColor: Colors.tabBar,
  },
  label: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 28,
    borderRadius: 14,
  },
  iconWrapActive: {
    backgroundColor: Colors.accentGreen + '15',
  },
});
