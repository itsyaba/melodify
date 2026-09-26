import { Pressable, Text, View } from 'react-native';
import { SymbolView } from '@/components/symbol';
import { Artwork } from '@/components/artwork';
import type { AlbumSummary, Track } from '@/db/types';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

const PLAY = 36;
const SONG_ART = 52;

interface AlbumProps {
  album: AlbumSummary;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
  /** The round button on the cover: plays the album without opening it. */
  onPlay: () => void;
}

/** A big square cover with a play button on it, and the album and artist under it. */
export function AlbumPlayCard({ album, size, onPress, onLongPress, onPlay }: AlbumProps) {
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
        <Artwork artKey={album.art_key} size={size} rounded="lg" />
        <Text numberOfLines={1} style={[type.subhead, styles.albumTitle]}>{album.album}</Text>
        <Text numberOfLines={1} style={[type.footnote, styles.secondary]}>{album.album_artist ?? 'Unknown artist'}</Text>
      </Pressable>
      <Pressable
        onPress={onPlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Play ${album.album}`}
        style={({ pressed }) => [styles.play, { top: size - PLAY - spacing.sm }, pressed && styles.pressed]}
      >
        <SymbolView name="play.fill" size={15} tintColor={colors.onTint} />
      </Pressable>
    </View>
  );
}

interface SongProps {
  track: Track;
  /** The song playing now: its name in the accent, a waveform in place of the play glyph. */
  current: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/** A song on its own rounded card: cover, name and artist, and a round play button. */
export function SongCard({ track, current, onPress, onLongPress }: SongProps) {
  const styles = useStyles();
  const colors = useTheme();
  const accent = current ? colors.tint : colors.label;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}${track.artist ? ` by ${track.artist}` : ''}`}
      accessibilityState={{ selected: current }}
      style={({ pressed }) => [styles.song, pressed && styles.pressed]}
    >
      <Artwork artKey={track.art_key} size={SONG_ART} rounded="md" />
      <View style={styles.songText}>
        <Text numberOfLines={1} style={[type.body, styles.songTitle, { color: accent }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, styles.secondary]}>{track.artist ?? 'Unknown artist'}</Text>
      </View>
      <View style={[styles.round, !current && styles.nudge]}>
        <SymbolView name={current ? 'waveform' : 'play.fill'} size={14} tintColor={accent} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  albumTitle: { color: colors.label, fontWeight: '600', marginTop: spacing.sm },
  secondary: { color: colors.secondaryLabel, marginTop: 1 },
  play: {
    position: 'absolute',
    left: spacing.sm,
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudged right: a play triangle looks off-centre when it is centred exactly.
    paddingLeft: 2,
    backgroundColor: colors.scrim,
  },
  song: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.secondaryBackground,
  },
  songText: { flex: 1, gap: 1 },
  songTitle: { fontWeight: '600' },
  round: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  nudge: { paddingLeft: 2 },
  pressed: { opacity: 0.6 },
}));
