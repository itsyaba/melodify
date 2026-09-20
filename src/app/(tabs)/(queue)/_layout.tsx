import { Stack } from 'expo-router/stack';

export default function QueueLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true }}>
      <Stack.Screen name="index" options={{ title: 'Queue' }} />
    </Stack>
  );
}
