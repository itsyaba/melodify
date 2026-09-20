import { Suspense } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { Stack } from 'expo-router/stack';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { DB_NAME, migrate } from '@/db';

export default function RootLayout() {
  const scheme = useColorScheme();
  // A Stack above the tabs, so the player can present as a sheet over the tab bar. The tabs
  // themselves live in (tabs) and render their own header, hence headerShown: false here.
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName={DB_NAME} onInit={migrate} useSuspense>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="player" options={{ presentation: 'modal', title: 'Now Playing' }} />
          </Stack>
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
