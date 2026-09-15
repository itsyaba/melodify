import { Stack } from 'expo-router/stack';

export default function FoldersLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Folders' }} />
      <Stack.Screen name="folder/[...path]" options={{ headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
