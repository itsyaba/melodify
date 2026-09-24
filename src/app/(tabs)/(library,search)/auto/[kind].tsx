import { Stack, useLocalSearchParams } from 'expo-router';
import { AUTO_PLAYLISTS, AutoPlaylistScreen } from '@/screens/library/auto-playlist';

export default function AutoPlaylistRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const found = AUTO_PLAYLISTS.find((p) => p.kind === kind) ?? AUTO_PLAYLISTS[0];
  return (
    <>
      <Stack.Screen options={{ title: found.title }} />
      <AutoPlaylistScreen kind={found.kind} />
    </>
  );
}
