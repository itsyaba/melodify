import { Pressable, StyleSheet, Text } from 'react-native';
import { spacing, type, useTheme } from '@/theme';
import { Artwork } from './artwork';

interface Props {
  artKey: string | null;
  title: string;
  subtitle?: string | number | null;
  /** Side of the artwork; the tile is that wide. */
  size: number;
  /** Round art with centred text, the way Spotify draws an artist. */
  round?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}

/** Art with a title and a second line under it: an album, artist or genre in a grid or strip. */
export function Tile({ artKey, title, subtitle, size, round, onPress, onLongPress, accessibilityLabel }: Props) {
  const colors = useTheme();
  const align = round ? styles.centered : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [{ width: size }, styles.tile, pressed && styles.pressed]}
    >
      <Artwork artKey={artKey} size={size} rounded={round ? 'full' : 'md'} />
      <Text numberOfLines={1} style={[type.footnote, styles.title, align, { color: colors.label }]}>{title}</Text>
      <Text numberOfLines={1} style={[type.caption, align, { color: colors.secondaryLabel }]}>{subtitle ?? ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: 2 },
  title: { marginTop: spacing.xs, fontWeight: '500' },
  centered: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
});

export const tileGap = spacing.md;

/** Columns for a grid of tiles: three on a phone, as Spotify's and Musicolet's grids have. */
export function tileColumns(width: number): number {
  return Math.max(3, Math.round(width / 170));
}

/** The tile side that fills `columns` across `width`, inside the screen's side margins. */
export function tileSize(width: number, columns: number): number {
  return Math.floor((width - spacing.lg * 2 - tileGap * (columns - 1)) / columns);
}
