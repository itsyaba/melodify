import { Pressable, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { Artwork } from '@/components/artwork';
import type { AlbumSummary, GroupSummary, Track } from '@/db/types';
import { face } from '@/screens/onboarding/fonts';
import { makeStyles, ON_TINT_FAINT, ON_TINT_MUTED, radius, spacing, type, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';

export const TILE_HEIGHT = 60;
const ALL_HEIGHT = 80;
const PLAY = 34;
const ROW_ART = 48;

interface TileProps {
  title: string;
  /** Its size, under the title. */
  meta: string;
  artKey: string | null;
  /** Stands in for the cover while the list has no art. */
  icon: SFSymbol;
  /** Always the icon, on this sweep of two colors, in place of the list's art. */
  gradient?: readonly [string, string];
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}

/** One of Home's lists as a short tile, two to a row: its cover flush on the left, name and size. */
export function ListTile({ title, meta, artKey, icon, gradient, width, onPress, onLongPress }: TileProps) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      {artKey && !gradient ? (
        <Artwork artKey={artKey} size={TILE_HEIGHT} rounded="none" />
      ) : (
        <View style={[styles.tileIcon, gradient && sweep(gradient)]}>
          <SymbolView name={icon} size={22} tintColor={colors.onTint} />
        </View>
      )}
      <View style={styles.tileText}>
        <Text numberOfLines={1} style={[type.subhead, styles.strong]}>{title}</Text>
        <Text numberOfLines={1} style={[type.caption, styles.secondary]}>{meta}</Text>
      </View>
    </Pressable>
  );
}

/** A diagonal linear gradient between two colors, as a View style. */
function sweep([from, to]: readonly [string, string]) {
  return {
    experimental_backgroundImage: [
      {
        type: 'linear-gradient' as const,
        direction: '135deg',
        colorStops: [
          { color: from, positions: ['0%'] },
          { color: to, positions: ['100%'] },
        ],
      },
    ],
  };
}

interface AllSongsProps {
  /** How many songs and how long, under the title. */
  meta: string;
  onPress: () => void;
}

/** The wide card over Home's tiles: the whole library, in the accent, opening Library's Songs. */
export function AllSongsCard({ meta, onPress }: AllSongsProps) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`All songs, ${meta}`}
      style={({ pressed }) => [styles.all, pressed && styles.pressed]}
    >
      <View style={styles.allIcon}>
        <SymbolView name="music.note" size={24} tintColor={colors.onTint} />
      </View>
      <View style={styles.tileText}>
        <Text numberOfLines={1} style={[styles.allTitle, face('semibold')]}>All songs</Text>
        <Text numberOfLines={1} style={[type.footnote, styles.allMeta]}>{meta}</Text>
      </View>
      <SymbolView name="chevron.right" size={16} weight="semibold" tintColor={ON_TINT_MUTED} />
    </Pressable>
  );
}

interface AlbumProps {
  album: AlbumSummary;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
  /** The round button on the cover: plays the album without opening it. */
  onPlay: () => void;
}

/** A square cover with a play button in its corner, and the album and artist under it. */
export function AlbumCard({ album, size, onPress, onLongPress, onPlay }: AlbumProps) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={{ width: size }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${album.album}${album.album_artist ? ` by ${album.album_artist}` : ''}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Artwork artKey={album.art_key} size={size} rounded="md" />
        <Text numberOfLines={1} style={[type.subhead, styles.strong, styles.under]}>{album.album}</Text>
        <Text numberOfLines={1} style={[type.footnote, styles.secondary]}>{album.album_artist ?? 'Unknown artist'}</Text>
      </Pressable>
      <Pressable
        onPress={onPlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Play ${album.album}`}
        style={({ pressed }) => [styles.play, { top: size - PLAY - spacing.sm }, pressed && styles.pressed]}
      >
        <SymbolView name="play.fill" size={14} tintColor={colors.onTint} />
      </Pressable>
    </View>
  );
}

interface ArtistProps {
  artist: GroupSummary;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
}

/** An artist as a round picture (the cover of one of their songs) with the name under it. */
export function ArtistCircle({ artist, size, onPress, onLongPress }: ArtistProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={artist.name}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}
    >
      <Artwork artKey={artist.art_key} size={size} rounded="full" />
      <Text numberOfLines={1} style={[type.footnote, styles.strong, styles.under, styles.centered]}>{artist.name}</Text>
    </Pressable>
  );
}

interface RowProps {
  track: Track;
  /** The song playing now: its name in the accent, a waveform in place of its length. */
  current: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/** A song as a plain row: cover, name and artist, and its length. */
export function RecentRow({ track, current, onPress, onLongPress }: RowProps) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}${track.artist ? ` by ${track.artist}` : ''}`}
      accessibilityState={{ selected: current }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Artwork artKey={track.art_key} size={ROW_ART} rounded="sm" />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[type.body, styles.rowTitle, current && { color: colors.tint }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, styles.secondary]}>{track.artist ?? 'Unknown artist'}</Text>
      </View>
      {current ? (
        <SymbolView name="waveform" size={16} tintColor={colors.tint} />
      ) : (
        <Text style={[type.footnote, styles.secondary, styles.digits]}>{formatDuration(track.duration_ms)}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  strong: { color: colors.label, fontWeight: '600' },
  secondary: { color: colors.secondaryLabel },
  under: { marginTop: spacing.sm },
  centered: { textAlign: 'center' },
  tile: {
    height: TILE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.secondaryBackground,
  },
  tileIcon: {
    width: TILE_HEIGHT,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  tileText: { flex: 1, paddingHorizontal: spacing.md, gap: 1 },
  all: {
    height: ALL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.tint,
  },
  allIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ON_TINT_FAINT,
  },
  allTitle: { fontSize: 20, lineHeight: 24, color: colors.onTint },
  allMeta: { color: ON_TINT_MUTED },
  play: {
    position: 'absolute',
    right: spacing.sm,
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudged right: a play triangle looks off-centre when it is centred exactly.
    paddingLeft: 2,
    backgroundColor: colors.tint,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  rowPressed: { backgroundColor: colors.fill },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { color: colors.label, fontWeight: '500' },
  digits: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.6 },
}));
