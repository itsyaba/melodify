import { useLocalSearchParams } from 'expo-router';
import { TagEditorScreen } from '@/screens/tags/edit';

export default function TagsRoute() {
  const { ids } = useLocalSearchParams<{ ids: string }>();
  return <TagEditorScreen ids={(ids ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)} />;
}
