import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { toast } from '@/components/toast';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { listBookmarks } from '@/db/bookmarks';
import {
  autoPlaylistSummaries,
  countTracks,
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
import { ACCENTS, currentTheme, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { searchEvents } from '@/utils/events';
import { dayPart, formatCount, formatTotalTime } from '@/utils/format';
import { AlbumPlayCard, SongCard } from './cards';
import { LIST_CARD_HEIGHT, ListCard } from './list-card';

const BLURBS: Record<AutoPlaylist, string> = {
  favorites: 'Every song you gave a heart',
  recently_added: 'The newest in your library',
  most_played: 'The songs you keep coming back to',
  recently_played: 'What you had on lately',
};

/** The chip for albums not played for a month. No genre is named with a NUL. */
const REDISCOVER = '\u0000rediscover';
const GENRE_CHIPS = 10;
/** Albums in a genre's strip; its arrow opens the genre for the rest. */
const STRIP = 24;
const SONG_ROWS = 5;

/** How far the wash reaches above the page, so pulling it down never shows its edge. */
const OVERSCROLL = 600;
/** How far down the page the wash fades out. */
const FADE = 420;

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
  const [songs, discover, genres] = await Promise.all([
    countTracks(db),
    listDiscoverAlbums(db, 12),
    listGroups(db, 'genre', 'tracks'),
  ]);
  return { songs, discover, genres: genres.slice(0, GENRE_CHIPS) };
}

interface ListItem {
  key: string;
  title: string;
  blurb: string;
  meta: string;
  art: string | null;
  icon: SFSymbol;
  href: Href;
  onLongPress?: () => void;
}

function Section({ title, onMore, moreLabel }: { title: string; onMore?: () => void; moreLabel?: string }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.section}>
      <Text numberOfLines={1} style={[type.title, styles.sectionTitle]} accessibilityRole="header">{title}</Text>
      {onMore ? (
        <IconButton name="chevron.right" size={18} color={colors.secondaryLabel} onPress={onMore} accessibilityLabel={moreLabel ?? `All of ${title}`} />
      ) : null}
    </View>
  );
}

/**
 * The Home tab: the weekday and time of day with a search pill and the settings gear beside it,
 * then three shelves. Your lists (the ones the library keeps by itself, and Bookmarks) as wide
 * cards with a record sliding out from behind each cover; albums as big covers with a play button,
 * filtered by chips (Rediscover, for albums not played for a month, then the biggest genres); and
 * the last few songs played as rounded rows. A soft wash of the accent sits behind the top.
 */
export function HomeScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
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

  const listWidth = Math.min(340, width - spacing.lg * 2 - spacing.xxl);
  const albumSize = Math.min(180, Math.floor((width - spacing.lg - spacing.md * 2) / 2.4));

  const lists: ListItem[] = [
    ...AUTO_PLAYLISTS.map((p) => {
      const s = listening?.lists[p.kind];
      return {
        key: p.kind,
        title: p.title,
        blurb: BLURBS[p.kind],
        // Blank until read, rather than a moment of "Nothing yet".
        meta: !s ? ' ' : s.count ? `${formatCount(s.count, 'song')} · ${formatTotalTime(s.duration_ms)}` : 'Nothing yet',
        art: s?.art_key ?? null,
        icon: p.icon,
        href: { pathname: '/auto/[kind]', params: { kind: p.kind } } as const,
        onLongPress: () => actions.collectionMenu(p.title, (d) => listAutoPlaylist(d, p.kind), [], { artKey: s?.art_key }),
      };
    }),
    {
      key: 'bookmarks',
      title: 'Bookmarks',
      blurb: 'Moments you saved inside songs',
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
  // The accent at the same strength in the status bar strip and at the top of the wash, so the
  // two meet unseen, as on Import and scan.
  const wash = `${ACCENTS[currentTheme().accent].hex}${scheme === 'dark' ? '47' : '29'}`;
  const gradient = useMemo(
    () => ({
      experimental_backgroundImage: [
        {
          type: 'linear-gradient' as const,
          direction: 'to bottom',
          colorStops: [
            { color: wash, positions: ['0%'] },
            { color: wash, positions: [`${Math.round((OVERSCROLL / (OVERSCROLL + FADE)) * 100)}%`] },
            { color: `${wash.slice(0, 7)}00`, positions: ['100%'] },
          ],
        },
      ],
    }),
    [wash],
  );
  const scrollY = useRef(new Animated.Value(0)).current;
  const washOpacity = scrollY.interpolate({ inputRange: [0, 120], outputRange: [1, 0], extrapolate: 'clamp' });

  const recent = listening?.recent;
  const empty = browse?.songs === 0;

  return (
    // The strip under the clock comes after the page in the tree and is laid out above it by
    // column-reverse, as in TabScreen: iOS finds a tab's scroll view down its chain of first
    // children (tapping the tab again scrolls it to the top, and the tab bar shrinks as it scrolls).
    <View style={styles.root}>
      <Animated.ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View pointerEvents="none" style={[styles.wash, gradient]} />

        <View style={styles.header}>
          <View style={styles.heading} accessible accessibilityRole="header" accessibilityLabel={`${day} ${part.toLowerCase()}`}>
            <Text numberOfLines={1} style={[type.footnote, styles.day]}>{day.toUpperCase()}</Text>
            <Text numberOfLines={1} style={[type.largeTitle, styles.part]}>{part}</Text>
          </View>
          <Pressable
            onPress={openSearch}
            accessibilityRole="search"
            accessibilityLabel="Search"
            style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
          >
            <SymbolView name="magnifyingglass" size={16} weight="semibold" tintColor={colors.secondaryLabel} />
            <Text style={[type.subhead, styles.searchText]}>Search</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <SymbolView name="gearshape.fill" size={19} tintColor={colors.label} />
          </Pressable>
        </View>

        {empty ? (
          <EmptyState
            title="No music yet"
            body="Import a folder or some songs from the Files app, or copy your music over USB."
            action={{ label: 'Import music', onPress: () => router.push('/settings/scan') }}
          />
        ) : (
          <>
            <Section title="Your lists" />
            <FlatList
              horizontal
              data={lists}
              keyExtractor={(l) => l.key}
              scrollsToTop={false}
              showsHorizontalScrollIndicator={false}
              snapToInterval={listWidth + spacing.md}
              decelerationRate="fast"
              style={styles.listStrip}
              contentContainerStyle={styles.strip}
              renderItem={({ item }) => (
                <ListCard
                  title={item.title}
                  blurb={item.blurb}
                  meta={item.meta}
                  artKey={item.art}
                  icon={item.icon}
                  width={listWidth}
                  onPress={() => router.push(item.href)}
                  onLongPress={item.onLongPress}
                />
              )}
            />

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
                  style={{ minHeight: albumSize + 56 }}
                  contentContainerStyle={[styles.strip, styles.albumStrip]}
                  renderItem={({ item }) => (
                    <AlbumPlayCard
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

            {recent?.tracks.length ? (
              <>
                <Section
                  title={recent.kind === 'recently_played' ? 'Recently played' : 'Recently added'}
                  onMore={() => router.push({ pathname: '/auto/[kind]', params: { kind: recent.kind } })}
                />
                <View style={styles.songs}>
                  {recent.tracks.map((t) => (
                    <SongCard
                      key={t.id}
                      track={t}
                      current={current?.id === t.id}
                      onPress={() => playRecent(recent.kind, t)}
                      onLongPress={() => actions.trackMenu(t)}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </Animated.ScrollView>
      <View style={[styles.statusBar, { height: insets.top }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: wash, opacity: washOpacity }]} />
      </View>
    </View>
  );
}

const PILL = 40;

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, flexDirection: 'column-reverse', backgroundColor: colors.background },
  // Opaque, so the page scrolls under it rather than under the clock; the wash tints it at rest.
  statusBar: { backgroundColor: colors.background, zIndex: 1 },
  content: { paddingBottom: spacing.xxl },
  wash: { position: 'absolute', left: 0, right: 0, top: -OVERSCROLL, height: OVERSCROLL + FADE },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  heading: { flex: 1 },
  day: { color: colors.secondaryLabel, fontWeight: '700', letterSpacing: 1.2 },
  part: { color: colors.label, fontWeight: '800', letterSpacing: -0.5 },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: PILL,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    backgroundColor: colors.fill,
  },
  searchText: { color: colors.secondaryLabel, fontWeight: '500' },
  roundButton: {
    width: PILL,
    height: PILL,
    borderRadius: PILL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    minHeight: 44 + spacing.xl,
  },
  sectionTitle: { flex: 1, color: colors.label, fontWeight: '700' },
  listStrip: { height: LIST_CARD_HEIGHT },
  strip: { gap: spacing.md, paddingHorizontal: spacing.lg },
  albumStrip: { paddingTop: spacing.xs },
  songs: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.6 },
}));
