import { useLocalSearchParams } from 'expo-router';
import { TrackDetailsScreen } from '@/screens/track/details';

export default function TrackDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrackDetailsScreen id={Number(id)} />;
}
