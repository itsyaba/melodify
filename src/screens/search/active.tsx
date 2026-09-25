import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { toast } from '@/components/toast';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { listPlaylists, listPlaylistTracks } from '@/db/playlists';
import { getSetting, RECENT_SEARCHES, setSetting } from '@/db/settings';
import {
  listAlbums,
  listAlbumTracks,
  listFolderTracksRecursive,
  listGroups,
  listGroupTracks,
  listSongFolders,
  listTracks,
} from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue, useCurrentTrack } from '@/player/queue-store';
import { usePrefs } from '@/prefs';
import { rankSearch, searchItems, type SearchItem, type SearchKind, type SearchLibrary } from '@/search/rank';
import { recentKey, recentOf, resolveRecents, suggestQueries, withRecent, type RecentItem } from '@/search/recent';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { ResultRow } from './result-row';

type Filter = 'top' | SearchKind;

const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'track', label: 'Songs' },
  { key: 'artist', label: 'Artists' },
  { key: 'album', label: 'Albums' },
  { key: 'playlist', label: 'Playlists' },
  { key: 'folder', label: 'Folders' },
];

/** Top shows the best of everything; a filter shows every match of its kind. */
const TOP = 50;

/**
 * The whole library, read once when a search starts and again when it changes, so each keystroke
 * is a pass over memory rather than a round of queries. Tens of milliseconds at 10k songs.
 */
function loadLibrary(db: SQLiteDatabase): Promise<SearchLibrary> {
  return Promise.all([
    listTracks(db),
    listAlbums(db),
    listGroups(db, 'artist'),
    listPlaylists(db, 'name'),
    listSongFolders(db),
  ]).then(([tracks, albums, artists, playlists, folders]) => ({ tracks, albums, artists, playlists, folders }));
}

const keyOf = (item: SearchItem) => recentKey(recentOf(item));

/**
 * Spotify's search in progress: a field with Cancel on top. Before typing, what was opened from
 * Search lately; while typing, earlier searches that complete the text, pills for the kinds of
 * result, and one list, best match first, each row saying what it is.
 */
export function ActiveSearch({ onCancel }: { onCancel: () => void }) {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const current = useCurrentTrack();
  const foldersTab = usePrefs().tabs.includes('folders');
  const [query, setQuery] = useState('');
  const text = useDeferredValue(query.trim());
  const [filter, setFilter] = useState<Filter>('top');
  const [pastQueries, setPastQueries] = useState<string[]>([]);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  // Hearts flipped here, shown at once rather than after the library reloads with them.
  const [favorites, setFavorites] = useState<ReadonlyMap<number, boolean>>(new Map());

  useEffect(() => {
    void getSetting(db, 'recentSearches').then((r) => setPastQueries(r ?? []));
    void getSetting(db, 'recentItems').then((r) => setRecents(r ?? []));
  }, [db]);

  const { data: library } = useLibraryQuery(loadLibrary, []);
  const items = useMemo(() => (library ? searchItems(library, foldersTab) : []), [library, foldersTab]);
  useEffect(() => setFavorites(new Map()), [library]);

  const ranked = useMemo(() => rankSearch(items, text), [items, text]);
  const kinds = useMemo(() => new Set(ranked.map((i) => i.kind)), [ranked]);
  const filters = FILTERS.filter((f) => f.key === 'top' || kinds.has(f.key));
  // A filter whose kind has no matches for the new text falls back to Top.
  const shownFilter: Filter = filter === 'top' || kinds.has(filter) ? filter : 'top';
  const results = useMemo(
    () => (shownFilter === 'top' ? ranked.slice(0, TOP) : ranked.filter((i) => i.kind === shownFilter)),
    [ranked, shownFilter],
  );
  const songs = useMemo(
    () => results.flatMap((i) => (i.kind === 'track' ? [i.track] : [])),
    [results],
  );
  const suggestions = shownFilter === 'top' ? suggestQueries(pastQueries, text) : [];
  const recentResults = useMemo(() => resolveRecents(recents, items), [recents, items]);

  const rememberQuery = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setPastQueries((prev) => {
        const next = [trimmed, ...prev.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_SEARCHES);
        void setSetting(db, 'recentSearches', next);
        return next;
      });
    },
    [db],
  );
  const saveRecents = (next: RecentItem[]) => {
    setRecents(next);
    void setSetting(db, 'recentItems', next);
  };
  const clearAll = () => {
    saveRecents([]);
    setPastQueries([]);
    void setSetting(db, 'recentSearches', []);
  };

  const isFavorite = (t: Track) => favorites.get(t.id) ?? t.favorite === 1;
  const toggleFavorite = (t: Track) => {
    const next = !isFavorite(t);
    setFavorites((prev) => new Map(prev).set(t.id, next));
    void queue.setFavorite(t, next);
    toast.show(next ? 'Added to favorites' : 'Removed from favorites');
  };

  /** Plays a song or opens anything else, and remembers it (and the text that found it). */
  const open = (item: SearchItem, from: Track[]) => {
    rememberQuery(query);
    saveRecents(withRecent(recents, recentOf(item), RECENT_SEARCHES));
    switch (item.kind) {
      case 'track': {
        const at = from.findIndex((t) => t.id === item.track.id);
        void (at >= 0 ? queue.replace(from, at) : queue.replace([item.track], 0));
        return;
      }
      case 'album':
        router.push(albumHref(item.album.album, item.album.album_artist));
        return;
      case 'artist':
        router.push(groupHref('artist', item.artist.name));
        return;
      case 'playlist':
        router.push({ pathname: '/playlist/[id]', params: { id: String(item.playlist.id) } });
        return;
      case 'folder':
        router.push({ pathname: '/folder/[...path]', params: { path: item.folder.path.split('/') } });
        return;
    }
  };

  const menu = (item: SearchItem) => {
    switch (item.kind) {
      case 'track':
        return actions.trackMenu(item.track);
      case 'album': {
        const a = item.album;
        return actions.collectionMenu(a.album, (d) => listAlbumTracks(d, a.album, a.album_artist));
      }
      case 'artist':
        return actions.collectionMenu(item.artist.name, (d) => listGroupTracks(d, 'artist', item.artist.name));
      case 'playlist':
        return actions.collectionMenu(item.playlist.name, (d) => listPlaylistTracks(d, item.playlist.id));
      case 'folder':
        return actions.collectionMenu(item.folder.name, (d) => listFolderTracksRecursive(d, item.folder.path));
    }
  };

  /** Songs get ⋯ and Spotify's + / ✓ (here: favorites); anything else a chevron. */
  const resultTrailing = (item: SearchItem) => {
    if (item.kind !== 'track') {
      return <SymbolView name="chevron.right" size={13} tintColor={colors.tertiaryLabel} weight="semibold" />;
    }
    const fav = isFavorite(item.track);
    return (
      <View style={styles.trailing}>
        <IconButton name="ellipsis" size={16} color={colors.secondaryLabel} onPress={() => menu(item)} accessibilityLabel={`More for ${item.track.title}`} />
        <IconButton
          name={fav ? 'checkmark.circle.fill' : 'plus.circle'}
          size={22}
          color={fav ? colors.tint : colors.secondaryLabel}
          onPress={() => toggleFavorite(item.track)}
          accessibilityLabel={fav ? `Remove ${item.track.title} from favorites` : `Add ${item.track.title} to favorites`}
        />
      </View>
    );
  };

  let body;
  if (!text) {
    body = recentResults.length ? (
      <FlatList
        data={recentResults}
        keyExtractor={keyOf}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={<Text style={[type.title, styles.heading]}>Recent searches</Text>}
        renderItem={({ item }) => (
          <ResultRow
            item={item}
            active={item.kind === 'track' && item.track.id === current?.id}
            trailing={
              <IconButton
                name="xmark"
                size={15}
                color={colors.secondaryLabel}
                onPress={() => saveRecents(recents.filter((r) => recentKey(r) !== keyOf(item)))}
                accessibilityLabel="Remove from recent searches"
              />
            }
            onPress={() => open(item, item.kind === 'track' ? [item.track] : [])}
            onLongPress={() => menu(item)}
          />
        )}
        ListFooterComponent={
          <View style={styles.clearWrap}>
            <Pressable
              onPress={clearAll}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <Text style={[type.subhead, styles.clearText]}>Clear recent searches</Text>
            </Pressable>
          </View>
        }
      />
    ) : (
      <EmptyState title="Play what you love" body="Search for songs, artists, albums, playlists and folders." />
    );
  } else if (library && ranked.length === 0) {
    body = <EmptyState title={`Couldn’t find “${text}”`} body="Try another spelling, or fewer words." />;
  } else {
    body = (
      <>
        {filters.length > 2 ? <Chips options={filters} value={shownFilter} onChange={setFilter} tinted /> : null}
        <FlatList
          data={results}
          keyExtractor={keyOf}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            suggestions.length ? (
              <View style={styles.suggestions}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setQuery(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search for ${s}`}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                  >
                    <SymbolView name="magnifyingglass" size={17} tintColor={colors.secondaryLabel} />
                    <Text numberOfLines={1} style={[type.body, styles.suggestionText]}>{s}</Text>
                    <SymbolView name="arrow.up.left" size={15} tintColor={colors.secondaryLabel} />
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ResultRow
              item={item}
              active={item.kind === 'track' && item.track.id === current?.id}
              trailing={resultTrailing(item)}
              onPress={() => open(item, songs)}
              onLongPress={() => menu(item)}
            />
          )}
        />
      </>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <View style={styles.field}>
          <SymbolView name="magnifyingglass" size={16} tintColor={colors.secondaryLabel} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => rememberQuery(query)}
            placeholder="What do you want to listen to?"
            placeholderTextColor={colors.tertiaryLabel}
            selectionColor={colors.tint}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search"
            style={[type.body, styles.input]}
          />
        </View>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onCancel();
          }}
          hitSlop={spacing.sm}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[type.body, { color: colors.label }]}>Cancel</Text>
        </Pressable>
      </View>
      {body}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
  input: { flex: 1, paddingVertical: spacing.sm, color: colors.label },
  heading: { color: colors.label, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  clearWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  clear: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.secondaryLabel,
  },
  clearText: { color: colors.label, fontWeight: '600' },
  suggestions: { paddingBottom: spacing.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  suggestionText: { flex: 1, color: colors.label },
  pressed: { opacity: 0.5 },
}));
