import { useLocalSearchParams } from 'expo-router';
import { LyricsEditorScreen } from '@/screens/tags/lyrics';

export default function LyricsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LyricsEditorScreen id={Number(id)} />;
}
