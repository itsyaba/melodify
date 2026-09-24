import { Pressable, StyleSheet, Text } from 'react-native';
import type { AlbumSummary } from '@/db/types';
import { colors, spacing, type } from '@/theme';
import { Artwork } from './artwork';

const SIZE = 132;

/** An album as a tile, for the horizontal strip on an artist, genre or year. */
export function AlbumCard({ album, onPress, onLongPress }: { album: AlbumSummary; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${album.album}${album.album_artist ? ` by ${album.album_artist}` : ''}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Artwork artKey={album.art_key} size={SIZE} rounded="md" />
      <Text numberOfLines={1} style={[type.footnote, { color: colors.label }]}>{album.album}</Text>
      <Text numberOfLines={1} style={[type.caption, { color: colors.secondaryLabel }]}>
        {album.year ?? album.album_artist ?? ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: SIZE, gap: 2 },
  pressed: { opacity: 0.6 },
});

export const albumCardGap = spacing.md;
