import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow } from '@/components/list-row';
import { Segmented } from '@/components/segmented';
import { ChoiceRow, Section, ToggleRow } from '@/components/settings-rows';
import { SymbolView } from '@/components/symbol';
import { setPref, usePrefs, type Prefs } from '@/prefs';
import { SHORTCUTS } from '@/screens/player/shortcuts';
import { ACCENTS, availableAccents, makeStyles, radius, spacing, useTheme, type ThemeName } from '@/theme';

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'black', label: 'Black' },
];
const LAYOUTS: Record<Prefs['playerLayout'], string> = {
  standard: 'Standard',
  edge: 'Edge-to-edge artwork',
  compact: 'Compact, with up next',
};
const DENSITIES: { key: Prefs['density']; label: string }[] = [
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'compact', label: 'Compact' },
];

/** The accents as a row of color dots; the chosen one is ringed and checked. */
function AccentSwatches() {
  const styles = useStyles();
  const colors = useTheme();
  const prefs = usePrefs();
  const dark = useColorScheme() === 'dark';
  return (
    <View style={styles.swatches}>
      {availableAccents().map((name) => {
        const accent = ACCENTS[name];
        const selected = prefs.accent === name;
        return (
          <Pressable
            key={name}
            onPress={() => setPref('accent', name)}
            accessibilityRole="radio"
            accessibilityLabel={accent.label}
            accessibilityState={{ selected }}
            hitSlop={4}
            style={[styles.ring, selected && { borderColor: colors.label }]}
          >
            <View style={[styles.swatch, { backgroundColor: dark ? accent.dark : accent.hex }]}>
              {selected ? <SymbolView name="checkmark" size={14} tintColor={colors.onTint} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Theme, accent and how the player and lists are drawn. */
export function AppearanceSettingsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const prefs = usePrefs();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Section title="Theme">
        <View style={styles.padded}>
          <Segmented options={THEMES} value={prefs.theme} onChange={(t) => setPref('theme', t)} />
        </View>
      </Section>
      <Section title="Accent color">
        <AccentSwatches />
      </Section>
      <Section title="Player">
        <ChoiceRow
          pref="playerLayout"
          title="Layout"
          options={Object.keys(LAYOUTS) as Prefs['playerLayout'][]}
          label={(l) => LAYOUTS[l]}
        />
        <ToggleRow
          title="Blurred artwork background"
          value={prefs.blurBackground}
          onChange={(v) => setPref('blurBackground', v)}
        />
        <ListRow
          title="Shortcuts"
          subtitle={prefs.playerShortcuts.length ? prefs.playerShortcuts.map((k) => SHORTCUTS[k].label).join(', ') : 'None, all in the menu'}
          onPress={() => router.push('/settings/shortcuts')}
        />
      </Section>
      <Section title="Lists">
        <View style={styles.padded}>
          <Segmented options={DENSITIES} value={prefs.density} onChange={(d) => setPref('density', d)} />
        </View>
        <ListRow title="Tabs and library views" subtitle="Which show, and in what order" onPress={() => router.push('/settings/tabs')} />
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  padded: { paddingVertical: spacing.xs },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg },
  ring: { padding: 3, borderRadius: radius.full, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 30, height: 30, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
}));
