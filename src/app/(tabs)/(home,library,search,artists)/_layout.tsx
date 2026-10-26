import { Stack } from 'expo-router/stack';

// Only for deep links: the route put beneath a linked screen. It does not pick the screen a tab
// opens on, which is the first one listed below.
export const unstable_settings = {
  initialRouteName: 'index',
  library: { initialRouteName: 'library' },
  search: { initialRouteName: 'search' },
  artists: { initialRouteName: 'artists' },
};

/**
 * One layout for four tabs: Home, Library, Search and Artists share every screen below, so an
 * album opened from any of them stays in that tab. `segment` says which tab this copy is:
 * "(home)", "(library)", "(search)" or "(artists)". Settings lives here too, opened from the
 * gear on Home.
 */
export default function SharedLayout({ segment }: { segment: string }) {
  const group = segment.match(/\((.*)\)/)?.[1] ?? 'home';
  // The roots draw their own headers: Home a greeting and the settings gear, Library its title and
  // view pills, Search its field.
  const roots = {
    home: <Stack.Screen key="index" name="index" options={{ title: 'Home', headerShown: false }} />,
    library: <Stack.Screen key="library" name="library" options={{ title: 'Library', headerShown: false }} />,
    search: <Stack.Screen key="search" name="search" options={{ title: 'Search', headerShown: false }} />,
    artists: <Stack.Screen key="artists" name="artists" options={{ title: 'Artists', headerShown: false }} />,
  };
  const first = group === 'library' || group === 'search' || group === 'artists' ? group : 'home';
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerBackButtonDisplayMode: 'minimal' }}>
      {/* A stack starts on its first screen, so each tab lists its own first. */}
      {roots[first]}
      {Object.entries(roots).flatMap(([key, screen]) => (key === first ? [] : [screen]))}
      <Stack.Screen name="album/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="group/[kind]/[value]" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="playlist/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="auto/[kind]" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="bookmarks" options={{ headerLargeTitleEnabled: false, title: 'Bookmarks' }} />
      <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
      <Stack.Screen name="settings/library" options={{ title: 'Library', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/appearance" options={{ title: 'Appearance', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/playback" options={{ title: 'Playback', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/about" options={{ title: 'About', headerLargeTitleEnabled: false }} />
      {/* Draws its own Spotify-style header over the accent wash. */}
      <Stack.Screen name="settings/scan" options={{ title: 'Import and scan', headerShown: false }} />
      <Stack.Screen name="settings/hidden" options={{ title: 'Hidden songs', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/excluded" options={{ title: 'Excluded folders', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/tabs" options={{ title: 'Tabs and views', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/shortcuts" options={{ title: 'Player shortcuts', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/backup" options={{ title: 'Backup and restore', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="settings/restore" options={{ title: 'Restore', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
