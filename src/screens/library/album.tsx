import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '@/components/artwork';
import { TrackRow } from '@/components/track-row';
import { listAlbumTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { playTrackFromList } from '@/player/queue-actions';
import { artSize, colors, spacing, type } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

export function AlbumScreen({ album, albumArtist }: { album: string; albumArtist: string | null }) {
  const { data } = useLibraryQuery((db) => listAlbumTracks(db, album, albumArtist), [album, albumArtist]);
  const tracks = data ?? [];
  const total = tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  return (
    <FlatList
      style={styles.root}
      data={tracks}
      keyExtractor={(t) => String(t.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Artwork artKey={tracks[0]?.art_key ?? null} size={artSize.card} rounded="lg" />
          <Text style={[type.title, { color: colors.label, textAlign: 'center' }]}>{album}</Text>
          <Text style={[type.subhead, { color: colors.secondaryLabel }]}>{albumArtist ?? 'Unknown artist'}</Text>
          <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>
            {formatCount(tracks.length, 'song')} · {formatDuration(total)}
          </Text>
        </View>
      }
      renderItem={({ item }) => <TrackRow track={item} showNumber onPress={(t) => playTrackFromList(t, tracks)} />}
      contentInsetAdjustmentBehavior="automatic"
    />
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background },
  header: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
});
