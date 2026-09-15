import { Stack, useLocalSearchParams } from 'expo-router';
import { FoldersScreen } from '@/screens/folders';

export default function FolderRoute() {
  const { path } = useLocalSearchParams<{ path: string[] }>();
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  return (
    <>
      <Stack.Screen options={{ title: segments[segments.length - 1] ?? 'Folders' }} />
      <FoldersScreen path={segments.join('/')} />
    </>
  );
}
