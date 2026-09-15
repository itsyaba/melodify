import { Suspense } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { DB_NAME, migrate } from '@/db';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName={DB_NAME} onInit={migrate} useSuspense>
          <NativeTabs minimizeBehavior="onScrollDown">
            <NativeTabs.Trigger name="(library)">
              <NativeTabs.Trigger.Icon sf="music.note.list" md="library_music" />
              <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(folders)">
              <NativeTabs.Trigger.Icon sf="folder" md="folder" />
              <NativeTabs.Trigger.Label>Folders</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(queue)">
              <NativeTabs.Trigger.Icon sf="list.number" md="queue_music" />
              <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(settings)">
              <NativeTabs.Trigger.Icon sf="gear" md="settings" />
              <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(search)" role="search">
              <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
          </NativeTabs>
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
