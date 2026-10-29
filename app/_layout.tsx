import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight/800ExtraBold';
import { LeagueProvider } from '../context/league';
import { color } from '../constants/design';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // registering fonts here also lets static web rendering inline them, so the
  // pre-rendered HTML and the first client render match (no hydration mismatch)
  const [loaded, failed] = useFonts({
    ...Ionicons.font,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    InterTight_700Bold,
    InterTight_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || failed) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, failed]);

  return (
    <LeagueProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'default' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="match/[id]" />
          <Stack.Screen name="club/[id]" />
          <Stack.Screen name="about" />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="teams" options={{ presentation: 'modal' }} />
          <Stack.Screen name="card/[id]" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="pack" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="guess" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="arena" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        </Stack>
      </View>
    </LeagueProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.bg } });
