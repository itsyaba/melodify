import { useMemo, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Artwork } from '@/components/artwork';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { ListToolbar, type SortOption } from '@/components/list-toolbar';
import { confirm, promptText } from '@/components/menus';
import { albumHref, groupHref, newPlaylistWith, useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import {
  deletePlaylist,
  listPlaylists,
  listPlaylistTracks,
  renamePlaylist,
  type PlaylistSort,
} from '@/db/playlists';
import {
  listAlbums,
  listAlbumTracks,
  listGroups,
  listGroupTracks,
  listTracks,
  type AlbumSort,
  type GroupKind,
  type GroupSort,
  type TrackSort,
} from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { useStoredChoice } from '@/hooks/use-stored-choice';
import { queue } from '@/player/queue-store';
import { artSize, colors } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { formatCount, formatDuration } from '@/utils/format';

const VIEWS = [
  { key: 'songs', label: 'Songs' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
  { key: 'album_artists', label: 'Album artists' },
  { key: 'genres', label: 'Genres' },
  { key: 'composers', label: 'Composers' },
  { key: 'years', label: 'Years' },
  { key: 'playlists', label: 'Playlists' },
] as const;
type LibraryView = (typeof VIEWS)[number]['key'];

const GROUP_VIEWS: Partial<Record<LibraryView, { kind: GroupKind; singular: string; plural: string }>> = {
  artists: { kind: 'artist', singular: 'artist', plural: 'artists' },
  album_artists: { kind: 'album_artist', singular: 'album artist', plural: 'album artists' },
  genres: { kind: 'genre', singular: 'genre', plural: 'genres' },
  composers: { kind: 'composer', singular: 'composer', plural: 'composers' },
  years: { kind: 'year', singular: 'year', plural: 'years' },
};

const SONG_SORTS: readonly SortOption<TrackSort>[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'added', label: 'Recently added' },
  { key: 'played', label: 'Recently played' },
  { key: 'plays', label: 'Most played' },
  { key: 'year', label: 'Year' },
  { key: 'duration', label: 'Duration' },
  { key: 'filename', label: 'File path' },
];
const ALBUM_SORTS: readonly SortOption<AlbumSort>[] = [
  { key: 'name', label: 'Name' },
  { key: 'artist', label: 'Artist' },
  { key: 'year', label: 'Year' },
  { key: 'tracks', label: 'Song count' },
  { key: 'added', label: 'Recently added' },
];
const GROUP_SORTS: readonly SortOption<GroupSort>[] = [
  { key: 'name', label: 'Name' },
  { key: 'tracks', label: 'Song count' },
  { key: 'albums', label: 'Album count' },
];
const PLAYLIST_SORTS: readonly SortOption<PlaylistSort>[] = [
  { key: 'name', label: 'Name' },
  { key: 'updated', label: 'Recently changed' },
  { key: 'tracks', label: 'Song count' },
];

const EMPTY_BODY =
  'Connect the phone over USB and rsync your music into the Melodify folder, then run a scan from Settings.';
const NO_TRACKS: Track[] = [];

interface ListProps {
  /** The view chips, rendered at the top of each list. */
  chips: ReactElement;
}

export function LibraryScreen() {
  const [view, setView] = useStoredChoice<LibraryView>('library.view', 'songs', VIEWS);
  // The chips go inside the lists rather than beside them: with a large-title header iOS lays
  // content out under the nav bar and only a scroll view receives the matching content inset,
  // so a plain sibling View renders under the status bar.
  const chips = <Chips options={VIEWS} value={view} onChange={setView} />;
  const group = GROUP_VIEWS[view];
  return (
    <View style={styles.root}>
      {view === 'songs' && <Songs chips={chips} />}
      {view === 'albums' && <Albums chips={chips} />}
      {group && <Groups key={group.kind} chips={chips} {...group} />}
      {view === 'playlists' && <Playlists chips={chips} />}
    </View>
  );
}

function Songs({ chips }: ListProps) {
  const [sort, setSort] = useStoredChoice<TrackSort>('sort.songs', 'title', SONG_SORTS);
  const { data } = useLibraryQuery((db) => listTracks(db, sort), [sort]);
  const tracks = data ?? NO_TRACKS;
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  return (
    <TrackList
      tracks={tracks}
      header={
        <>
          {chips}
          {tracks.length ? (
            <ListToolbar
              summary={`${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`}
              sort={{ options: SONG_SORTS, value: sort, onChange: setSort }}
              onShuffle={() => void queue.playShuffled(tracks)}
              onPlay={() => void queue.replace(tracks, 0)}
            />
          ) : null}
        </>
      }
      empty={data ? <EmptyState title="No songs yet" body={EMPTY_BODY} /> : null}
    />
  );
}

function Albums({ chips }: ListProps) {
  const router = useRouter();
  const actions = useTrackActions();
  const [sort, setSort] = useStoredChoice<AlbumSort>('sort.albums', 'name', ALBUM_SORTS);
  const { data } = useLibraryQuery((db) => listAlbums(db, sort), [sort]);
  return (
    <FlatList
      data={data}
      keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
      renderItem={({ item }) => (
        <ListRow
          title={item.album}
          subtitle={[item.album_artist, item.year, formatCount(item.track_count, 'song')].filter(Boolean).join(' · ')}
          leading={<Artwork artKey={item.art_key} size={artSize.row} />}
          onPress={() => router.push(albumHref(item.album, item.album_artist))}
          onLongPress={() =>
            actions.collectionMenu(item.album, (db) => listAlbumTracks(db, item.album, item.album_artist))
          }
        />
      )}
      ListEmptyComponent={data ? <EmptyState title="No albums yet" body={EMPTY_BODY} /> : null}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <>
          {chips}
          {data?.length ? (
            <ListToolbar
              summary={formatCount(data.length, 'album')}
              sort={{ options: ALBUM_SORTS, value: sort, onChange: setSort }}
            />
          ) : null}
        </>
      }
    />
  );
}

function Groups({ chips, kind, singular, plural }: ListProps & { kind: GroupKind; singular: string; plural: string }) {
  const router = useRouter();
  const actions = useTrackActions();
  const [sort, setSort] = useStoredChoice<GroupSort>(`sort.${kind}`, 'name', GROUP_SORTS);
  const { data } = useLibraryQuery((db) => listGroups(db, kind, sort), [kind, sort]);
  return (
    <FlatList
      data={data}
      keyExtractor={(g) => g.name}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${formatCount(item.album_count, 'album')} · ${formatCount(item.track_count, 'song')}`}
          leading={kind === 'artist' || kind === 'album_artist' ? undefined : <Artwork artKey={item.art_key} size={artSize.row} />}
          onPress={() => router.push(groupHref(kind, item.name))}
          onLongPress={() => actions.collectionMenu(item.name, (db) => listGroupTracks(db, kind, item.name))}
        />
      )}
      ListEmptyComponent={
        data ? <EmptyState title={`No ${plural} yet`} body={`Songs show up here once their ${singular} tag has been read.`} /> : null
      }
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <>
          {chips}
          {data?.length ? (
            <ListToolbar
              summary={formatCount(data.length, singular, plural)}
              sort={{ options: GROUP_SORTS, value: sort, onChange: setSort }}
            />
          ) : null}
        </>
      }
    />
  );
}

function Playlists({ chips }: ListProps) {
  const router = useRouter();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const [sort, setSort] = useStoredChoice<PlaylistSort>('sort.playlists', 'name', PLAYLIST_SORTS);
  const { data } = useLibraryQuery((d) => listPlaylists(d, sort), [sort]);
  return (
    <FlatList
      data={data}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${formatCount(item.track_count, 'song')}${item.duration_ms ? ` · ${formatDuration(item.duration_ms)}` : ''}`}
          leading={<Artwork artKey={item.art_key} size={artSize.row} />}
          onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: String(item.id) } })}
          onLongPress={() =>
            actions.collectionMenu(item.name, (d) => listPlaylistTracks(d, item.id), [
              {
                label: 'Rename…',
                onPress: async () => {
                  const name = await promptText('Rename playlist', { defaultValue: item.name, ok: 'Rename' });
                  if (!name) return;
                  await renamePlaylist(db, item.id, name);
                  libraryEvents.emit('changed', undefined);
                },
              },
              {
                label: 'Delete playlist',
                destructive: true,
                onPress: async () => {
                  if (!(await confirm(`Delete “${item.name}”?`, 'The songs stay in your library.', 'Delete'))) return;
                  await deletePlaylist(db, item.id);
                  libraryEvents.emit('changed', undefined);
                },
              },
            ])
          }
        />
      )}
      ListEmptyComponent={
        data ? (
          <EmptyState
            title="No playlists yet"
            body="Long-press any song, album or folder and choose Add to playlist, or save a queue as one."
          />
        ) : null
      }
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <>
          {chips}
          <ListRow
            title="New playlist"
            tinted
            leading={<IconTile name="plus" />}
            trailing={null}
            onPress={() => void newPlaylistWith(db, [])}
          />
          {data?.length ? (
            <ListToolbar
              summary={formatCount(data.length, 'playlist')}
              sort={{ options: PLAYLIST_SORTS, value: sort, onChange: setSort }}
            />
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
