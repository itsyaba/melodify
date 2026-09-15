import { FlatList, StyleSheet } from 'react-native';
import { TrackRow } from '@/components/track-row';
import { listArtistTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { playTrackFromList } from '@/player/queue-actions';
import { colors } from '@/theme';

export function ArtistScreen({ artist }: { artist: string }) {
  const { data } = useLibraryQuery((db) => listArtistTracks(db, artist), [artist]);
  const tracks = data ?? [];
  return (
    <FlatList
      style={styles.root}
      data={tracks}
      keyExtractor={(t) => String(t.id)}
      renderItem={({ item }) => <TrackRow track={item} onPress={(t) => playTrackFromList(t, tracks)} />}
      contentInsetAdjustmentBehavior="automatic"
    />
  );
}

const styles = StyleSheet.create({ root: { backgroundColor: colors.background } });
