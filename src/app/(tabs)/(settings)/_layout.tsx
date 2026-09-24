import { Stack } from 'expo-router/stack';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan library', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="hidden" options={{ title: 'Hidden songs', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="excluded" options={{ title: 'Excluded folders', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
