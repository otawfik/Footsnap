import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold_Italic } from '@expo-google-fonts/barlow-condensed/800ExtraBold_Italic';
import { LeagueProvider } from '../context/league';
import { C } from '../constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // registering fonts here also lets static web rendering inline them, so the
  // pre-rendered HTML and the first client render match (no hydration mismatch)
  const [loaded, failed] = useFonts({
    ...Ionicons.font,
    BigShouldersDisplay_900Black: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf'),
    BigShouldersDisplay_700Bold: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf'),
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold_Italic,
  });

  useEffect(() => {
    if (loaded || failed) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, failed]);

  return (
    <LeagueProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.night }, animation: 'fade' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="card/[id]" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="pack" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="guess" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="arena" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        </Stack>
      </View>
    </LeagueProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.night } });
