import { Platform, Switch, Text, View } from 'react-native';
import { makeStyles, spacing, type, useTheme } from '@/theme';
import { IconButton } from './icon-button';

/**
 * A settings list of things that can each be switched on or off and put in order: the tabs, the
 * library views, the player's shortcuts. Arrows rather than dragging: the lists are short, and
 * some of them remount the screen behind when they change, which a drag would do mid-gesture.
 */
export function OrderedToggles<K extends string>({
  title,
  footer,
  all,
  shown,
  required,
  labels,
  onChange,
}: {
  title: string;
  footer: string;
  all: readonly K[];
  shown: K[];
  required: readonly K[];
  labels: Record<K, string>;
  onChange: (next: K[]) => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const hidden = all.filter((k) => !shown.includes(k));
  const move = (key: K, by: -1 | 1) => {
    const i = shown.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const next = shown.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      {[...shown, ...hidden].map((key) => {
        const on = shown.includes(key);
        const i = shown.indexOf(key);
        return (
          <View key={key} style={styles.row}>
            <Text style={[type.body, { flex: 1, color: on ? colors.label : colors.secondaryLabel }]}>{labels[key]}</Text>
            <IconButton
              name="chevron.up"
              size={16}
              disabled={!on || i === 0}
              onPress={() => move(key, -1)}
              accessibilityLabel={`Move ${labels[key]} up`}
            />
            <IconButton
              name="chevron.down"
              size={16}
              disabled={!on || i === shown.length - 1}
              onPress={() => move(key, 1)}
              accessibilityLabel={`Move ${labels[key]} down`}
            />
            <Switch
              value={on}
              disabled={required.includes(key)}
              trackColor={{ true: colors.tint, false: Platform.OS === 'android' ? colors.fill : undefined }}
              thumbColor={Platform.OS === 'android' ? colors.onTint : undefined}
              onValueChange={(v) => onChange(v ? [...shown, key] : shown.filter((k) => k !== key))}
              accessibilityLabel={`Show ${labels[key]}`}
            />
          </View>
        );
      })}
      <Text style={[type.footnote, styles.footer]}>{footer}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { paddingTop: spacing.xl },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  footer: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
}));
