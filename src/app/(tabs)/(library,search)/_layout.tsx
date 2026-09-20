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
      <Stack.Screen name="search" options={{ title: 'Search' }} />
      <Stack.Screen name="album/[id]" options={{ headerLargeTitleEnabled: false, title: '' }} />
      <Stack.Screen name="artist/[id]" options={{ headerLargeTitleEnabled: false }} />
      {group === 'search' ? null : null}
    </Stack>
  );
}
