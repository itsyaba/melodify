import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { TrackRow } from '@/components/track-row';
import { listPlaylists, listPlaylistTracks, type PlaylistSummary } from '@/db/playlists';
import { getSetting, RECENT_SEARCHES, setSetting } from '@/db/settings';
import {
  likePattern,
  listAlbumTracks,
  listFolderTracksRecursive,
  listGroupTracks,
  searchAlbums,
  searchFolders,
  searchGroups,
  searchTracks,
} from '@/db/tracks';
import type { AlbumSummary, FolderEntry, GroupSummary, Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue } from '@/player/queue-store';
import { usePrefs } from '@/prefs';
import { artSize, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatCount } from '@/utils/format';

type Item =
  | { kind: 'track'; track: Track; index: number }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: GroupSummary }
  | { kind: 'folder'; folder: FolderEntry }
  | { kind: 'playlist'; playlist: PlaylistSummary };

interface Results {
  tracks: Track[];
  albums: AlbumSummary[];
  artists: GroupSummary[];
  folders: FolderEntry[];
  playlists: PlaylistSummary[];
}

/** Searches wait for a short pause in typing, so each keystroke is not a round of queries. */
const DEBOUNCE_MS = 180;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function SearchScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const active = debounced.length >= 2;
  const [recent, setRecent] = useState<string[]>([]);
  const foldersTab = usePrefs().tabs.includes('folders');

  useEffect(() => {
    void getSetting(db, 'recentSearches').then((r) => setRecent(r ?? []));
  }, [db]);

  const remember = useCallback(
    (text: string) => {
      const q = text.trim();
      if (q.length < 2) return;
      setRecent((prev) => {
        const next = [q, ...prev.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_SEARCHES);
        void setSetting(db, 'recentSearches', next);
        return next;
      });
    },
    [db],
  );
  const forget = (text?: string) => {
    setRecent((prev) => {
      const next = text === undefined ? [] : prev.filter((r) => r !== text);
      void setSetting(db, 'recentSearches', next);
      return next;
    });
  };

  const { data } = useLibraryQuery<Results | null>(
    async (d) => {
      if (!active) return null;
      const [tracks, albums, artists, folders, playlists] = await Promise.all([
        searchTracks(d, debounced),
        searchAlbums(d, debounced),
        searchGroups(d, 'artist', debounced),
        searchFolders(d, debounced),
        listPlaylists(d, 'name', likePattern(debounced)),
      ]);
      return { tracks, albums, artists, folders, playlists };
    },
    [debounced, active],
  );

  const sections = useMemo(() => {
    if (!data) return [];
    return [
      { title: 'Artists', data: data.artists.map((artist): Item => ({ kind: 'artist', artist })) },
      { title: 'Albums', data: data.albums.map((album): Item => ({ kind: 'album', album })) },
      { title: 'Playlists', data: data.playlists.map((playlist): Item => ({ kind: 'playlist', playlist })) },
      // Only while the Folders tab is on: a switched-off tab's screens cannot be opened.
      { title: 'Folders', data: foldersTab ? data.folders.map((folder): Item => ({ kind: 'folder', folder })) : [] },
      { title: 'Songs', data: data.tracks.map((track, index): Item => ({ kind: 'track', track, index })) },
    ].filter((s) => s.data.length > 0);
  }, [data, foldersTab]);

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'track':
        return (
          <TrackRow
            track={item.track}
            onPress={() => {
              remember(query);
              void queue.replace(data?.tracks ?? [item.track], item.index);
            }}
            onLongPress={(t) => actions.trackMenu(t)}
          />
        );
      case 'album': {
        const a = item.album;
        return (
          <ListRow
            title={a.album}
            subtitle={[a.album_artist, a.year].filter(Boolean).join(' · ')}
            leading={<Artwork artKey={a.art_key} size={artSize.row} />}
            onPress={() => {
              remember(query);
              router.push(albumHref(a.album, a.album_artist));
            }}
            onLongPress={() => actions.collectionMenu(a.album, (d) => listAlbumTracks(d, a.album, a.album_artist))}
          />
        );
      }
      case 'artist': {
        const g = item.artist;
        return (
          <ListRow
            title={g.name}
            subtitle={`${formatCount(g.album_count, 'album')} · ${formatCount(g.track_count, 'song')}`}
            leading={<IconTile name="music.mic" />}
            onPress={() => {
              remember(query);
              router.push(groupHref('artist', g.name));
            }}
            onLongPress={() => actions.collectionMenu(g.name, (d) => listGroupTracks(d, 'artist', g.name))}
          />
        );
      }
      case 'folder': {
        const f = item.folder;
        return (
          <ListRow
            title={f.name}
            subtitle={f.path}
            leading={<IconTile name="folder.fill" />}
            onPress={() => {
              remember(query);
              router.push({ pathname: '/folder/[...path]', params: { path: f.path.split('/') } });
            }}
            onLongPress={() => actions.collectionMenu(f.name, (d) => listFolderTracksRecursive(d, f.path))}
          />
        );
      }
      case 'playlist': {
        const p = item.playlist;
        return (
          <ListRow
            title={p.name}
            subtitle={formatCount(p.track_count, 'song')}
            leading={<Artwork artKey={p.art_key} size={artSize.row} />}
            onPress={() => {
              remember(query);
              router.push({ pathname: '/playlist/[id]', params: { id: String(p.id) } });
            }}
            onLongPress={() => actions.collectionMenu(p.name, (d) => listPlaylistTracks(d, p.id))}
          />
        );
      }
    }
  };

  const showRecent = !active && query.trim().length === 0 && recent.length > 0;

  return (
    <View style={styles.root}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => remember(query)}
        placeholder="Songs, artists, albums, folders, playlists"
        placeholderTextColor={colors.tertiaryLabel}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[type.body, styles.input]}
      />
      {showRecent ? (
        <SectionList
          sections={[{ title: 'Recent', data: recent }]}
          keyExtractor={(r) => r}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderSectionHeader={() => (
            <View style={styles.sectionHeader}>
              <Text style={[type.headline, { color: colors.label, flex: 1 }]}>Recent searches</Text>
              <Pressable onPress={() => forget()} hitSlop={spacing.sm} accessibilityRole="button">
                <Text style={[type.subhead, { color: colors.tint }]}>Clear</Text>
              </Pressable>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setQuery(item)}
              onLongPress={() => forget(item)}
              style={({ pressed }) => [styles.recent, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityHint="Long press to remove it from recent searches"
            >
              <SymbolView name="clock.arrow.circlepath" size={16} tintColor={colors.secondaryLabel} />
              <Text numberOfLines={1} style={[type.body, { color: colors.label, flex: 1 }]}>{item}</Text>
            </Pressable>
          )}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => {
            switch (item.kind) {
              case 'track': return `t:${item.track.id}`;
              case 'album': return `a:${item.album.album_artist ?? ''}:${item.album.album}`;
              case 'artist': return `r:${item.artist.name}`;
              case 'folder': return `f:${item.folder.path}`;
              case 'playlist': return `p:${item.playlist.id}`;
            }
          }}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[type.headline, { color: colors.label }]}>{section.title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={active && data ? <EmptyState title="No matches" body={`Nothing matches “${debounced}”.`} /> : null}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  input: {
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.label,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pressed: { backgroundColor: colors.fill },
}));
