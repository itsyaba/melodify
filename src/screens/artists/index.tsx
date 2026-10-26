import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListRow } from '@/components/list-row';
import { ListToolbar, type SortOption } from '@/components/list-toolbar';
import { SymbolView } from '@/components/symbol';
import { TabScreen } from '@/components/tab-screen';
import { Tile, tileColumns, tileGap, tileSize } from '@/components/tile';
import { groupHref, useTrackActions } from '@/components/track-actions';
import { listGroups, listGroupTracks, listTopArtists, type GroupSort } from '@/db/tracks';
import type { ArtistSummary, GroupSummary } from '@/db/types';
import { useDensity } from '@/hooks/use-density';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { useStoredChoice } from '@/hooks/use-stored-choice';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { findIn } from '@/utils/find';
import { formatCount } from '@/utils/format';

const SORTS: readonly SortOption<GroupSort>[] = [
  { key: 'name', label: 'Name' },
  { key: 'tracks', label: 'Song count' },
  { key: 'albums', label: 'Album count' },
];
const LAYOUTS = [{ key: 'grid' }, { key: 'list' }] as const;
type Layout = (typeof LAYOUTS)[number]['key'];

const NO_ARTISTS: GroupSummary[] = [];
const NO_TOP: ArtistSummary[] = [];
/** How many artists the rail at the top holds. */
const TOP_COUNT = 10;
const RAIL_ART = 112;

/** The letter an artist files under; everything that does not start with a letter files under #. */
function letterOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/**
 * The Artists tab. Spotify's shapes (round covers, a rail of the ones played most) over
 * Musicolet's list (every artist with its album and song counts, and the alphabet down the side
 * to jump by letter). Tapping an artist opens the same artist page the library does.
 */
export function ArtistsScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const actions = useTrackActions();
  const density = useDensity();
  const { width } = useWindowDimensions();
  const [sort, setSort] = useStoredChoice<GroupSort>('sort.artists.tab', 'name', SORTS);
  const [layout, setLayout] = useStoredChoice<Layout>('layout.artists.tab', 'grid', LAYOUTS);
  const [query, setQuery] = useState('');
  const { data } = useLibraryQuery((db) => listGroups(db, 'artist', sort), [sort]);
  const { data: topData } = useLibraryQuery((db) => listTopArtists(db, TOP_COUNT), []);

  const all = data ?? NO_ARTISTS;
  const top = topData ?? NO_TOP;
  const artists = useMemo(() => findIn(all, query, (a) => [a.name]), [all, query]);
  const songs = useMemo(() => all.reduce((sum, a) => sum + a.track_count, 0), [all]);

  const grid = layout === 'grid';
  const columns = grid ? tileColumns(width) : 1;
  const size = tileSize(width, columns);
  // A row's height, for the alphabet's jumps before FlatList has measured that far down.
  const rowHeight = grid ? size + 44 + spacing.lg : density.minHeight + density.paddingVertical * 2;

  const listRef = useRef<FlatList<GroupSummary>>(null);
  const headerHeight = useRef(0);

  // Only down a list in alphabetical order, and only when nothing is being searched for.
  const letters = useMemo(() => {
    if (sort !== 'name' || query) return [];
    const first = new Map<string, number>();
    artists.forEach((a, i) => {
      const letter = letterOf(a.name);
      if (!first.has(letter)) first.set(letter, i);
    });
    return [...first].map(([letter, index]) => ({ letter, index }));
  }, [artists, sort, query]);

  const jumpTo = (index: number) => {
    listRef.current?.scrollToIndex({ index: Math.floor(index / columns) * columns, animated: false });
  };

  const open = (a: GroupSummary) => router.push(groupHref('artist', a.name));
  const menu = (a: GroupSummary) =>
    actions.collectionMenu(a.name, (db) => listGroupTracks(db, 'artist', a.name), [], {
      artKey: a.art_key,
      round: true,
      subtitle: `${formatCount(a.album_count, 'album')} · ${formatCount(a.track_count, 'song')}`,
    });

  const header = (
    <View onLayout={(e: LayoutChangeEvent) => (headerHeight.current = e.nativeEvent.layout.height)}>
      {top.length > 1 && !query ? (
        <View style={styles.rail}>
          <Text style={[type.headline, styles.railTitle]}>On repeat</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railRow}
            // The rail is the page's own gesture; let the list under it scroll vertically.
            directionalLockEnabled
          >
            {top.map((a, i) => (
              <Pressable
                key={a.name}
                onPress={() => open(a)}
                onLongPress={() => menu(a)}
                style={({ pressed }) => [styles.railItem, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${a.name}, number ${i + 1} most played, ${formatCount(a.plays, 'play')}`}
              >
                <View>
                  <Artwork artKey={a.art_key} size={RAIL_ART} rounded="full" />
                  <View style={styles.rank}>
                    <Text style={[type.caption, styles.rankText]}>{i + 1}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[type.footnote, styles.railName]}>{a.name}</Text>
                <Text numberOfLines={1} style={[type.caption, styles.railPlays]}>{formatCount(a.plays, 'play')}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ListToolbar
        summary={
          query
            ? `${formatCount(artists.length, 'artist')} of ${all.length}`
            : `${formatCount(all.length, 'artist')} · ${formatCount(songs, 'song')}`
        }
        sort={{ options: SORTS, value: sort, onChange: setSort }}
        find={{ query, onChange: setQuery, placeholder: 'Find an artist' }}
        trailing={
          <IconButton
            name={grid ? 'list.bullet' : 'square.grid.2x2'}
            size={18}
            color={colors.secondaryLabel}
            onPress={() => setLayout(grid ? 'list' : 'grid')}
            accessibilityLabel={grid ? 'Show as a list' : 'Show as a grid'}
          />
        }
      />
    </View>
  );

  return (
    <TabScreen title="Artists">
      <View style={styles.body}>
        <FlatList
          ref={listRef}
          key={`artists-${columns}`}
          data={artists}
          keyExtractor={(a) => a.name}
          numColumns={grid ? columns : 1}
          columnWrapperStyle={grid ? styles.column : undefined}
          contentContainerStyle={grid ? styles.gridContent : undefined}
          ListHeaderComponent={all.length ? header : null}
          ListEmptyComponent={
            data ? (
              query ? (
                <EmptyState title={`Nothing matches “${query}”`} body="Try fewer words." />
              ) : (
                <EmptyState title="No artists yet" body="Songs show up here once their artist tag has been read." />
              )
            ) : null
          }
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            const height = rowHeight || averageItemLength;
            listRef.current?.scrollToOffset({
              offset: headerHeight.current + Math.floor(index / columns) * height,
              animated: false,
            });
          }}
          renderItem={({ item }) =>
            grid ? (
              <Tile
                artKey={item.art_key}
                title={item.name}
                subtitle={formatCount(item.track_count, 'song')}
                size={size}
                round
                onPress={() => open(item)}
                onLongPress={() => menu(item)}
              />
            ) : (
              <ListRow
                title={item.name}
                subtitle={`${formatCount(item.album_count, 'album')} · ${formatCount(item.track_count, 'song')}`}
                leading={<Artwork artKey={item.art_key} size={density.cover} rounded="full" />}
                trailing={
                  <IconButton
                    name="ellipsis"
                    size={16}
                    color={colors.secondaryLabel}
                    onPress={() => menu(item)}
                    accessibilityLabel={`More for ${item.name}`}
                  />
                }
                onPress={() => open(item)}
                onLongPress={() => menu(item)}
              />
            )
          }
        />
        {letters.length > 2 ? <LetterRail letters={letters} onJump={jumpTo} /> : null}
      </View>
    </TabScreen>
  );
}

/**
 * The alphabet down the right edge, as Musicolet's fast scroll has it: tap a letter, or slide a
 * finger through them, and the list jumps to the first artist filed under it.
 */
function LetterRail({ letters, onJump }: { letters: { letter: string; index: number }[]; onJump: (index: number) => void }) {
  const styles = useStyles();
  const [active, setActive] = useState<string | null>(null);
  const box = useRef({ top: 0, height: 0 });
  const last = useRef<string | null>(null);

  const pick = (y: number) => {
    const { top, height } = box.current;
    if (height <= 0) return;
    const at = Math.min(letters.length - 1, Math.max(0, Math.floor(((y - top) / height) * letters.length)));
    const entry = letters[at];
    if (!entry || entry.letter === last.current) return;
    last.current = entry.letter;
    setActive(entry.letter);
    onJump(entry.index);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => pick(e.nativeEvent.pageY),
      onPanResponderMove: (e) => pick(e.nativeEvent.pageY),
      onPanResponderRelease: () => {
        last.current = null;
        setActive(null);
      },
      onPanResponderTerminate: () => {
        last.current = null;
        setActive(null);
      },
    }),
  ).current;

  return (
    <View
      {...pan.panHandlers}
      style={styles.letters}
      onLayout={(e) => {
        const { height } = e.nativeEvent.layout;
        box.current.height = height;
        e.target?.measureInWindow?.((_x, y) => (box.current.top = y));
      }}
      accessibilityRole="adjustable"
      accessibilityLabel="Jump to a letter"
    >
      {letters.map(({ letter }) => (
        <Text key={letter} style={[type.caption, styles.letter, active === letter && styles.letterActive]}>
          {letter}
        </Text>
      ))}
      {active ? (
        <View style={styles.bubble} pointerEvents="none">
          <Text style={[type.title, styles.bubbleText]}>{active}</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { flex: 1 },
  rail: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  railTitle: { color: colors.label, paddingHorizontal: spacing.lg },
  railRow: { gap: spacing.md, paddingHorizontal: spacing.lg },
  railItem: { width: RAIL_ART, gap: 2 },
  pressed: { opacity: 0.6 },
  rank: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.tint,
  },
  rankText: { color: colors.onTint, fontWeight: '700' },
  railName: { color: colors.label, marginTop: spacing.xs, fontWeight: '600', textAlign: 'center' },
  railPlays: { color: colors.secondaryLabel, textAlign: 'center' },
  column: { gap: tileGap, paddingHorizontal: spacing.lg },
  gridContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  letters: {
    position: 'absolute',
    right: 2,
    top: spacing.xl,
    bottom: spacing.xl,
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  letter: { color: colors.secondaryLabel, fontWeight: '600' },
  letterActive: { color: colors.tint },
  bubble: {
    position: 'absolute',
    right: 30,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.tint,
  },
  bubbleText: { color: colors.onTint, fontWeight: '700' },
}));
