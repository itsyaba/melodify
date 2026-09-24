import { Pressable, StyleSheet, Text } from 'react-native';
import type { AlbumSummary } from '@/db/types';
import { spacing, type, useTheme } from '@/theme';
import { Artwork } from './artwork';

const SIZE = 132;

interface Props {
  album: AlbumSummary;
  /** Side of the artwork; the card is that wide. */
  size?: number;
  /** What the second line shows: the year (on an artist, where the artist is known) or the artist. */
  subtitle?: 'year' | 'artist';
  onPress: () => void;
  onLongPress?: () => void;
}

/** An album as a tile: the strip on an artist, genre or year, and the albums grid. */
export function AlbumCard({ album, size = SIZE, subtitle = 'year', onPress, onLongPress }: Props) {
  const colors = useTheme();
  const second = subtitle === 'year' ? (album.year ?? album.album_artist) : (album.album_artist ?? album.year);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${album.album}${album.album_artist ? ` by ${album.album_artist}` : ''}`}
      style={({ pressed }) => [{ width: size }, styles.card, pressed && styles.pressed]}
    >
      <Artwork artKey={album.art_key} size={size} rounded="md" />
      <Text numberOfLines={1} style={[type.footnote, { color: colors.label }]}>{album.album}</Text>
      <Text numberOfLines={1} style={[type.caption, { color: colors.secondaryLabel }]}>{second ?? ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2 },
  pressed: { opacity: 0.6 },
});

export const albumCardGap = spacing.md;
