import { Stack, useLocalSearchParams } from 'expo-router';
import { AUTO_PLAYLISTS, AutoPlaylistScreen } from '@/screens/library/auto-playlist';
import { MostPlayedScreen } from '@/screens/library/most-played';
import { RecentlyAddedScreen } from '@/screens/library/recently-added';

export default function AutoPlaylistRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const found = AUTO_PLAYLISTS.find((p) => p.kind === kind) ?? AUTO_PLAYLISTS[0];
  return (
    <>
      <Stack.Screen options={{ title: found.title }} />
      {found.kind === 'recently_added' ? (
        <RecentlyAddedScreen />
      ) : found.kind === 'most_played' ? (
        <MostPlayedScreen />
      ) : (
        <AutoPlaylistScreen kind={found.kind} />
      )}
    </>
  );
}
