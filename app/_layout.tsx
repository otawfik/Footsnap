import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { LeagueProvider } from '../context/league';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  // Registering the icon font here lets static web rendering inline it, so the
  // pre-rendered HTML and the first client render draw the same icons (no
  // hydration mismatch). Rendering isn't blocked on it.
  useFonts(Ionicons.font);
  return (
    <LeagueProvider>
      <View style={styles.root}>
        <StatusBar style="light" backgroundColor={Colors.bg} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg },
            animation: 'fade',
          }}
        />
      </View>
    </LeagueProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
