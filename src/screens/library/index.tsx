import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AlbumCard } from '@/components/album-card';
import { Artwork } from '@/components/artwork';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListRow } from '@/components/list-row';
import { ListToolbar, type SortOption } from '@/components/list-toolbar';
import { confirm, promptText } from '@/components/menus';
import { TabScreen } from '@/components/tab-screen';
import { Tile, tileColumns, tileGap, tileSize } from '@/components/tile';
import { albumHref, groupHref, newPlaylistWith, useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import {
  deletePlaylist,
  listPlaylists,
  listPlaylistTracks,
  renamePlaylist,
  type PlaylistSort,
  type PlaylistSummary,
} from '@/db/playlists';
import {
  listAlbums,
  listAlbumTracks,
  listAutoPlaylist,
  listGroups,
  listGroupTracks,
  listTracks,
  type AlbumSort,
  type GroupKind,
  type GroupSort,
  type TrackSort,
} from '@/db/tracks';
import type { AlbumSummary, GroupSummary, Track } from '@/db/types';
import { useDensity } from '@/hooks/use-density';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { useStoredChoice } from '@/hooks/use-stored-choice';
import { usePrefs } from '@/prefs';
import { AUTO_PLAYLISTS } from '@/screens/library/auto-playlist';
import { QuickCards, type QuickCard } from '@/screens/library/quick-cards';
import { queue } from '@/player/queue-store';
import { spacing, useTheme } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { findIn } from '@/utils/find';
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
const LAYOUTS = [{ key: 'list' }, { key: 'grid' }] as const;
type Layout = (typeof LAYOUTS)[number]['key'];

const EMPTY_BODY =
  'Import songs or whole folders from the Files app, or copy music into the Melodify folder over USB and scan it.';

/** An empty library, with the way to fill it. */
function NoMusic({ title }: { title: string }) {
  const router = useRouter();
  return (
    <EmptyState title={title} body={EMPTY_BODY} action={{ label: 'Import music', onPress: () => router.push('/settings/scan') }} />
  );
}
const NO_TRACKS: Track[] = [];
const NO_ALBUMS: AlbumSummary[] = [];
const NO_GROUPS: GroupSummary[] = [];
const NO_PLAYLISTS: PlaylistSummary[] = [];

/**
 * Spotify's library over Musicolet's views: accent pills for Songs, Albums, Artists and the rest,
 * pinned under the title, a sort row with find and a grid toggle, bigger covers with round
 * artists, and a ⋯ on each row.
 */
export function LibraryScreen() {
  const { libraryViews } = usePrefs();
  // In the order chosen in Settings, leaving out the ones switched off there.
  const shown = useMemo(
    () => libraryViews.flatMap((key) => VIEWS.filter((v) => v.key === key)),
    [libraryViews],
  );
  const [stored, setView] = useStoredChoice<LibraryView>('library.view', shown[0]?.key ?? 'songs', shown);
  const view = shown.some((v) => v.key === stored) ? stored : (shown[0]?.key ?? 'songs');
  const group = GROUP_VIEWS[view];
  return (
    <TabScreen title="Library" below={<Chips options={shown} value={view} onChange={setView} tinted />}>
      {view === 'songs' && <Songs />}
      {view === 'albums' && <Albums />}
      {group && <Groups key={group.kind} {...group} />}
      {view === 'playlists' && <Playlists />}
    </TabScreen>
  );
}

/**
 * The view's find query: what is typed, and a deferred copy to filter with, so typing stays quick
 * in a long list. Each view keeps its own, so switching views starts afresh.
 */
function useFind(placeholder: string) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  return { query: deferred, find: { query, onChange: setQuery, placeholder } };
}

/** "12 of 212 albums" while finding, "212 albums" otherwise. */
function countOf(query: string, found: number, all: number, singular: string, plural?: string): string {
  const count = formatCount(all, singular, plural);
  return query ? `${found} of ${count}` : count;
}

function noMatches(query: string) {
  return <EmptyState title="No matches" body={`Nothing here matches “${query}”.`} />;
}

/** The ⋯ at the end of a row, opening the menu a long press does. */
function MoreButton({ title, onPress }: { title: string; onPress: () => void }) {
  const colors = useTheme();
  return <IconButton name="ellipsis" size={16} color={colors.secondaryLabel} onPress={onPress} accessibilityLabel={`More for ${title}`} />;
}

function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (next: Layout) => void }) {
  const grid = layout === 'grid';
  return (
    <IconButton
      name={grid ? 'list.bullet' : 'square.grid.2x2'}
      size={18}
      onPress={() => onChange(grid ? 'list' : 'grid')}
      accessibilityLabel={grid ? 'Show as a list' : 'Show as a grid'}
    />
  );
}

/** Columns and tile size for the current window, and the list props a grid needs. */
function useGrid(grid: boolean) {
  const { width } = useWindowDimensions();
  const columns = tileColumns(width);
  return {
    size: tileSize(width, columns),
    // numColumns cannot change on a mounted list, so each layout gets its own.
    listKey: grid ? `grid-${columns}` : 'list',
    listProps: {
      numColumns: grid ? columns : 1,
      columnWrapperStyle: grid ? { gap: tileGap, paddingHorizontal: spacing.lg } : undefined,
      contentContainerStyle: grid ? { gap: spacing.lg, paddingBottom: spacing.lg } : undefined,
    },
  };
}

function Songs() {
  const [sort, setSort] = useStoredChoice<TrackSort>('sort.songs', 'title', SONG_SORTS);
  const { data } = useLibraryQuery((db) => listTracks(db, sort), [sort]);
  const { query, find } = useFind('Find in songs');
  const all = data ?? NO_TRACKS;
  const tracks = useMemo(() => findIn(all, query, (t) => [t.title, t.artist, t.album, t.album_artist]), [all, query]);
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  return (
    <TrackList
      tracks={tracks}
      header={
        all.length ? (
          <ListToolbar
            summary={`${countOf(query, tracks.length, all.length, 'song')} · ${formatDuration(total)}`}
            sort={{ options: SONG_SORTS, value: sort, onChange: setSort }}
            find={find}
            onShuffle={tracks.length ? () => void queue.playShuffled(tracks) : undefined}
            onPlay={tracks.length ? () => void queue.replace(tracks, 0) : undefined}
          />
        ) : null
      }
      empty={query ? noMatches(query) : data ? <NoMusic title="No songs yet" /> : null}
    />
  );
}

function Albums() {
  const router = useRouter();
  const actions = useTrackActions();
  const density = useDensity();
  const [sort, setSort] = useStoredChoice<AlbumSort>('sort.albums', 'name', ALBUM_SORTS);
  const [layout, setLayout] = useStoredChoice<Layout>('layout.albums', 'list', LAYOUTS);
  const { data } = useLibraryQuery((db) => listAlbums(db, sort), [sort]);
  const { query, find } = useFind('Find in albums');
  const all = data ?? NO_ALBUMS;
  const albums = useMemo(() => findIn(all, query, (a) => [a.album, a.album_artist, a.year]), [all, query]);
  const grid = layout === 'grid';
  const { size, listKey, listProps } = useGrid(grid);
  const open = (a: AlbumSummary) => router.push(albumHref(a.album, a.album_artist));
  const menu = (a: AlbumSummary) =>
    actions.collectionMenu(a.album, (db) => listAlbumTracks(db, a.album, a.album_artist), [], {
      artKey: a.art_key,
      subtitle: a.album_artist ?? undefined,
    });
  return (
    <FlatList
      key={listKey}
      {...listProps}
      data={albums}
      keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
      renderItem={({ item }) =>
        grid ? (
          <AlbumCard album={item} size={size} subtitle="artist" onPress={() => open(item)} onLongPress={() => menu(item)} />
        ) : (
          <ListRow
            title={item.album}
            subtitle={[item.album_artist, item.year, formatCount(item.track_count, 'song')].filter(Boolean).join(' · ')}
            leading={<Artwork artKey={item.art_key} size={density.cover} />}
            trailing={<MoreButton title={item.album} onPress={() => menu(item)} />}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        )
      }
      ListEmptyComponent={query ? noMatches(query) : data ? <NoMusic title="No albums yet" /> : null}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        all.length ? (
          <ListToolbar
            summary={countOf(query, albums.length, all.length, 'album')}
            sort={{ options: ALBUM_SORTS, value: sort, onChange: setSort }}
            find={find}
            trailing={<LayoutToggle layout={layout} onChange={setLayout} />}
          />
        ) : null
      }
    />
  );
}

function Groups({ kind, singular, plural }: { kind: GroupKind; singular: string; plural: string }) {
  const router = useRouter();
  const actions = useTrackActions();
  const density = useDensity();
  const [sort, setSort] = useStoredChoice<GroupSort>(`sort.${kind}`, 'name', GROUP_SORTS);
  const [layout, setLayout] = useStoredChoice<Layout>(`layout.${kind}`, 'list', LAYOUTS);
  const { data } = useLibraryQuery((db) => listGroups(db, kind, sort), [kind, sort]);
  const { query, find } = useFind(`Find in ${plural}`);
  const all = data ?? NO_GROUPS;
  const groups = useMemo(() => findIn(all, query, (g) => [g.name]), [all, query]);
  const grid = layout === 'grid';
  const { size, listKey, listProps } = useGrid(grid);
  // Artists are drawn round, as Spotify draws them; the art is one of their albums'.
  const round = kind === 'artist' || kind === 'album_artist';
  const open = (g: GroupSummary) => router.push(groupHref(kind, g.name));
  const menu = (g: GroupSummary) =>
    actions.collectionMenu(g.name, (db) => listGroupTracks(db, kind, g.name), [], {
      artKey: g.art_key,
      round,
      subtitle: formatCount(g.track_count, 'song'),
    });
  return (
    <FlatList
      key={listKey}
      {...listProps}
      data={groups}
      keyExtractor={(g) => g.name}
      renderItem={({ item }) =>
        grid ? (
          <Tile
            artKey={item.art_key}
            title={item.name}
            subtitle={formatCount(item.track_count, 'song')}
            size={size}
            round={round}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        ) : (
          <ListRow
            title={item.name}
            subtitle={`${formatCount(item.album_count, 'album')} · ${formatCount(item.track_count, 'song')}`}
            leading={<Artwork artKey={item.art_key} size={density.cover} rounded={round ? 'full' : 'sm'} />}
            trailing={<MoreButton title={item.name} onPress={() => menu(item)} />}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        )
      }
      ListEmptyComponent={
        query ? (
          noMatches(query)
        ) : data ? (
          <EmptyState title={`No ${plural} yet`} body={`Songs show up here once their ${singular} tag has been read.`} />
        ) : null
      }
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        all.length ? (
          <ListToolbar
            summary={countOf(query, groups.length, all.length, singular, plural)}
            sort={{ options: GROUP_SORTS, value: sort, onChange: setSort }}
            find={find}
            trailing={<LayoutToggle layout={layout} onChange={setLayout} />}
          />
        ) : null
      }
    />
  );
}

function Playlists() {
  const router = useRouter();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const density = useDensity();
  const [sort, setSort] = useStoredChoice<PlaylistSort>('sort.playlists', 'name', PLAYLIST_SORTS);
  const { data } = useLibraryQuery((d) => listPlaylists(d, sort), [sort]);
  const { query, find } = useFind('Find in playlists');
  const all = data ?? NO_PLAYLISTS;
  const playlists = useMemo(() => findIn(all, query, (p) => [p.name]), [all, query]);

  const cards: QuickCard[] = [
    ...AUTO_PLAYLISTS.map((p) => ({
      key: p.kind,
      title: p.title,
      icon: p.icon,
      filled: p.kind === 'favorites',
      onPress: () => router.push({ pathname: '/auto/[kind]', params: { kind: p.kind } }),
      onLongPress: () => actions.collectionMenu(p.title, (d) => listAutoPlaylist(d, p.kind)),
    })),
    { key: 'bookmarks', title: 'Bookmarks', icon: 'bookmark.fill', onPress: () => router.push('/bookmarks') },
    { key: 'new', title: 'New playlist', icon: 'plus', onPress: () => void newPlaylistWith(db, []) },
  ];

  const menu = (p: PlaylistSummary) =>
    actions.collectionMenu(p.name, (d) => listPlaylistTracks(d, p.id), [
      {
        label: 'Rename…',
        icon: 'pencil',
        onPress: async () => {
          const name = await promptText('Rename playlist', { defaultValue: p.name, ok: 'Rename' });
          if (!name) return;
          await renamePlaylist(db, p.id, name);
          libraryEvents.emit('changed', undefined);
        },
      },
      {
        label: 'Delete playlist',
        icon: 'trash',
        destructive: true,
        onPress: async () => {
          if (!(await confirm(`Delete “${p.name}”?`, 'The songs stay in your library.', 'Delete'))) return;
          await deletePlaylist(db, p.id);
          libraryEvents.emit('changed', undefined);
        },
      },
    ], { artKey: p.art_key, subtitle: formatCount(p.track_count, 'song') });

  return (
    <FlatList
      data={playlists}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${formatCount(item.track_count, 'song')}${item.duration_ms ? ` · ${formatDuration(item.duration_ms)}` : ''}`}
          leading={<Artwork artKey={item.art_key} size={density.cover} />}
          trailing={<MoreButton title={item.name} onPress={() => menu(item)} />}
          onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: String(item.id) } })}
          onLongPress={() => menu(item)}
        />
      )}
      ListEmptyComponent={
        query ? (
          noMatches(query)
        ) : data ? (
          <EmptyState
            title="No playlists yet"
            body="Long-press any song, album or folder and choose Add to playlist, or save a queue as one."
          />
        ) : null
      }
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <QuickCards cards={cards} />
          {all.length ? (
            <ListToolbar
              summary={countOf(query, playlists.length, all.length, 'playlist')}
              sort={{ options: PLAYLIST_SORTS, value: sort, onChange: setSort }}
              find={find}
            />
          ) : null}
        </>
      }
    />
  );
}
