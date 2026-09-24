import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Paths } from 'expo-file-system';
import { ListRow } from '@/components/list-row';
import { ChoiceRow, Note, Section, ToggleRow } from '@/components/settings-rows';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { engineInfo } from '@/player';
import { setPref, usePrefs, type Prefs } from '@/prefs';
import { ACCENTS, makeStyles, type AccentName, type ThemeName } from '@/theme';
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

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <Section title="Library">
        <ListRow title="Scan library" subtitle={count == null ? '' : formatCount(count, 'song')} onPress={() => router.push('/scan')} />
        <ChoiceRow
          pref="minDurationMs"
          title="Hide short songs"
          options={MIN_DURATION_CHOICES}
          label={secondsLabel}
          after={() => libraryEvents.emit('changed', undefined)}
        />
        <ListRow title="Hidden songs" onPress={() => router.push('/hidden')} />
        <ListRow title="Excluded folders" onPress={() => router.push('/excluded')} />
      </Section>
      <Section title="Appearance">
        <ChoiceRow pref="theme" title="Theme" options={Object.keys(THEMES) as ThemeName[]} label={(t) => THEMES[t]} />
        <ChoiceRow pref="accent" title="Accent color" options={Object.keys(ACCENTS) as AccentName[]} label={(a) => ACCENTS[a].label} />
        <ChoiceRow
          pref="playerLayout"
          title="Player layout"
          options={Object.keys(LAYOUTS) as Prefs['playerLayout'][]}
          label={(l) => LAYOUTS[l]}
        />
        <ToggleRow title="Blurred artwork behind the player" value={prefs.blurBackground} onChange={(v) => setPref('blurBackground', v)} />
        <ChoiceRow pref="density" title="List density" options={Object.keys(DENSITIES) as Prefs['density'][]} label={(d) => DENSITIES[d]} />
        <ListRow title="Tabs and library views" subtitle="Choose which show, and in what order" onPress={() => router.push('/tabs')} />
      </Section>
      <Section title="Playback">
        <ChoiceRow pref="skipSeconds" title="Skip back and forward" options={SKIP_CHOICES} label={(s) => `${s} seconds`} />
        <ChoiceRow pref="resumeMinMs" title="Remember position in long songs" options={RESUME_CHOICES} label={minutesLabel} />
        <ToggleRow title="Fade out before the sleep timer stops" value={prefs.sleepFade} onChange={(v) => setPref('sleepFade', v)} />
        <ToggleRow title="Keep the screen on in the player" value={prefs.keepAwake} onChange={(v) => setPref('keepAwake', v)} />
        {canLockOrientation() ? (
          <ChoiceRow
            pref="orientation"
            title="Rotation"
            options={Object.keys(ORIENTATIONS) as Prefs['orientation'][]}
            label={(o) => ORIENTATIONS[o]}
          />
        ) : null}
      </Section>
      <Section title="Data">
        <ListRow title="Backup and restore" subtitle="Playlists, queues, play counts, settings" onPress={() => router.push('/backup')} />
      </Section>
      <Section title="Audio engine">
        <Note>
          {engineInfo.kind === 'native'
            ? `melodify-audio ${engineInfo.version} (${engineInfo.implementation})`
            : 'Fake engine: melodify-audio is not in this build, so nothing will play. Install a newer IPA.'}
        </Note>
        {engineInfo.reason ? <Note>{engineInfo.reason}</Note> : null}
      </Section>
      <Section title="Storage">
        <Note>Music folder: {decodeURIComponent(Paths.document.uri)}</Note>
        <Note>
          Copy music into the folder above, over USB with ifuse or through the Files app. A LiveContainer install
          nests it inside LiveContainer’s own container; see the README.
        </Note>
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
}));
