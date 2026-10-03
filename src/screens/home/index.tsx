import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { toast } from '@/components/toast';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { listBookmarks } from '@/db/bookmarks';
import { listPlaylistCards, listPlaylistTracks } from '@/db/playlists';
import {
  autoPlaylistSummaries,
  libraryCovers,
  libraryOverview,
  listAlbums,
  listAlbumTracks,
  listAutoPlaylist,
  listDiscoverAlbums,
  listGroups,
  listGroupTracks,
  listTracks,
  type AutoPlaylist,
} from '@/db/tracks';
import type { AlbumSummary, Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue, useCurrentTrack } from '@/player/queue-store';
import { AUTO_PLAYLISTS } from '@/screens/library/auto-playlist';
import { face } from '@/screens/onboarding/fonts';
import { Glow } from '@/screens/onboarding/art';
import {
  ACCENTS,
  currentTheme,
  FAVORITES_FILL,
  HERO,
  HOME_CARDS,
  HOME_GLOWS,
  makeStyles,
  ON_TINT_MUTED,
  spacing,
  type,
  useTheme,
  type CardLook,
} from '@/theme';
import { libraryViewRequest, searchEvents } from '@/utils/events';
import { dayPart, formatCount, formatDuration, formatTotalTime } from '@/utils/format';
import { AlbumCard, ArtistCircle, HeroCard, MediaRow, PlaylistTile, RoundButton, type CardAction } from './cards';
import { NowPlayingCard } from './now-playing';

/** The chip that shows everything; the others narrow Home to one set of albums. */
const ALL = '\u0000all';
/** The chip for albums not played for a month. No genre is named with a NUL. */
const REDISCOVER = '\u0000rediscover';
const GENRE_CHIPS = 10;
/** Albums under a chip; See all opens the genre for the rest. */
const STRIP = 24;
const ARTISTS = 12;
const SONG_ROWS = 5;
/** Playlists on Home, the ones changed last; See all opens the rest. */
const PLAYLISTS = 12;
const ROUND = 50;
/** How much of the next big card shows past the edge, so the row reads as one to swipe. */
const PEEK = 28;

/** The library's own lists as big cards, each in its own color. */
const CARD_LISTS: readonly { kind: AutoPlaylist; look: CardLook; blurb: string }[] = [
  {
    kind: 'favorites',
    look: { fill: FAVORITES_FILL[1], gradient: FAVORITES_FILL, ink: HERO.ink, muted: ON_TINT_MUTED, button: HERO.button, buttonInk: HERO.buttonInk },
    blurb: 'The songs you hearted',
  },
  { kind: 'most_played', look: HOME_CARDS.lilac, blurb: 'What you come back to most' },
  { kind: 'recently_added', look: HOME_CARDS.lime, blurb: 'Fresh from the last scans' },
];

/** What changes as you listen: read again each time Home comes back into view. */
async function loadListening(db: SQLiteDatabase) {
  const [lists, bookmarks, played, playlists] = await Promise.all([
    autoPlaylistSummaries(db),
    listBookmarks(db),
    listAutoPlaylist(db, 'recently_played', SONG_ROWS),
    listPlaylistCards(db, PLAYLISTS),
  ]);
  // Nothing played yet: the newest songs stand in, so the section is not empty on a new library.
  const recent: { kind: AutoPlaylist; tracks: Track[] } = played.length
    ? { kind: 'recently_played', tracks: played }
    : { kind: 'recently_added', tracks: await listAutoPlaylist(db, 'recently_added', SONG_ROWS) };
  const marked = bookmarks.find((b) => b.track.art_key);
  return { lists, bookmarks: { count: bookmarks.length, art: marked?.track.art_key ?? null }, recent, playlists };
}

/** What only a scan or a tag edit changes, so Rediscover keeps its order while you browse. */
async function loadBrowse(db: SQLiteDatabase) {
  const [overview, covers, discover, genres, artists] = await Promise.all([
    libraryOverview(db),
    libraryCovers(db, 3),
    listDiscoverAlbums(db, 12),
    listGroups(db, 'genre', 'tracks'),
    listGroups(db, 'artist', 'tracks'),
  ]);
  return { overview, covers, discover, genres: genres.slice(0, GENRE_CHIPS), artists: artists.slice(0, ARTISTS) };
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
 * The Home tab, all of it scrolling under soft lights in the accent. At the top, settings on the
 * left and search and favorites on the right, over the weekday and time of day and what the
 * library holds. Then filter pills: All, Rediscover (albums not played for a month) and the
 * biggest genres.
 *
 * Under All: big cards to swipe through (the song on now over its own blurred cover, All songs in
 * the accent, Favorites, Most played, Recently added and Bookmarks), each with a play button; your
 * playlists as covers with their name on a colored band, as Spotify draws its mixes; the last few
 * songs played as roomy rows; Rediscover's albums; and the artists with the most songs.
 * Under any other pill: that pill's albums as rows, each with its own play button.
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

  const [picked, setPicked] = useState<string>(ALL);
  const chips = useMemo(
    () => [
      { key: ALL, label: 'All' },
      ...(browse?.discover.length ? [{ key: REDISCOVER, label: 'Rediscover' }] : []),
      ...(browse?.genres ?? []).map((g) => ({ key: g.name, label: g.name })),
    ],
    [browse],
  );
  // A genre that a scan took away falls back to All.
  const active = chips.some((c) => c.key === picked) ? picked : ALL;
  const isGenre = active !== ALL && active !== REDISCOVER;
  const { data: genre } = useLibraryQuery(
    (d) =>
      isGenre
        ? listAlbums(d, 'added', { kind: 'genre', value: active }).then((albums) => ({ name: active, albums: albums.slice(0, STRIP) }))
        : Promise.resolve(null),
    [active],
  );
  // The last genre's albums stay loaded while the next one's are read; they are not shown under it.
  const filtered = active === REDISCOVER ? browse?.discover : genre?.name === active ? genre.albums : undefined;

  const cardWidth = width - spacing.lg * 2 - PEEK;
  const albumSize = Math.min(168, Math.floor((width - spacing.lg - spacing.md * 2) / 2.35));
  const artistSize = Math.min(96, Math.floor((width - spacing.lg - spacing.md * 3) / 3.6));

  const playList = (tracks: Promise<Track[]>, shuffled = false) =>
    void tracks.then((list) =>
      !list.length ? toast.show('No songs in there') : shuffled ? queue.playShuffled(list) : queue.replace(list, 0),
    );
  const listButtons = (load: () => Promise<Track[]>, menu: () => void): { play: CardAction; actions: CardAction[] } => ({
    play: { icon: 'play.fill', label: 'Play', onPress: () => playList(load()) },
    actions: [
      { icon: 'shuffle', label: 'Shuffle', onPress: () => playList(load(), true) },
      { icon: 'ellipsis', label: 'More', onPress: menu },
    ],
  });

  const overview = browse?.overview;
  const tint = ACCENTS[currentTheme().accent];
  const allLook: CardLook = { fill: colors.tint, ink: colors.onTint, muted: ON_TINT_MUTED, button: HERO.button, buttonInk: HERO.buttonInk };

  const cards = [
    ...(overview?.songs
      ? [
          <HeroCard
            key="all"
            look={allLook}
            width={cardWidth}
            title="All songs"
            body={`${formatCount(overview.songs, 'song')}, ${formatTotalTime(overview.durationMs)}`}
            artKey={null}
            covers={browse?.covers}
            icon="music.note"
            {...listButtons(
              () => listTracks(db),
              () => actions.collectionMenu('All songs', (d) => listTracks(d)),
            )}
            accessibilityLabel={`All songs, ${formatCount(overview.songs, 'song')}`}
            onPress={() => {
              libraryViewRequest.ask('songs');
              router.navigate('/(tabs)/(library)/library');
            }}
          />,
        ]
      : []),
    ...CARD_LISTS.map(({ kind, look, blurb }) => {
      const p = AUTO_PLAYLISTS.find((a) => a.kind === kind)!;
      const s = listening?.lists[kind];
      const menu = () => actions.collectionMenu(p.title, (d) => listAutoPlaylist(d, kind), [], { artKey: s?.art_key });
      return (
        <HeroCard
          key={kind}
          look={look}
          width={cardWidth}
          title={p.title}
          // Blank until read, rather than a moment of "Nothing yet".
          body={!s ? ' ' : s.count ? `${blurb}. ${formatCount(s.count, 'song')}` : 'Nothing yet'}
          artKey={s?.art_key ?? null}
          icon={p.icon}
          {...listButtons(() => listAutoPlaylist(db, kind), menu)}
          accessibilityLabel={`${p.title}, ${s ? formatCount(s.count, 'song') : ''}`}
          onPress={() => router.push({ pathname: '/auto/[kind]', params: { kind } })}
          onLongPress={menu}
        />
      );
    }),
    <HeroCard
      key="bookmarks"
      look={HOME_CARDS.peach}
      width={cardWidth}
      title="Bookmarks"
      body={!listening ? ' ' : listening.bookmarks.count ? `Back to the moments you marked. ${formatCount(listening.bookmarks.count, 'bookmark')}` : 'Nothing yet'}
      artKey={listening?.bookmarks.art ?? null}
      icon="bookmark.fill"
      actions={[{ icon: 'chevron.right', label: 'Open bookmarks', onPress: () => router.push('/bookmarks') }]}
      accessibilityLabel="Bookmarks"
      onPress={() => router.push('/bookmarks')}
    />,
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
  const playAlbum = (a: AlbumSummary) => playList(listAlbumTracks(db, a.album, a.album_artist));
  // The whole list, from the song tapped, as a tap in the list itself would.
  const playRecent = (kind: AutoPlaylist, track: Track) =>
    void listAutoPlaylist(db, kind).then((list) => {
      const index = list.findIndex((t) => t.id === track.id);
      return index >= 0 ? queue.replace(list, index) : queue.replace([track], 0);
    });

  const { day, part } = dayPart(new Date());
  const greeting = `${day} ${part.toLowerCase()}`;
  const recent = listening?.recent;
  const empty = overview?.songs === 0;
  const scrollY = useRef(new Animated.Value(0)).current;
  // The strip under the clock turns solid once the page scrolls under it.
  const solid = scrollY.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' });
  const lift = Animated.multiply(scrollY, -1);

  return (
    // The lights come last in the tree and are drawn behind the page by zIndex: iOS finds a tab's
    // scroll view down its chain of first children (tapping the tab again scrolls it to the top,
    // and the tab bar shrinks as it scrolls). The strip under the clock follows the page in a
    // column-reverse for the same reason, as in TabScreen.
    <View style={styles.root}>
      <View style={styles.column}>
        <Animated.ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          <View style={styles.top}>
            <RoundButton icon="gearshape.fill" label="Settings" size={ROUND} onPress={() => router.push('/settings')} />
            <View style={styles.topEnd}>
              {!empty ? <RoundButton icon="magnifyingglass" label="Search" size={ROUND} onPress={openSearch} /> : null}
              {!empty ? (
                <RoundButton
                  icon="heart"
                  label="Favorites"
                  size={ROUND}
                  onPress={() => router.push({ pathname: '/auto/[kind]', params: { kind: 'favorites' } })}
                />
              ) : null}
            </View>
          </View>
          <View style={styles.heading} accessible accessibilityRole="header" accessibilityLabel={greeting}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.greeting, face('semibold')]}>{greeting}</Text>
            <Text numberOfLines={1} style={[type.subhead, styles.stats]}>
              {/* A space until read, so the line does not jump in. */}
              {overview && overview.songs
                ? `${formatCount(overview.songs, 'song')}, ${formatCount(overview.albums, 'album')}, ${formatCount(overview.artists, 'artist')}`
                : ' '}
            </Text>
          </View>

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
              <Chips
                options={chips}
                value={active}
                onChange={setPicked}
                tinted
                large
                onLongPress={(g) => {
                  if (g !== ALL && g !== REDISCOVER) actions.collectionMenu(g, (d) => listGroupTracks(d, 'genre', g));
                }}
              />

              {active === ALL ? (
                <>
                  <Section title={current ? 'Jump back in' : 'Your music'} />
                  <FlatList
                    horizontal
                    data={current ? [<NowPlayingCard key="now" width={cardWidth} />, ...cards] : cards}
                    keyExtractor={(c) => String(c.key)}
                    renderItem={({ item }) => item}
                    scrollsToTop={false}
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={cardWidth + spacing.md}
                    decelerationRate="fast"
                    contentContainerStyle={styles.cards}
                  />

                  {listening?.playlists.length ? (
                    <>
                      <Section
                        title="Your playlists"
                        onMore={() => {
                          libraryViewRequest.ask('playlists');
                          router.navigate('/(tabs)/(library)/library');
                        }}
                        moreLabel="All playlists"
                      />
                      <FlatList
                        horizontal
                        data={listening.playlists}
                        keyExtractor={(p) => String(p.id)}
                        scrollsToTop={false}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.strip}
                        renderItem={({ item }) => (
                          <PlaylistTile
                            playlist={item}
                            size={albumSize}
                            onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: String(item.id) } })}
                            onLongPress={() =>
                              actions.collectionMenu(item.name, (d) => listPlaylistTracks(d, item.id), [], { artKey: item.art_key })
                            }
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
                        <MediaRow
                          key={t.id}
                          artKey={t.art_key}
                          title={t.title}
                          by={t.artist ?? 'Unknown artist'}
                          detail={formatDuration(t.duration_ms)}
                          current={current?.id === t.id}
                          playLabel={`Play ${t.title}`}
                          onPlay={() => playRecent(recent.kind, t)}
                          onPress={() => playRecent(recent.kind, t)}
                          onLongPress={() => actions.trackMenu(t)}
                        />
                      ))}
                    </>
                  ) : null}

                  {browse?.discover.length ? (
                    <>
                      <Section title="Rediscover" onMore={() => setPicked(REDISCOVER)} moreLabel="All albums to rediscover" />
                      <FlatList
                        horizontal
                        data={browse.discover}
                        keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
                        scrollsToTop={false}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.strip}
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
                </>
              ) : (
                <>
                  <Section
                    title={active === REDISCOVER ? 'Not played for a month' : active}
                    onMore={isGenre ? () => router.push(groupHref('genre', active)) : undefined}
                    moreLabel={`Everything in ${active}`}
                  />
                  {(filtered ?? []).map((a) => (
                    <MediaRow
                      key={`${a.album_artist ?? ''}::${a.album}`}
                      artKey={a.art_key}
                      title={a.album}
                      by={a.album_artist ?? 'Unknown artist'}
                      detail={formatCount(a.track_count, 'song')}
                      playLabel={`Play ${a.album}`}
                      onPlay={() => playAlbum(a)}
                      onPress={() => openAlbum(a)}
                      onLongPress={() => albumMenu(a)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </Animated.ScrollView>
        <Animated.View style={[styles.statusBar, { height: insets.top, opacity: solid }]} />
      </View>
      <Animated.View pointerEvents="none" style={[styles.lights, { transform: [{ translateY: lift }] }]}>
        <Glow size={width * 1.1} hex={tint.dark} strength={0.55} style={{ left: -width * 0.45, top: -width * 0.45 }} />
        <Glow size={width * 0.9} hex={HOME_GLOWS[0]} strength={0.4} style={{ left: width * 0.05, top: -width * 0.4 }} />
        <Glow size={width * 0.8} hex={HOME_GLOWS[1]} strength={0.3} style={{ right: -width * 0.35, top: -width * 0.2 }} />
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  column: { flex: 1, flexDirection: 'column-reverse' },
  lights: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, zIndex: -1 },
  // Clear at the top, where the lights show through it; solid once the page scrolls under the clock.
  statusBar: { backgroundColor: colors.background },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  topEnd: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  heading: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md, gap: 2 },
  greeting: { fontSize: 36, lineHeight: 43, letterSpacing: -0.6, color: colors.label },
  stats: { color: colors.secondaryLabel },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md + 2,
  },
  sectionTitle: { flex: 1, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: colors.label },
  more: { color: colors.secondaryLabel, fontWeight: '500' },
  cards: { gap: spacing.md, paddingHorizontal: spacing.lg },
  strip: { gap: spacing.md, paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.6 },
}));
