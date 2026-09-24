import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  /** Defaults to a disclosure chevron; pass null for none. */
  trailing?: ReactNode;
  /** Title in the tint color, for rows that are actions ("New playlist"). */
  tinted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

/** Generic navigation row: album, artist, folder, settings entry. */
export function ListRow({ title, subtitle, leading, trailing, tinted, onPress, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {leading}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[type.body, { color: tinted ? colors.tint : colors.label }]}>{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing === undefined ? <Text style={[type.body, { color: colors.tertiaryLabel }]}>›</Text> : trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  pressed: { backgroundColor: colors.fill },
  text: { flex: 1, gap: 2 },
});
