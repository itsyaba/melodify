import { Suspense } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router/stack';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { ToastHost } from '@/components/toast';
import { DB_NAME, migrate } from '@/db';
import { restoreQueue } from '@/player/queue-store';
import { loadPrefs } from '@/prefs';

/** Migrations first: the restore reads tables they create, and preferences before either. */
async function initDatabase(db: SQLiteDatabase) {
  await migrate(db);
  await loadPrefs(db);
  await restoreQueue(db);
}

export default function RootLayout() {
  const scheme = useColorScheme();
  // A Stack above the tabs, so the player can present as a sheet over the tab bar. The tabs
  // themselves live in (tabs) and render their own header, hence headerShown: false here.
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName={DB_NAME} onInit={initDatabase} useSuspense>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="player" options={{ presentation: 'modal', title: 'Now Playing' }} />
            <Stack.Screen name="track/[id]" options={{ presentation: 'modal', title: 'Song Details' }} />
          </Stack>
          <ToastHost />
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
