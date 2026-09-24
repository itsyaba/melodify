import { Stack, useLocalSearchParams } from 'expo-router';
import type { GroupKind } from '@/db/tracks';
import { GroupScreen } from '@/screens/library/group';

const KINDS: readonly GroupKind[] = ['artist', 'album_artist', 'genre', 'composer', 'year'];

export default function GroupRoute() {
  const { kind, value } = useLocalSearchParams<{ kind: string; value: string }>();
  const groupKind = KINDS.find((k) => k === kind) ?? 'artist';
  return (
    <>
      <Stack.Screen options={{ title: value }} />
      <GroupScreen kind={groupKind} value={value} />
    </>
  );
}
