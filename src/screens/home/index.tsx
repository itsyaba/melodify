import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { toast } from '@/components/toast';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { listBookmarks } from '@/db/bookmarks';
import {
  autoPlaylistSummaries,
  libraryOverview,
  listAlbums,
  listAlbumTracks,
  listAutoPlaylist,
  listDiscoverAlbums,
  listGroups,
  listGroupTracks,
  type AutoPlaylist,
} from '@/db/tracks';
import type { AlbumSummary, Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue, useCurrentTrack } from '@/player/queue-store';
import { AUTO_PLAYLISTS } from '@/screens/library/auto-playlist';
import { face } from '@/screens/onboarding/fonts';
import { FAVORITES_FILL, makeStyles, spacing, type, useTheme } from '@/theme';
import { libraryViewRequest, searchEvents } from '@/utils/events';
import { dayPart, formatCount, formatTotalTime } from '@/utils/format';
import { AlbumCard, AllSongsCard, ArtistCircle, ListTile, RecentRow } from './cards';
import { NowPlayingCard } from './now-playing';

/** The lists on Home's tiles. Recently played has its own rows further down. */
const TILE_LISTS: readonly AutoPlaylist[] = ['favorites', 'most_played', 'recently_added'];

/** The chip for albums not played for a month. No genre is named with a NUL. */
const REDISCOVER = '\u0000rediscover';
const GENRE_CHIPS = 10;
/** Albums in a genre's strip; See all opens the genre for the rest. */
const STRIP = 24;
const ARTISTS = 12;
const SONG_ROWS = 5;

/** What changes as you listen: read again each time Home comes back into view. */
async function loadListening(db: SQLiteDatabase) {
  const [lists, bookmarks, played] = await Promise.all([
    autoPlaylistSummaries(db),
    listBookmarks(db),
    listAutoPlaylist(db, 'recently_played', SONG_ROWS),
  ]);
  // Nothing played yet: the newest songs stand in, so the section is not empty on a new library.
  const recent: { kind: AutoPlaylist; tracks: Track[] } = played.length
    ? { kind: 'recently_played', tracks: played }
    : { kind: 'recently_added', tracks: await listAutoPlaylist(db, 'recently_added', SONG_ROWS) };
  const marked = bookmarks.find((b) => b.track.art_key);
  return { lists, bookmarks: { count: bookmarks.length, art: marked?.track.art_key ?? null }, recent };
}

/** What only a scan or a tag edit changes, so Rediscover keeps its order while you browse. */
async function loadBrowse(db: SQLiteDatabase) {
  const [overview, discover, genres, artists] = await Promise.all([
    libraryOverview(db),
    listDiscoverAlbums(db, 12),
    listGroups(db, 'genre', 'tracks'),
    listGroups(db, 'artist', 'tracks'),
  ]);
  return { overview, discover, genres: genres.slice(0, GENRE_CHIPS), artists: artists.slice(0, ARTISTS) };
}

interface ListItem {
  key: string;
  title: string;
  meta: string;
  art: string | null;
  icon: SFSymbol;
  gradient?: readonly [string, string];
  href: Href;
  onLongPress?: () => void;
}

function Section({ title, onMore, moreLabel }: { title: string; onMore?: () => void; moreLabel?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text numberOfLines={1} style={[styles.sectionTitle, face('semibold')]} accessibilityRole="header">{title}</Text>
      {onMore ? (
        <Pressable
          onPress={onMore}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={moreLabel ?? `All of ${title}`}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[type.subhead, styles.more]}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The Home tab. Fixed at the top: the weekday and time of day over what the library holds, the
 * settings gear, and a search field. Under them, scrolling: the song on now over its own blurred
 * cover, with play, pause and next; All songs as a wide card in the accent, then Favorites, the
 * lists the library keeps by itself and Bookmarks as tiles two to a row;
 * albums with a play button on the cover, filtered by chips (Rediscover, for albums not played for
 * a month, then the biggest genres); the artists with the most songs; and the last few songs played.
 */
export function HomeScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const actions = useTrackActions();
  const current = useCurrentTrack();
  const { width } = useWindowDimensions();

  const { data: browse } = useLibraryQuery(loadBrowse, []);
  // Plays are counted without telling the lists, so these refresh whenever Home comes back.
  const { data: listening, refresh } = useLibraryQuery(loadListening, []);
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const [picked, setPicked] = useState<string | null>(null);
  const chips = useMemo(
    () => [
      ...(browse?.discover.length ? [{ key: REDISCOVER, label: 'Rediscover' }] : []),
      ...(browse?.genres ?? []).map((g) => ({ key: g.name, label: g.name })),
    ],
    [browse],
  );
  const active = chips.some((c) => c.key === picked) ? picked! : (chips[0]?.key ?? null);
  const { data: genre } = useLibraryQuery(
    (d) =>
      active && active !== REDISCOVER
        ? listAlbums(d, 'added', { kind: 'genre', value: active }).then((albums) => ({ name: active, albums: albums.slice(0, STRIP) }))
        : Promise.resolve(null),
    [active],
  );
  // The last genre's albums stay loaded while the next one's are read; they are not shown under it.
  const albums = active === REDISCOVER ? browse?.discover : genre?.name === active ? genre.albums : undefined;

  const tileWidth = Math.floor((width - spacing.lg * 2 - spacing.sm) / 2);
  const albumSize = Math.min(168, Math.floor((width - spacing.lg - spacing.md * 2) / 2.35));
  const artistSize = Math.min(96, Math.floor((width - spacing.lg - spacing.md * 3) / 3.6));

  const lists: ListItem[] = [
    ...TILE_LISTS.map((kind) => {
      const p = AUTO_PLAYLISTS.find((a) => a.kind === kind)!;
      const s = listening?.lists[kind];
      return {
        key: kind,
        title: p.title,
        // Blank until read, rather than a moment of "Nothing yet".
        meta: !s ? ' ' : s.count ? formatCount(s.count, 'song') : 'Nothing yet',
        art: s?.art_key ?? null,
        icon: p.icon,
        gradient: kind === 'favorites' ? FAVORITES_FILL : undefined,
        href: { pathname: '/auto/[kind]', params: { kind } } as const,
        onLongPress: () => actions.collectionMenu(p.title, (d) => listAutoPlaylist(d, kind), [], { artKey: s?.art_key }),
      };
    }),
    {
      key: 'bookmarks',
      title: 'Bookmarks',
      meta: !listening ? ' ' : listening.bookmarks.count ? formatCount(listening.bookmarks.count, 'bookmark') : 'Nothing yet',
      art: listening?.bookmarks.art ?? null,
      icon: 'bookmark.fill',
      href: '/bookmarks',
    },
  ];

  const openSearch = () => {
    router.navigate('/(tabs)/(search)/search');
    // Heard when the Search tab is already up; a first visit focuses its field on mount instead.
    searchEvents.emit('focus', undefined);
  };
  const openAllSongs = () => {
    libraryViewRequest.ask('songs');
    router.navigate('/(tabs)/(library)/library');
  };
  const openAlbum = (a: AlbumSummary) => router.push(albumHref(a.album, a.album_artist));
  const albumMenu = (a: AlbumSummary) =>
    actions.collectionMenu(a.album, (d) => listAlbumTracks(d, a.album, a.album_artist), [], {
      artKey: a.art_key,
      subtitle: a.album_artist ?? undefined,
    });
  const playAlbum = (a: AlbumSummary) =>
    void listAlbumTracks(db, a.album, a.album_artist).then((tracks) =>
      tracks.length ? queue.replace(tracks, 0) : toast.show('No songs in there'),
    );
  // The whole list, from the song tapped, as a tap in the list itself would.
  const playRecent = (kind: AutoPlaylist, track: Track) =>
    void listAutoPlaylist(db, kind).then((list) => {
      const index = list.findIndex((t) => t.id === track.id);
      return index >= 0 ? queue.replace(list, index) : queue.replace([track], 0);
    });

  const { day, part } = dayPart(new Date());
  const greeting = `${day} ${part.toLowerCase()}`;
  const overview = browse?.overview;
  const recent = listening?.recent;
  const empty = overview?.songs === 0;
  const scrollY = useRef(new Animated.Value(0)).current;
  const hairline = scrollY.interpolate({ inputRange: [0, 12], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    // The header and the strip under the clock come after the page in the tree and are laid out
    // above it by column-reverse, as in TabScreen: iOS finds a tab's scroll view down its chain of
    // first children (tapping the tab again scrolls it to the top, and the tab bar shrinks as it scrolls).
    <View style={styles.root}>
      <Animated.ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {empty ? (
          <EmptyState
            title="No music yet"
            body={
              Platform.OS === 'android'
                ? 'Let Melodify at the music on this phone, or copy some over USB, then scan.'
                : 'Import a folder or some songs from the Files app, or copy your music over USB.'
            }
            action={{ label: Platform.OS === 'android' ? 'Find my music' : 'Import music', onPress: () => router.push('/settings/scan') }}
          />
        ) : (
          <>
            <NowPlayingCard />

            {overview ? (
              <View style={styles.allSongs}>
                <AllSongsCard meta={`${formatCount(overview.songs, 'song')}, ${formatTotalTime(overview.durationMs)}`} onPress={openAllSongs} />
              </View>
            ) : null}

            <View style={styles.tiles}>
              {lists.map((item) => (
                <ListTile
                  key={item.key}
                  title={item.title}
                  meta={item.meta}
                  artKey={item.art}
                  icon={item.icon}
                  gradient={item.gradient}
                  width={tileWidth}
                  onPress={() => router.push(item.href)}
                  onLongPress={item.onLongPress}
                />
              ))}
            </View>

            {chips.length ? (
              <>
                <Section
                  title="Albums"
                  onMore={active && active !== REDISCOVER ? () => router.push(groupHref('genre', active)) : undefined}
                  moreLabel={active ? `Everything in ${active}` : undefined}
                />
                <Chips
                  options={chips}
                  value={active ?? REDISCOVER}
                  onChange={setPicked}
                  tinted
                  onLongPress={(g) => {
                    if (g !== REDISCOVER) actions.collectionMenu(g, (d) => listGroupTracks(d, 'genre', g));
                  }}
                />
                <FlatList
                  // A new list per chip, so switching starts it back at the first album.
                  key={active ?? ''}
                  horizontal
                  data={albums ?? []}
                  keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
                  scrollsToTop={false}
                  showsHorizontalScrollIndicator={false}
                  style={{ minHeight: albumSize + 52 }}
                  contentContainerStyle={[styles.strip, styles.albumStrip]}
                  renderItem={({ item }) => (
                    <AlbumCard
                      album={item}
                      size={albumSize}
                      onPress={() => openAlbum(item)}
                      onLongPress={() => albumMenu(item)}
                      onPlay={() => playAlbum(item)}
                    />
                  )}
                />
              </>
            ) : null}

            {browse?.artists.length ? (
              <>
                <Section title="Artists" />
                <FlatList
                  horizontal
                  data={browse.artists}
                  keyExtractor={(a) => a.name}
                  scrollsToTop={false}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.strip}
                  renderItem={({ item }) => (
                    <ArtistCircle
                      artist={item}
                      size={artistSize}
                      onPress={() => router.push(groupHref('artist', item.name))}
                      onLongPress={() => actions.collectionMenu(item.name, (d) => listGroupTracks(d, 'artist', item.name), [], { artKey: item.art_key })}
                    />
                  )}
                />
              </>
            ) : null}

            {recent?.tracks.length ? (
              <>
                <Section
                  title={recent.kind === 'recently_played' ? 'Recently played' : 'Recently added'}
                  onMore={() => router.push({ pathname: '/auto/[kind]', params: { kind: recent.kind } })}
                />
                {recent.tracks.map((t) => (
                  <RecentRow
                    key={t.id}
                    track={t}
                    current={current?.id === t.id}
                    onPress={() => playRecent(recent.kind, t)}
                    onLongPress={() => actions.trackMenu(t)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </Animated.ScrollView>
      <View style={styles.bar}>
        <View style={styles.header}>
          <View style={styles.heading} accessible accessibilityRole="header" accessibilityLabel={greeting}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.greeting, face('semibold')]}>{greeting}</Text>
            <Text numberOfLines={1} style={[type.footnote, styles.stats]}>
              {/* A space until read, so the line does not jump in. */}
              {overview && overview.songs ? `${formatCount(overview.albums, 'album')}, ${formatCount(overview.artists, 'artist')}` : ' '}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <SymbolView name="gearshape.fill" size={19} tintColor={colors.label} />
          </Pressable>
        </View>
        {!empty ? (
          <Pressable
            onPress={openSearch}
            accessibilityRole="search"
            accessibilityLabel="Search"
            style={({ pressed }) => [styles.search, pressed && styles.pressed]}
          >
            <SymbolView name="magnifyingglass" size={17} weight="semibold" tintColor={colors.secondaryLabel} />
            <Text numberOfLines={1} style={[type.body, styles.searchText]}>Songs, albums, artists</Text>
          </Pressable>
        ) : null}
        {/* A hairline under the header once the page has scrolled under it. */}
        <Animated.View pointerEvents="none" style={[styles.hairline, { opacity: hairline }]} />
      </View>
      <View style={[styles.statusBar, { height: insets.top }]} />
    </View>
  );
}

const ROUND = 40;
const FIELD = 42;

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, flexDirection: 'column-reverse', backgroundColor: colors.background },
  // Opaque, so the page scrolls under it rather than under the clock.
  statusBar: { backgroundColor: colors.background, zIndex: 1 },
  bar: { backgroundColor: colors.background, paddingBottom: spacing.md, zIndex: 1 },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  heading: { flex: 1, gap: 1 },
  greeting: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: colors.label },
  stats: { color: colors.secondaryLabel },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: FIELD,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.fill,
  },
  searchText: { flex: 1, color: colors.secondaryLabel },
  allSongs: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + spacing.xs,
    paddingBottom: spacing.md,
  },
  sectionTitle: { flex: 1, fontSize: 22, lineHeight: 27, letterSpacing: -0.3, color: colors.label },
  more: { color: colors.tint, fontWeight: '600' },
  strip: { gap: spacing.md, paddingHorizontal: spacing.lg },
  albumStrip: { paddingTop: spacing.md },
  pressed: { opacity: 0.6 },
}));
