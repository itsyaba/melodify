import type { ReactNode } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Paths } from 'expo-file-system';
import { ListRow } from '@/components/list-row';
import { showMenu } from '@/components/menus';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { engineInfo } from '@/player';
import { setPref, usePrefs, type Prefs } from '@/prefs';
import { ACCENTS, makeStyles, spacing, type, useTheme, type AccentName, type ThemeName } from '@/theme';
import { canLockOrientation } from '@/utils/device';
import { libraryEvents } from '@/utils/events';
import { formatCount } from '@/utils/format';

const SKIP_CHOICES = [5, 10, 15, 30, 45, 60];
const RESUME_CHOICES = [0, 5, 10, 20, 30, 60].map((m) => m * 60_000);
const MIN_DURATION_CHOICES = [0, 10, 30, 60, 120].map((s) => s * 1000);
const THEMES: Record<ThemeName, string> = { system: 'Match the system', light: 'Light', dark: 'Dark', black: 'Black' };
const LAYOUTS: Record<Prefs['playerLayout'], string> = {
  standard: 'Standard',
  edge: 'Edge-to-edge artwork',
  compact: 'Compact, with up next',
};
const DENSITIES: Record<Prefs['density'], string> = { comfortable: 'Comfortable', compact: 'Compact' };
const ORIENTATIONS: Record<Prefs['orientation'], string> = {
  auto: 'Rotate freely',
  portrait: 'Portrait only',
  landscape: 'Landscape only',
};

function minutesLabel(ms: number): string {
  return ms === 0 ? 'Off' : `${ms / 60_000} min or longer`;
}
function secondsLabel(ms: number): string {
  if (ms === 0) return 'Off';
  return ms < 60_000 ? `Under ${ms / 1000} s` : `Under ${ms / 60_000} min`;
}

export function SettingsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const prefs = usePrefs();
  const { data: count } = useLibraryQuery(countTracks);

  /** A row whose value is picked from a sheet. */
  const choice = <K extends keyof Prefs>(
    key: K,
    title: string,
    options: readonly Prefs[K][],
    label: (value: Prefs[K]) => string,
    after?: () => void,
  ) => (
    <ListRow
      title={title}
      subtitle={label(prefs[key])}
      onPress={() =>
        showMenu({
          title,
          items: options.map((value) => ({
            label: value === prefs[key] ? `✓ ${label(value)}` : label(value),
            onPress: () => {
              setPref(key, value);
              after?.();
            },
          })),
        })
      }
    />
  );

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <Section title="Library">
        <ListRow title="Scan library" subtitle={count == null ? '' : formatCount(count, 'song')} onPress={() => router.push('/scan')} />
        {choice('minDurationMs', 'Hide short songs', MIN_DURATION_CHOICES, secondsLabel, () =>
          libraryEvents.emit('changed', undefined),
        )}
        <ListRow title="Hidden songs" onPress={() => router.push('/hidden')} />
        <ListRow title="Excluded folders" onPress={() => router.push('/excluded')} />
      </Section>
      <Section title="Appearance">
        {choice('theme', 'Theme', Object.keys(THEMES) as ThemeName[], (t) => THEMES[t])}
        {choice('accent', 'Accent color', Object.keys(ACCENTS) as AccentName[], (a) => ACCENTS[a].label)}
        {choice('playerLayout', 'Player layout', Object.keys(LAYOUTS) as Prefs['playerLayout'][], (l) => LAYOUTS[l])}
        <ToggleRow title="Blurred artwork behind the player" value={prefs.blurBackground} onChange={(v) => setPref('blurBackground', v)} />
        {choice('density', 'List density', Object.keys(DENSITIES) as Prefs['density'][], (d) => DENSITIES[d])}
        <ListRow title="Tabs and library views" subtitle="Choose which show, and in what order" onPress={() => router.push('/tabs')} />
      </Section>
      <Section title="Playback">
        {choice('skipSeconds', 'Skip back and forward', SKIP_CHOICES, (s) => `${s} seconds`)}
        {choice('resumeMinMs', 'Remember position in long songs', RESUME_CHOICES, minutesLabel)}
        <ToggleRow title="Fade out before the sleep timer stops" value={prefs.sleepFade} onChange={(v) => setPref('sleepFade', v)} />
        <ToggleRow title="Keep the screen on in the player" value={prefs.keepAwake} onChange={(v) => setPref('keepAwake', v)} />
        {canLockOrientation()
          ? choice('orientation', 'Rotation', Object.keys(ORIENTATIONS) as Prefs['orientation'][], (o) => ORIENTATIONS[o])
          : null}
      </Section>
      <Section title="Audio engine">
        <Text style={[type.footnote, styles.note]}>
          {engineInfo.kind === 'native'
            ? `melodify-audio ${engineInfo.version} (${engineInfo.implementation})`
            : 'Fake engine: melodify-audio is not in this build, so nothing will play. Install a newer IPA.'}
        </Text>
        {engineInfo.reason ? <Text style={[type.footnote, styles.note]}>{engineInfo.reason}</Text> : null}
      </Section>
      <Section title="Storage">
        <Text style={[type.footnote, styles.note]}>Music folder: {decodeURIComponent(Paths.document.uri)}</Text>
        <Text style={[type.footnote, styles.note]}>
          Copy music into the folder above, over USB with ifuse or through the Files app. A LiveContainer install
          nests it inside LiveContainer’s own container; see the README.
        </Text>
      </Section>
    </ScrollView>
  );
}

function ToggleRow({ title, value, onChange }: { title: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={[type.body, { color: colors.label, flex: 1 }]}>{title}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.tint }} accessibilityLabel={title} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
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
