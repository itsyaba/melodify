import { Stack } from 'expo-router/stack';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan library', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
