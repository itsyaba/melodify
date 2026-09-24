import type { ReactNode } from 'react';
import { Switch, Text, View } from 'react-native';
import { setPref, usePrefs, type Prefs } from '@/prefs';
import { makeStyles, spacing, type, useTheme } from '@/theme';
import { ListRow } from './list-row';
import { showMenu } from './menus';

/** The rows the Settings screens are built from, so every one of them looks the same. */

export function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      {children}
      {footer ? <Note>{footer}</Note> : null}
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={[type.footnote, styles.note]}>{children}</Text>;
}

export function ToggleRow({ title, value, onChange }: { title: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={[type.body, { color: colors.label, flex: 1 }]}>{title}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.tint }} accessibilityLabel={title} />
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
            label: value === prefs[pref] ? `✓ ${label(value)}` : label(value),
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

const useStyles = makeStyles((colors) => ({
  section: { paddingTop: spacing.xl },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
}));
