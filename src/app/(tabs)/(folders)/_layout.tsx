import { Stack } from 'expo-router/stack';

export default function FoldersLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      {/* Draws its own header. */}
      <Stack.Screen name="index" options={{ title: 'Folders', headerShown: false }} />
      <Stack.Screen name="folder/[...path]" />
    </Stack>
  );
}
