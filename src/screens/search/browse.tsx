import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRouter, type Href } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Artwork } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { albumHref, groupHref, useTrackActions } from '@/components/track-actions';
import { autoPlaylistArt, listAlbumTracks, listAutoPlaylist, listDiscoverAlbums, listGroups, listGroupTracks } from '@/db/tracks';
import type { AlbumSummary } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { AUTO_PLAYLISTS } from '@/screens/library/auto-playlist';
import { BROWSE_TILE_COLORS, makeStyles, radius, SEARCH_FIELD, spacing, type, useTheme } from '@/theme';

interface Tile {
  key: string;
  title: string;
  /** Tilted in the corner, as Spotify's category tiles carry a cover; the icon stands in without. */
  art: string | null;
  icon: SFSymbol;
  href: Href;
  onLongPress?: () => void;
}

async function loadBrowse(db: SQLiteDatabase) {
  const [discover, genres, art] = await Promise.all([listDiscoverAlbums(db), listGroups(db, 'genre', 'tracks'), autoPlaylistArt(db)]);
  return { discover, genres, art };
}

/** A colour that stays with a tile's name: djb2 over it, into the Browse palette. */
function tileColor(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return BROWSE_TILE_COLORS[Math.abs(h) % BROWSE_TILE_COLORS.length];
}

const CARD = { width: 150, height: 200 };

/**
 * Spotify's Search page for an offline library: a large title, a big search field that pins to
 * the top as the page scrolls, "Discover something new" (albums not played for a month), and
 * "Browse all": the lists the library keeps by itself, then every genre, as colour tiles.
 */
export function Browse({ onSearch }: { onSearch: () => void }) {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const actions = useTrackActions();
  const { width } = useWindowDimensions();
  const { data } = useLibraryQuery(loadBrowse, []);
  const columns = width >= 700 ? 4 : width >= 500 ? 3 : 2;
  const tileWidth = Math.floor((width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns);

  const tiles: Tile[] = [
    ...AUTO_PLAYLISTS.map((p) => ({
      key: `auto:${p.kind}`,
      title: p.title,
      art: data?.art[p.kind] ?? null,
      icon: p.icon,
      href: { pathname: '/auto/[kind]', params: { kind: p.kind } } as const,
      onLongPress: () => actions.collectionMenu(p.title, (d) => listAutoPlaylist(d, p.kind)),
    })),
    { key: 'bookmarks', title: 'Bookmarks', art: null, icon: 'bookmark.fill', href: '/bookmarks' },
    ...(data?.genres ?? []).map((g) => ({
      key: `genre:${g.name}`,
      title: g.name,
      art: g.art_key,
      icon: 'music.note' as const,
      href: groupHref('genre', g.name),
      onLongPress: () => actions.collectionMenu(g.name, (d) => listGroupTracks(d, 'genre', g.name)),
    })),
  ];

  const openAlbum = (a: AlbumSummary) => router.push(albumHref(a.album, a.album_artist));

  return (
    <ScrollView
      // The field (child 1) pins under the status bar once the title has scrolled away.
      stickyHeaderIndices={[1]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <View style={styles.titleRow}>
        {/* Only when pushed onto a stack (the home screen shortcut, from Library); canGoBack would
            also be true at the root of any tab but the first, going back to that tab. */}
        {(navigation.getState()?.index ?? 0) > 0 ? (
          <IconButton name="chevron.left" onPress={() => router.back()} accessibilityLabel="Back" />
        ) : null}
        <Text style={[type.largeTitle, { color: colors.label }]} accessibilityRole="header">Search</Text>
      </View>
      <View style={styles.sticky}>
        <Pressable
          onPress={onSearch}
          accessibilityRole="search"
          accessibilityLabel="Search. What do you want to listen to?"
          style={({ pressed }) => [styles.field, pressed && styles.pressed]}
        >
          <SymbolView name="magnifyingglass" size={20} tintColor={SEARCH_FIELD.ink} weight="semibold" />
          <Text numberOfLines={1} style={[type.body, styles.placeholder]}>What do you want to listen to?</Text>
        </Pressable>
      </View>

      {data?.discover.length ? (
        <View>
          <Text style={[type.title, styles.heading]}>Discover something new</Text>
          <FlatList
            horizontal
            data={data.discover}
            keyExtractor={(a) => `${a.album_artist ?? ''}::${a.album}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openAlbum(item)}
                onLongPress={() => actions.collectionMenu(item.album, (d) => listAlbumTracks(d, item.album, item.album_artist))}
                accessibilityRole="button"
                accessibilityLabel={`${item.album}${item.album_artist ? ` by ${item.album_artist}` : ''}`}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <Artwork artKey={item.art_key} size={CARD.width} height={CARD.height} rounded="none" />
                <View style={styles.cardLabel}>
                  <Text numberOfLines={2} style={[type.subhead, styles.cardTitle]}>{item.album}</Text>
                  {item.album_artist ? (
                    <Text numberOfLines={1} style={[type.caption, styles.cardArtist]}>{item.album_artist}</Text>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      <Text style={[type.title, styles.heading]}>Browse all</Text>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => router.push(t.href)}
            onLongPress={t.onLongPress}
            accessibilityRole="button"
            accessibilityLabel={t.title}
            style={({ pressed }) => [styles.tile, { width: tileWidth, backgroundColor: tileColor(t.key) }, pressed && styles.pressed]}
          >
            <Text numberOfLines={2} style={[type.headline, styles.tileTitle]}>{t.title}</Text>
            <View style={styles.tilted}>
              {t.art ? (
                <Artwork artKey={t.art} size={TILTED} />
              ) : (
                <SymbolView name={t.icon} size={TILTED * 0.7} tintColor={colors.onTint} />
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const TILTED = 64;

const useStyles = makeStyles((colors) => ({
  content: { paddingBottom: spacing.xl },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  // Opaque, so the page scrolls under the pinned field rather than showing through it.
  sticky: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.background },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: SEARCH_FIELD.background,
    // Barely there on a dark page; on a white one, what shows where the field ends.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    shadowColor: colors.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  placeholder: { flex: 1, color: SEARCH_FIELD.ink, fontWeight: '600' },
  heading: { color: colors.label, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  strip: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  card: { width: CARD.width, height: CARD.height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.fill },
  cardLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.shadow,
  },
  cardTitle: { color: colors.onTint, fontWeight: '700' },
  cardArtist: { color: colors.onTint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg },
  tile: { height: 100, borderRadius: radius.sm, overflow: 'hidden', padding: spacing.md },
  tileTitle: { color: colors.onTint, fontWeight: '700', maxWidth: '75%' },
  tilted: {
    position: 'absolute',
    right: -10,
    bottom: -6,
    width: TILTED,
    height: TILTED,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '25deg' }],
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { opacity: 0.6 },
}));
