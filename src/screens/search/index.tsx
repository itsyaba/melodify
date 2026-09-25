import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { TrackRow } from '@/components/track-row';
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
import { useDensity } from '@/hooks/use-density';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue, useCurrentTrack } from '@/player/queue-store';
import { usePrefs } from '@/prefs';
import { rankSearch, searchItems, type SearchItem, type SearchKind, type SearchLibrary } from '@/search/rank';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { searchEvents } from '@/utils/events';
import { formatCount, formatDuration } from '@/utils/format';

/** Musicolet's order, and how many of each show before "Show all". */
const SECTIONS: readonly { kind: SearchKind; title: string; singular: string; limit: number }[] = [
  { kind: 'track', title: 'Songs', singular: 'song', limit: 5 },
  { kind: 'album', title: 'Albums', singular: 'album', limit: 3 },
  { kind: 'artist', title: 'Artists', singular: 'artist', limit: 3 },
  { kind: 'playlist', title: 'Playlists', singular: 'playlist', limit: 3 },
  { kind: 'folder', title: 'Folders', singular: 'folder', limit: 3 },
];

interface Section {
  kind: SearchKind;
  title: string;
  singular: string;
  /** Every match of this kind, best first. */
  all: SearchItem[];
  /** The rows shown: `all`, or its first few until "Show all". */
  data: SearchItem[];
}

/**
 * The whole library, read when a search starts and again when it changes, so each keystroke is a
 * pass over memory rather than a round of queries. Tens of milliseconds at 10k songs.
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

function keyOf(item: SearchItem): string {
  switch (item.kind) {
    case 'track': return `t:${item.track.id}`;
    case 'album': return `a:${item.album.album_artist ?? ''}\u0000${item.album.album}`;
    case 'artist': return `r:${item.artist.name}`;
    case 'playlist': return `p:${item.playlist.id}`;
    case 'folder': return `f:${item.folder.path}`;
  }
}

/**
 * Musicolet's search: a field on top and the matches grouped by kind under accent headers with
 * their counts, songs first, each group cut to a few rows until "Show all". Every row has its ⋯,
 * songs their length, and the Songs header plays or shuffles every song found. Before typing,
 * the recent searches. Every word must match, accents ignored, best match first.
 *
 * All tabs mount at launch, so the field is focused on request rather than on mount: when the
 * Search tab is tapped, and when Home's field is.
 */
export function SearchScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const density = useDensity();
  const current = useCurrentTrack();
  const foldersTab = usePrefs().tabs.includes('folders');
  const input = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const text = useDeferredValue(query.trim());
  const [past, setPast] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<SearchKind>>(new Set());
  // The library is only read once a search starts, not at launch with every other tab.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    void getSetting(db, 'recentSearches').then((r) => setPast(r ?? []));
  }, [db]);

  // A focus asked for while another tab is showing waits until this one is on screen: the field
  // cannot take the keyboard before then.
  const pendingFocus = useRef(false);
  const focusField = useCallback(() => {
    pendingFocus.current = false;
    setStarted(true);
    input.current?.focus();
  }, []);
  useEffect(
    () =>
      searchEvents.on('focus', () => {
        pendingFocus.current = true;
        if (navigation.isFocused()) focusField();
      }),
    [navigation, focusField],
  );
  useFocusEffect(
    useCallback(() => {
      if (!pendingFocus.current) return;
      const t = setTimeout(focusField, 150);
      return () => clearTimeout(t);
    }, [focusField]),
  );

  const { data: library } = useLibraryQuery((d) => (started ? loadLibrary(d) : Promise.resolve(null)), [started]);
  const items = useMemo(() => (library ? searchItems(library, foldersTab) : []), [library, foldersTab]);
  const ranked = useMemo(() => rankSearch(items, text), [items, text]);
  useEffect(() => setExpanded(new Set()), [text]);

  const sections = useMemo<Section[]>(
    () =>
      SECTIONS.map((s) => {
        const all = ranked.filter((i) => i.kind === s.kind);
        return { ...s, all, data: expanded.has(s.kind) ? all : all.slice(0, s.limit) };
      }).filter((s) => s.all.length > 0),
    [ranked, expanded],
  );
  const songs = useMemo(() => ranked.flatMap((i) => (i.kind === 'track' ? [i.track] : [])), [ranked]);

  const savePast = (next: string[]) => {
    setPast(next);
    void setSetting(db, 'recentSearches', next);
  };
  const remember = () => {
    const q = query.trim();
    if (q.length < 2) return;
    savePast([q, ...past.filter((p) => p.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_SEARCHES));
  };

  const play = (from: Track[], at: number) => {
    remember();
    void queue.replace(from, at);
  };

  const open = (item: SearchItem) => {
    remember();
    switch (item.kind) {
      case 'track':
        return play(songs, Math.max(0, songs.findIndex((t) => t.id === item.track.id)));
      case 'album':
        return router.push(albumHref(item.album.album, item.album.album_artist));
      case 'artist':
        return router.push(groupHref('artist', item.artist.name));
      case 'playlist':
        return router.push({ pathname: '/playlist/[id]', params: { id: String(item.playlist.id) } });
      case 'folder':
        return router.push({ pathname: '/folder/[...path]', params: { path: item.folder.path.split('/') } });
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

  const more = (item: SearchItem, title: string) => (
    <IconButton name="ellipsis" size={16} color={colors.secondaryLabel} onPress={() => menu(item)} accessibilityLabel={`More for ${title}`} />
  );

  const renderItem = ({ item }: { item: SearchItem }): ReactElement => {
    switch (item.kind) {
      case 'track':
        return (
          <TrackRow
            track={item.track}
            active={item.track.id === current?.id}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
            onMore={() => menu(item)}
          />
        );
      case 'album': {
        const a = item.album;
        return (
          <ListRow
            title={a.album}
            subtitle={[a.album_artist, formatCount(a.track_count, 'song')].filter(Boolean).join(' · ')}
            leading={<Artwork artKey={a.art_key} size={density.art} />}
            trailing={more(item, a.album)}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        );
      }
      case 'artist': {
        const g = item.artist;
        return (
          <ListRow
            title={g.name}
            subtitle={`${formatCount(g.album_count, 'album')} · ${formatCount(g.track_count, 'song')}`}
            leading={<Artwork artKey={g.art_key} size={density.art} rounded="full" />}
            trailing={more(item, g.name)}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        );
      }
      case 'playlist': {
        const p = item.playlist;
        return (
          <ListRow
            title={p.name}
            subtitle={`${formatCount(p.track_count, 'song')}${p.duration_ms ? ` · ${formatDuration(p.duration_ms)}` : ''}`}
            leading={<Artwork artKey={p.art_key} size={density.art} />}
            trailing={more(item, p.name)}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        );
      }
      case 'folder': {
        const f = item.folder;
        return (
          <ListRow
            title={f.name}
            subtitle={f.path}
            leading={<IconTile name="folder.fill" size={density.art} />}
            trailing={more(item, f.name)}
            onPress={() => open(item)}
            onLongPress={() => menu(item)}
          />
        );
      }
    }
  };

  let body: ReactNode;
  if (!text) {
    body = past.length ? (
      <SectionList
        sections={[{ key: 'recent', data: past }]}
        keyExtractor={(q) => q}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={() => (
          <View style={styles.header}>
            <Text style={[type.footnote, styles.headerTitle]}>RECENT SEARCHES</Text>
            <Pressable onPress={() => savePast([])} hitSlop={spacing.sm} accessibilityRole="button" accessibilityLabel="Clear recent searches">
              <Text style={[type.footnote, styles.headerAction]}>CLEAR</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setStarted(true);
              setQuery(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${item}`}
            style={({ pressed }) => [styles.recent, pressed && styles.pressed]}
          >
            <SymbolView name="clock.arrow.circlepath" size={16} tintColor={colors.secondaryLabel} />
            <Text numberOfLines={1} style={[type.body, styles.recentText]}>{item}</Text>
            <IconButton
              name="xmark"
              size={13}
              color={colors.tertiaryLabel}
              onPress={() => savePast(past.filter((p) => p !== item))}
              accessibilityLabel={`Remove ${item} from recent searches`}
            />
          </Pressable>
        )}
      />
    ) : (
      <EmptyState title="Search your library" body="Songs, albums, artists, playlists and folders. Every word counts: “beatles help”." />
    );
  } else if (library && sections.length === 0) {
    body = <EmptyState title="No results" body={`Nothing in your library matches “${text}”.`} />;
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={keyOf}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        // Opaque headers that stay while their group scrolls under them, as Musicolet's do.
        stickySectionHeadersEnabled
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={[type.footnote, styles.headerTitle]}>{section.title.toUpperCase()}</Text>
            <Text style={[type.footnote, styles.headerCount]}>{section.all.length}</Text>
            <View style={styles.spacer} />
            {section.kind === 'track' ? (
              <View style={styles.headerButtons}>
                <IconButton name="shuffle" size={17} color={colors.tint} onPress={() => void queue.playShuffled(songs)} accessibilityLabel="Shuffle the songs found" />
                <IconButton name="play.fill" size={17} color={colors.tint} onPress={() => play(songs, 0)} accessibilityLabel="Play the songs found" />
              </View>
            ) : null}
          </View>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length < section.all.length ? (
            <Pressable
              onPress={() => setExpanded((prev) => new Set(prev).add(section.kind))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.showAll, pressed && styles.pressed]}
            >
              <Text style={[type.footnote, styles.headerAction]}>
                SHOW ALL {formatCount(section.all.length, section.singular).toUpperCase()}
              </Text>
            </Pressable>
          ) : null
        }
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.field}>
          <SymbolView name="magnifyingglass" size={16} tintColor={colors.secondaryLabel} />
          <TextInput
            ref={input}
            value={query}
            onChangeText={(q) => {
              setStarted(true);
              setQuery(q);
            }}
            onFocus={() => setStarted(true)}
            onSubmitEditing={remember}
            placeholder="Search your library"
            placeholderTextColor={colors.tertiaryLabel}
            selectionColor={colors.tint}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search your library"
            style={[type.body, styles.input]}
          />
        </View>
      </View>
      {body}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
  input: { flex: 1, paddingVertical: spacing.sm, color: colors.label },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  headerTitle: { color: colors.tint, fontWeight: '700', letterSpacing: 0.6 },
  headerCount: { color: colors.secondaryLabel, fontWeight: '600' },
  headerAction: { color: colors.tint, fontWeight: '700', letterSpacing: 0.6 },
  spacer: { flex: 1 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  showAll: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  recentText: { flex: 1, color: colors.label },
  pressed: { opacity: 0.5 },
}));
