import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '@/theme';

interface Props<T extends string> {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Plain JS segmented control; swapped for @expo/ui Picker once the dev client exists. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segment, active && styles.active]}>
            <Text style={[type.footnote, { color: colors.label, fontWeight: active ? '600' : '400' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    padding: 2,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm },
  active: { backgroundColor: colors.background },
});
