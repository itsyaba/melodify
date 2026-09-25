import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

export interface QuickCard {
  key: string;
  title: string;
  icon: SFSymbol;
  /** The accent-filled cover, kept for Favorites as Spotify keeps its gradient for Liked Songs. */
  filled?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

const HEIGHT = 56;

/**
 * Spotify's shortcut grid, two cards a row with the cover flush on the left: here the lists the
 * library keeps by itself, Bookmarks, and New playlist, above the playlists you made.
 */
export function QuickCards({ cards }: { cards: QuickCard[] }) {
  const styles = useStyles();
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 4 : width >= 500 ? 3 : 2;
  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.sm * (columns - 1)) / columns);
  return (
    <View style={styles.grid}>
      {cards.map((c) => (
        <Pressable
          key={c.key}
          onPress={c.onPress}
          onLongPress={c.onLongPress}
          accessibilityRole="button"
          accessibilityLabel={c.title}
          style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.pressed]}
        >
          <View style={[styles.cover, c.filled && styles.filled]}>
            <SymbolView name={c.icon} size={22} tintColor={c.filled ? colors.onTint : colors.tint} />
          </View>
          <Text numberOfLines={2} style={[type.footnote, styles.title]}>{c.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: HEIGHT,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.fill,
  },
  cover: { width: HEIGHT, height: HEIGHT, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  filled: { backgroundColor: colors.tint },
  title: { flex: 1, paddingRight: spacing.sm, color: colors.label, fontWeight: '600' },
  pressed: { opacity: 0.6 },
}));
