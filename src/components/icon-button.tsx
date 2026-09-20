import { Pressable, StyleSheet, type ColorValue } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { colors, spacing } from '@/theme';

interface Props {
  name: SFSymbol;
  size?: number;
  color?: ColorValue;
  onPress: () => void;
  /** Required: the symbol carries no text, so this is the only label a screen reader gets. */
  accessibilityLabel: string;
  disabled?: boolean;
}

export function IconButton({ name, size = 22, color = colors.label, onPress, accessibilityLabel, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing.md}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
    >
      <SymbolView name={name} size={size} tintColor={disabled ? colors.tertiaryLabel : color} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
});
