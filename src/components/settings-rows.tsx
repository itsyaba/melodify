import type { ReactNode } from 'react';
import { Platform, Pressable, Switch, Text, View, type ColorValue } from 'react-native';
import { setPref, usePrefs, type Prefs } from '@/prefs';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { ListRow } from './list-row';
import { showMenu } from './menus';
import { SymbolView, type SFSymbol } from './symbol';

/** The rows the Settings screens are built from, so every one of them looks the same. */

/** A titled group of rows on a rounded card, with an optional line of help under it. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      {title ? <Text style={[type.footnote, styles.sectionTitle]}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={[type.footnote, styles.footer]}>{footer}</Text> : null}
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={[type.footnote, styles.note]}>{children}</Text>;
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <Text style={[type.body, { color: colors.label }]}>{title}</Text>
        {subtitle ? <Text style={[type.footnote, { color: colors.secondaryLabel }]}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.tint, false: Platform.OS === 'android' ? colors.fill : undefined }}
        // Android paints the thumb in its own teal otherwise; iOS keeps its white one.
        thumbColor={Platform.OS === 'android' ? colors.onTint : undefined}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** A preference picked from a sheet, showing its current value underneath. */
export function ChoiceRow<K extends keyof Prefs>({
  pref,
  title,
  options,
  label,
  after,
}: {
  pref: K;
  title: string;
  options: readonly Prefs[K][];
  label: (value: Prefs[K]) => string;
  after?: (value: Prefs[K]) => void;
}) {
  const prefs = usePrefs();
  return (
    <ListRow
      title={title}
      subtitle={label(prefs[pref])}
      onPress={() =>
        showMenu({
          title,
          items: options.map((value) => ({
            label: label(value),
            selected: value === prefs[pref],
            onPress: () => {
              setPref(pref, value);
              after?.(value);
            },
          })),
        })
      }
    />
  );
}

/** A page of settings on the Settings root: a colored icon, its name and what is in it. */
export function CategoryRow({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: SFSymbol;
  color: ColorValue;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.category, pressed && { backgroundColor: colors.fill }]}
    >
      <View style={[styles.tile, { backgroundColor: color }]}>
        <SymbolView name={icon} size={17} tintColor={colors.onTint} />
      </View>
      <View style={styles.toggleText}>
        <Text numberOfLines={1} style={[type.body, { color: colors.label }]}>{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>{subtitle}</Text>
        ) : null}
      </View>
      <SymbolView name="chevron.right" size={14} tintColor={colors.tertiaryLabel} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { paddingTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle: {
    color: colors.secondaryLabel,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  card: { backgroundColor: colors.secondaryBackground, borderRadius: radius.lg, overflow: 'hidden' },
  footer: { color: colors.secondaryLabel, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  toggleText: { flex: 1, gap: 2 },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  tile: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
}));
