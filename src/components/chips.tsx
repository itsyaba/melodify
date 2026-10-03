import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

interface Props<T extends string | number> {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Long press on a chip, e.g. a queue tab's menu. */
  onLongPress?: (value: T) => void;
  /** A trailing chip that is an action rather than an option ("+" for a new queue). */
  action?: { label: string; onPress: () => void; accessibilityLabel: string };
  /** The chosen pill in the accent color, as Spotify's library filters are, rather than the label's. */
  tinted?: boolean;
  /** Taller, fully round pills with larger text, as Home's filters are. */
  large?: boolean;
}

/** Horizontally scrolling pills: the library views, the queue tabs. */
export function Chips<T extends string | number>({ options, value, onChange, onLongPress, action, tinted, large }: Props<T>) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <ScrollView
      horizontal
      // A tap on the status bar is for the list below: iOS ignores it if two scroll views claim it.
      scrollsToTop={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            onLongPress={onLongPress ? () => onLongPress(o.key) : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.chip, large && styles.large, active && (tinted ? styles.activeTinted : styles.active), pressed && styles.pressed]}
          >
            <Text
              style={[
                large ? styles.largeText : type.subhead,
                { color: active ? (tinted ? colors.onTint : colors.background) : colors.label, fontWeight: active ? '600' : '400' },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={[type.subhead, { color: colors.tint, fontWeight: '600' }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.fill,
  },
  large: { paddingHorizontal: spacing.lg + 2, paddingVertical: 10, borderRadius: radius.full },
  largeText: { fontSize: 16 },
  active: { backgroundColor: colors.label },
  activeTinted: { backgroundColor: colors.tint },
  pressed: { opacity: 0.6 },
}));
