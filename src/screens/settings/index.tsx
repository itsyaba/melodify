import { Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow } from '@/components/list-row';
import { showMenu } from '@/components/menus';
import { ChoiceRow, Note, Section, ToggleRow } from '@/components/settings-rows';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { engineInfo } from '@/player';
import { HEADSET_ACTIONS, setPref, usePrefs, type HeadsetAction, type Prefs } from '@/prefs';
import { openOnboarding } from '@/screens/onboarding/fonts';
import { SHORTCUTS } from '@/screens/player/shortcuts';
import { ACCENTS, availableAccents, makeStyles, type ThemeName } from '@/theme';
import { musicRootLabel } from '@/storage';
import { canLockOrientation } from '@/utils/device';
import { useStorageAccess, type StorageAccess } from '@/utils/storage-access';
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
const CROSSFADE_CHOICES = [0, 1, 2, 3, 4, 6, 8, 10, 12].map((s) => s * 1000);
const REPLAY_GAIN: Record<Prefs['replayGain'], string> = {
  off: 'Off',
  track: 'Track: every song evened out',
  album: 'Album: albums keep their dynamics',
};
const RG_PREAMP_CHOICES = [-6, -3, 0, 3, 6];
const ORIENTATIONS: Record<Prefs['orientation'], string> = {
  auto: 'Rotate freely',
  portrait: 'Portrait only',
  landscape: 'Landscape only',
};

const HEADSET_LABELS: Record<HeadsetAction, string> = {
  toggle: 'Play or pause',
  next: 'Next song',
  previous: 'Previous song',
  skipForward: 'Skip forward',
  skipBackward: 'Skip back',
  none: 'Nothing',
};
const CLICKS = ['One click', 'Two clicks', 'Three clicks'];
const ACCESS_LABELS: Record<StorageAccess, string> = {
  full: 'All files: scan, lyrics files, tag editing and backups',
  read: 'Music only: songs play, but folder covers, lyrics files, tag editing and backups need all files',
  none: 'None yet: Melodify cannot see your music',
};
const android = Platform.OS === 'android';

/** Android: what each run of headset clicks does, one row per count (Musicolet's own setting). */
function HeadsetRows() {
  const prefs = usePrefs();
  return CLICKS.map((title, i) => (
    <ListRow
      key={title}
      title={title}
      subtitle={HEADSET_LABELS[prefs.headsetClicks[i]]}
      onPress={() =>
        showMenu({
          title: `Headset button, ${title.toLowerCase()}`,
          items: HEADSET_ACTIONS.map((action) => ({
            label: HEADSET_LABELS[action],
            selected: prefs.headsetClicks[i] === action,
            onPress: () => setPref('headsetClicks', prefs.headsetClicks.map((a, j) => (j === i ? action : a))),
          })),
        })
      }
    />
  ));
}

function minutesLabel(ms: number): string {
  return ms === 0 ? 'Off' : `${ms / 60_000} min or longer`;
}
function soundSummary(p: Prefs): string {
  const parts = [
    p.playbackRate !== 1 ? `${p.playbackRate}×` : null,
    p.pitchFollowsSpeed ? 'pitch follows speed' : p.pitchSemitones !== 0 ? `pitch ${p.pitchSemitones > 0 ? '+' : ''}${p.pitchSemitones}` : null,
    p.equalizer.enabled ? `equalizer: ${p.equalizer.name || 'custom'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Normal speed, equalizer off';
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
  const [access, requestAccess] = useStorageAccess();

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <Section title="Library">
        <ListRow title={android ? 'Scan music' : 'Import and scan'} subtitle={count == null ? '' : formatCount(count, 'song')} onPress={() => router.push('/settings/scan')} />
        <ChoiceRow
          pref="minDurationMs"
          title="Hide short songs"
          options={MIN_DURATION_CHOICES}
          label={secondsLabel}
          after={() => libraryEvents.emit('changed', undefined)}
        />
        <ListRow title="Hidden songs" onPress={() => router.push('/settings/hidden')} />
        <ListRow title="Excluded folders" onPress={() => router.push('/settings/excluded')} />
        {android ? (
          <ToggleRow
            title="Skip folders with a .nomedia file"
            value={prefs.respectNomedia}
            onChange={(v) => setPref('respectNomedia', v)}
          />
        ) : null}
      </Section>
      <Section title="Appearance">
        <ChoiceRow pref="theme" title="Theme" options={Object.keys(THEMES) as ThemeName[]} label={(t) => THEMES[t]} />
        <ChoiceRow pref="accent" title="Accent color" options={availableAccents()} label={(a) => ACCENTS[a].label} />
        <ChoiceRow
          pref="playerLayout"
          title="Player layout"
          options={Object.keys(LAYOUTS) as Prefs['playerLayout'][]}
          label={(l) => LAYOUTS[l]}
        />
        <ToggleRow title="Blurred artwork behind the player" value={prefs.blurBackground} onChange={(v) => setPref('blurBackground', v)} />
        <ListRow
          title="Player shortcuts"
          subtitle={prefs.playerShortcuts.length ? prefs.playerShortcuts.map((k) => SHORTCUTS[k].label).join(', ') : 'None, all in the menu'}
          onPress={() => router.push('/settings/shortcuts')}
        />
        <ChoiceRow pref="density" title="List density" options={Object.keys(DENSITIES) as Prefs['density'][]} label={(d) => DENSITIES[d]} />
        <ListRow title="Tabs and library views" subtitle="Choose which show, and in what order" onPress={() => router.push('/settings/tabs')} />
      </Section>
      <Section title="Playback">
        <ListRow
          title="Speed, pitch and equalizer"
          subtitle={soundSummary(prefs)}
          onPress={() => router.push('/sound')}
        />
        <ChoiceRow
          pref="crossfadeMs"
          title="Crossfade"
          options={CROSSFADE_CHOICES}
          label={(ms) => (ms === 0 ? 'Off' : `${ms / 1000} seconds`)}
        />
        <ToggleRow title="Gapless playback" value={prefs.gapless} onChange={(v) => setPref('gapless', v)} />
        {android ? (
          <ToggleRow title="Skip silence" value={prefs.skipSilence} onChange={(v) => setPref('skipSilence', v)} />
        ) : null}
        <ChoiceRow
          pref="replayGain"
          title="ReplayGain"
          options={Object.keys(REPLAY_GAIN) as Prefs['replayGain'][]}
          label={(m) => REPLAY_GAIN[m]}
        />
        {prefs.replayGain !== 'off' ? (
          <ChoiceRow
            pref="replayGainPreampDb"
            title="ReplayGain pre-amp"
            options={RG_PREAMP_CHOICES}
            label={(db) => (db === 0 ? '0 dB' : `${db > 0 ? '+' : '−'}${Math.abs(db)} dB`)}
          />
        ) : null}
        <ToggleRow title="Volume slider in the player" value={prefs.showVolume} onChange={(v) => setPref('showVolume', v)} />
        <ToggleRow
          title="Resume when headphones reconnect"
          value={prefs.resumeOnConnect}
          onChange={(v) => setPref('resumeOnConnect', v)}
        />
        <ChoiceRow pref="skipSeconds" title="Skip back and forward" options={SKIP_CHOICES} label={(s) => `${s} seconds`} />
        {android ? (
          <>
            <Note>Headset and Bluetooth button</Note>
            <HeadsetRows />
          </>
        ) : null}
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
        <ListRow title="Backup and restore" subtitle="Playlists, queues, play counts, settings" onPress={() => router.push('/settings/backup')} />
      </Section>
      <Section title="Help">
        <ListRow title="Welcome tour" subtitle="What Melodify does, and how to add music" onPress={() => void openOnboarding()} />
      </Section>
      <Section title="Audio engine">
        <Note>
          {engineInfo.kind === 'native'
            ? `melodify-audio ${engineInfo.version} (${engineInfo.implementation})`
            : `Fake engine: melodify-audio is not in this build, so nothing will play. Install a newer ${android ? 'APK' : 'IPA'}.`}
        </Note>
        {engineInfo.reason ? <Note>{engineInfo.reason}</Note> : null}
      </Section>
      <Section title="Storage">
        <Note>Music folder: {musicRootLabel()}</Note>
        {android ? (
          <>
            <ListRow
              title="Access to your music"
              subtitle={ACCESS_LABELS[access]}
              onPress={access === 'full' ? undefined : () => void requestAccess('full')}
            />
            <Note>
              Melodify reads your music where it already is: every folder in the phone’s storage except Android/ and
              hidden ones. Copy songs over USB or with any file manager, then scan. Backups go to Melodify/Backups.
            </Note>
          </>
        ) : (
          <Note>
            Copy music into the folder above, over USB with ifuse or through the Files app. A LiveContainer install
            nests it inside LiveContainer’s own container; see the README.
          </Note>
        )}
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
}));
