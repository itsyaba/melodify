import { useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { Segmented } from '@/components/segmented';
import { TrackRow } from '@/components/track-row';
import { Artwork } from '@/components/artwork';
import { listAlbums, listArtists, listTracks } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { artSize, colors } from '@/theme';
import { formatCount } from '@/utils/format';
import { playTrackFromList } from '@/player/queue-actions';

const VIEWS = [
  { key: 'songs', label: 'Songs' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
] as const;
type LibraryView = (typeof VIEWS)[number]['key'];

const EMPTY_BODY =
  'Connect the phone over USB and rsync your music into the Melodify folder, then run a scan from Settings.';

interface ListProps {
  /** Rendered as each list's ListHeaderComponent. */
  header: ReactElement;
}

export function LibraryScreen() {
  const [view, setView] = useState<LibraryView>('songs');
  // The segmented control goes inside the lists rather than beside them: with a large-title
  // header iOS lays content out under the nav bar and only a scroll view receives the
  // matching content inset, so a plain sibling View renders under the status bar.
  const header = <Segmented options={VIEWS} value={view} onChange={setView} />;
  return (
    <View style={styles.root}>
      {view === 'songs' && <Songs header={header} />}
      {view === 'albums' && <Albums header={header} />}
      {view === 'artists' && <Artists header={header} />}
    </View>
  );
}

function Songs({ header }: ListProps) {
  const { data } = useLibraryQuery((db) => listTracks(db, 'title'));
  const onPress = (track: Track) => playTrackFromList(track, data ?? []);
  return (
    <FlatList
      data={data}
      keyExtractor={(t) => String(t.id)}
      renderItem={({ item }) => <TrackRow track={item} onPress={onPress} />}
      ListEmptyComponent={data ? <EmptyState title="No songs yet" body={EMPTY_BODY} /> : null}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
    />
  );
}

function Albums({ header }: ListProps) {
  const router = useRouter();
  const { data } = useLibraryQuery(listAlbums);
  return (
    <FlatList
      data={data}
      keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
      renderItem={({ item }) => (
        <ListRow
          title={item.album}
          subtitle={[item.album_artist, item.year, formatCount(item.track_count, 'song')].filter(Boolean).join(' · ')}
          leading={<Artwork artKey={item.art_key} size={artSize.row} />}
          onPress={() =>
            router.push({ pathname: '/album/[id]', params: { id: item.album, artist: item.album_artist ?? '' } })
          }
        />
      )}
      ListEmptyComponent={data ? <EmptyState title="No albums yet" body={EMPTY_BODY} /> : null}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
    />
  );
}

function Artists({ header }: ListProps) {
  const router = useRouter();
  const { data } = useLibraryQuery(listArtists);
  return (
    <FlatList
      data={data}
      keyExtractor={(a) => a.artist}
      renderItem={({ item }) => (
        <ListRow
          title={item.artist}
          subtitle={`${formatCount(item.album_count, 'album')} · ${formatCount(item.track_count, 'song')}`}
          onPress={() => router.push({ pathname: '/artist/[id]', params: { id: item.artist } })}
        />
      )}
      ListEmptyComponent={data ? <EmptyState title="No artists yet" body={EMPTY_BODY} /> : null}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
