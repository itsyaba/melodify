import { useLocalSearchParams } from 'expo-router';
import { AlbumScreen } from '@/screens/library/album';

export default function AlbumRoute() {
  const { id, artist } = useLocalSearchParams<{ id: string; artist?: string }>();
  return <AlbumScreen album={id} albumArtist={artist ? artist : null} />;
}
