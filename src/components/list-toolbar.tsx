import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { makeStyles, spacing, type, useTheme } from '@/theme';
import { IconButton } from './icon-button';
import { showMenu } from './menus';

export interface SortOption<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  /** "128 songs · 7:42:10" */
  summary: string;
  sort?: { options: readonly SortOption<T>[]; value: T; onChange: (value: T) => void };
  onPlay?: () => void;
  onShuffle?: () => void;
  /** Anything else for the strip, e.g. a grid / list toggle. */
  trailing?: ReactNode;
}

/** The strip above a list: what is in it, how it is sorted, and play or shuffle all of it. */
export function ListToolbar<T extends string>({ summary, sort, onPlay, onShuffle, trailing }: Props<T>) {
  const styles = useStyles();
  const colors = useTheme();
  const current = sort?.options.find((o) => o.key === sort.value);
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[type.footnote, styles.summary]}>{summary}</Text>
      {sort && current ? (
        <Pressable
          hitSlop={spacing.sm}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${current.label}. Change sort order`}
          style={({ pressed }) => [styles.sort, pressed && styles.pressed]}
          onPress={() =>
            showMenu({
              title: 'Sort by',
              items: sort.options.map((o) => ({
                label: o.key === sort.value ? `✓ ${o.label}` : o.label,
                onPress: () => sort.onChange(o.key),
              })),
            })
          }
        >
          <SymbolView name="arrow.up.arrow.down" size={13} tintColor={colors.tint} />
          <Text style={[type.footnote, { color: colors.tint }]}>{current.label}</Text>
        </Pressable>
      ) : null}
      {onShuffle ? <IconButton name="shuffle" size={18} color={colors.tint} onPress={onShuffle} accessibilityLabel="Shuffle all" /> : null}
      {onPlay ? <IconButton name="play.fill" size={18} color={colors.tint} onPress={onPlay} accessibilityLabel="Play all" /> : null}
      {trailing}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  summary: { flex: 1, color: colors.secondaryLabel },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.5 },
}));
