import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AlbumCard, albumCardGap } from '@/components/album-card';
import { EmptyState } from '@/components/empty-state';
import { ListToolbar } from '@/components/list-toolbar';
import { albumHref, useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import { listAlbums, listAlbumTracks, listGroupTracks, type GroupKind } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue } from '@/player/queue-store';
import { spacing } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

const NO_TRACKS: Track[] = [];

/** One artist, album artist, genre, composer or year: its albums as tiles, then every song. */
export function GroupScreen({ kind, value }: { kind: GroupKind; value: string }) {
  const router = useRouter();
  const actions = useTrackActions();
  const { data } = useLibraryQuery((db) => listGroupTracks(db, kind, value), [kind, value]);
  const { data: albums } = useLibraryQuery((db) => listAlbums(db, 'year', { kind, value }), [kind, value]);
  const tracks = data ?? NO_TRACKS;
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);

  const header = (
    <View>
      {albums && albums.length > 0 ? (
        <FlatList
          horizontal
          data={albums}
          keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              onPress={() => router.push(albumHref(item.album, item.album_artist))}
              onLongPress={() => actions.collectionMenu(item.album, (db) => listAlbumTracks(db, item.album, item.album_artist))}
            />
          )}
        />
      ) : null}
      {tracks.length ? (
        <ListToolbar
          summary={`${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`}
          onShuffle={() => void queue.playShuffled(tracks)}
          onPlay={() => void queue.replace(tracks, 0)}
        />
      ) : null}
    </View>
  );

  return (
    <TrackList
      tracks={tracks}
      header={header}
      empty={data ? <EmptyState title="Nothing here" body="A rescan may have moved these songs." /> : null}
      onMenu={() => actions.collectionMenu(value, (db) => listGroupTracks(db, kind, value))}
    />
  );
}

const styles = StyleSheet.create({
  strip: { gap: albumCardGap, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
