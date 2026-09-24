import { useLocalSearchParams } from 'expo-router';
import { RestoreScreen } from '@/screens/settings/restore';

export default function RestoreRoute() {
  const { uri, name } = useLocalSearchParams<{ uri: string; name?: string }>();
  return <RestoreScreen uri={uri} name={name ?? ''} />;
}
