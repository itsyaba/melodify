import { Suspense } from 'react';
import { ActivityIndicator, Platform, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router/stack';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { startAutoBackup } from '@/backup';
import { MenuHost } from '@/components/menu-sheet';
import { PromptHost } from '@/components/prompt-dialog';
import { ToastHost } from '@/components/toast';
import { DB_NAME, migrate } from '@/db';
import { restoreQueue } from '@/player/queue-store';
import { startSound } from '@/player/sound';
import { loadPrefs } from '@/prefs';
import { readPendingTags } from '@/scan/scanner';
import { OnboardingHost } from '@/screens/onboarding';
import { loadOnboarding } from '@/screens/onboarding/state';
import { ACCENTS, currentTheme, useTheme } from '@/theme';
import { startQuickActions } from '@/utils/quick-actions';

/**
 * Migrations first: the restore reads tables they create, and preferences before either. Unread
 * tags are read, and an automatic backup written if one is due, in the background afterwards;
 * the first screen does not wait for them. It does wait to know whether it is the welcome pages.
 */
async function initDatabase(db: SQLiteDatabase) {
  await migrate(db);
  await loadPrefs(db);
  await loadOnboarding(db);
  // Before the queue loads its track, so speed, equalizer and gapless apply from the first note.
  startSound();
  await restoreQueue(db);
  startQuickActions(db);
  void readPendingTags(db);
  startAutoBackup(db);
}

/**
 * React Navigation's theme, following the app's. Its colors must be plain strings (parts of it
 * do arithmetic on them), so the accent goes in as hex rather than as the dynamic system color.
 */
function useNavigationTheme() {
  const scheme = useColorScheme();
  useTheme(); // Re-render when the theme or accent changes.
  const { theme, accent } = currentTheme();
  const dark = scheme === 'dark';
  const base = dark ? DarkTheme : DefaultTheme;
  const surface = dark && theme === 'black' ? '#000000' : dark && theme === 'dark' ? '#1c1c1e' : null;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: ACCENTS[accent].hex,
      background: surface ?? base.colors.background,
      card: surface ?? base.colors.card,
    },
  };
}

export default function RootLayout() {
  const navigationTheme = useNavigationTheme();
  const scheme = useColorScheme();
  // A Stack above the tabs, so the player can present as a sheet over the tab bar. The tabs
  // themselves live in (tabs) and render their own header, hence headerShown: false here.
  return (
    <ThemeProvider value={navigationTheme}>
      {/* Android draws the app under a see-through status bar, whose icons must suit the theme. */}
      {Platform.OS === 'android' ? <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /> : null}
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName={DB_NAME} onInit={initDatabase} useSuspense>
          {/* Centred as on iOS: Android would put a modal's title hard against its Cancel button. */}
          <Stack screenOptions={{ headerTitleAlign: 'center' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* The player draws its own header, Spotify style: a chevron to close, the queue, a menu. */}
            <Stack.Screen name="player" options={{ presentation: 'modal', title: 'Now Playing', headerShown: false }} />
            <Stack.Screen name="queue" options={{ presentation: 'modal', title: 'Queue' }} />
            <Stack.Screen name="track/[id]" options={{ presentation: 'modal', title: 'Song Details' }} />
            <Stack.Screen name="sound" options={{ presentation: 'modal', title: 'Speed and Sound' }} />
            <Stack.Screen name="tags" options={{ presentation: 'modal', title: 'Edit Tags' }} />
            <Stack.Screen name="lyrics/[id]" options={{ presentation: 'modal', title: 'Lyrics' }} />
          </Stack>
          {/* Over the tabs, under the toasts and menus the welcome pages raise themselves. */}
          <OnboardingHost />
          <ToastHost />
          <MenuHost />
          {Platform.OS === 'android' ? <PromptHost /> : null}
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}

function Loading() {
  const colors = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.secondaryLabel} />
    </View>
  );
}
