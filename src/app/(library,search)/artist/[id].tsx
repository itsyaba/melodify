import { Stack, useLocalSearchParams } from 'expo-router';
import { ArtistScreen } from '@/screens/library/artist';

export default function ArtistRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: id }} />
      <ArtistScreen artist={id} />
    </>
  );
}
