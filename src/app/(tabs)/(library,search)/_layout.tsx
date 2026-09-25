import { Stack } from 'expo-router/stack';

export const unstable_settings = {
  initialRouteName: 'index',
  search: { initialRouteName: 'search' },
};

export default function LibraryLayout({ segment }: { segment: string }) {
  const group = segment.match(/\((.*)\)/)?.[1] ?? 'library';
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Library' }} />
      {/* Search draws its own header, Spotify style: a title, then a field that pins to the top. */}
      <Stack.Screen name="search" options={{ title: 'Search', headerShown: false }} />
      <Stack.Screen name="album/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="group/[kind]/[value]" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="playlist/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="auto/[kind]" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="bookmarks" options={{ headerLargeTitleEnabled: false, title: 'Bookmarks' }} />
      {group === 'search' ? null : null}
    </Stack>
  );
}
