import { Pressable, StyleSheet, type ColorValue } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { spacing, useTheme } from '@/theme';

interface Props {
  name: SFSymbol;
  size?: number;
  color?: ColorValue;
  onPress: () => void;
  /** Hold actions, e.g. seeking while previous or next is held down. */
  onLongPress?: () => void;
  onPressOut?: () => void;
  /** Required: the symbol carries no text, so this is the only label a screen reader gets. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
}

export function IconButton({
  name,
  size = 22,
  color,
  onPress,
  onLongPress,
  onPressOut,
  accessibilityLabel,
  accessibilityHint,
  disabled,
}: Props) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={350}
      disabled={disabled}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing.md}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
    >
      <SymbolView name={name} size={size} tintColor={disabled ? colors.tertiaryLabel : (color ?? colors.label)} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
});
