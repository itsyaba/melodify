import { Stack } from 'expo-router/stack';

// Only for deep links: the route put beneath a linked screen. It does not pick the screen a tab
// opens on, which is the first one listed below.
export const unstable_settings = {
  initialRouteName: 'index',
  search: { initialRouteName: 'search' },
};

/**
 * One layout for two tabs: Library and Search share every screen below, so an album opened from
 * Search stays in the Search tab. `segment` says which tab this copy is, "(library)" or "(search)".
 */
export default function LibraryLayout({ segment }: { segment: string }) {
  const group = segment.match(/\((.*)\)/)?.[1] ?? 'library';
  const library = <Stack.Screen key="index" name="index" options={{ title: 'Library' }} />;
  // Search draws its own header, Spotify style: a title, then a field that pins to the top.
  const search = <Stack.Screen key="search" name="search" options={{ title: 'Search', headerShown: false }} />;
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerBackButtonDisplayMode: 'minimal' }}>
      {/* A stack starts on its first screen, so the Search tab lists Search first. With Library
          first, tapping the Search tab opened the Library page. */}
      {group === 'search' ? [search, library] : [library, search]}
      <Stack.Screen name="album/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="group/[kind]/[value]" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="playlist/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="auto/[kind]" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="bookmarks" options={{ headerLargeTitleEnabled: false, title: 'Bookmarks' }} />
    </Stack>
  );
}
