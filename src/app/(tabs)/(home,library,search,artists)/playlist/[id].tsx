import { useLocalSearchParams } from 'expo-router';
import { PlaylistScreen } from '@/screens/library/playlist';

export default function PlaylistRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaylistScreen id={Number(id)} />;
}
