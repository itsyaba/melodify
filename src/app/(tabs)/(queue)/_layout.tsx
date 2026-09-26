import { Stack } from 'expo-router/stack';

export default function QueueLayout() {
  return (
    <Stack>
      {/* Draws its own header, the queue tabs pinned in it. */}
      <Stack.Screen name="index" options={{ title: 'Queue', headerShown: false }} />
    </Stack>
  );
}
