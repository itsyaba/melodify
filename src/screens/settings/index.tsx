import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Paths } from 'expo-file-system';
import { ListRow } from '@/components/list-row';
import { showMenu } from '@/components/menus';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { engineInfo } from '@/player';
import { setPref, usePrefs, type Prefs } from '@/prefs';
import { colors, spacing, type } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { formatCount } from '@/utils/format';

const SKIP_CHOICES = [5, 10, 15, 30, 45, 60];
const RESUME_CHOICES = [0, 5, 10, 20, 30, 60].map((m) => m * 60_000);
const MIN_DURATION_CHOICES = [0, 10, 30, 60, 120].map((s) => s * 1000);

function minutesLabel(ms: number): string {
  return ms === 0 ? 'Off' : `${ms / 60_000} min or longer`;
}
function secondsLabel(ms: number): string {
  if (ms === 0) return 'Off';
  return ms < 60_000 ? `Under ${ms / 1000} s` : `Under ${ms / 60_000} min`;
}

export function SettingsScreen() {
  const router = useRouter();
  const prefs = usePrefs();
  const { data: count } = useLibraryQuery(countTracks);

  /** A row whose value is picked from a sheet. */
  const choice = <K extends keyof Prefs>(
    key: K,
    title: string,
    options: Prefs[K][],
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
      <Section title="Playback">
        {choice('skipSeconds', 'Skip back and forward', SKIP_CHOICES, (s) => `${s} seconds`)}
        {choice('resumeMinMs', 'Remember position in long songs', RESUME_CHOICES, minutesLabel)}
        <ToggleRow
          title="Fade out before the sleep timer stops"
          value={prefs.sleepFade}
          onChange={(v) => setPref('sleepFade', v)}
        />
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
          Copy music into the folder above, over USB with ifuse or through the Files app. A
          LiveContainer install nests it inside LiveContainer's own container; see the README.
        </Text>
      </Section>
    </ScrollView>
  );
}

function ToggleRow({ title, value, onChange }: { title: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={[type.body, { color: colors.label, flex: 1 }]}>{title}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.tint }} accessibilityLabel={title} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  section: { paddingTop: spacing.xl },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 52 },
});
