import { Platform, ScrollView } from 'react-native';
import { ListRow } from '@/components/list-row';
import { showMenu } from '@/components/menus';
import { ChoiceRow, Section, ToggleRow } from '@/components/settings-rows';
import { HEADSET_ACTIONS, setPref, usePrefs, type HeadsetAction, type Prefs } from '@/prefs';
import { makeStyles, spacing } from '@/theme';
import { canLockOrientation } from '@/utils/device';

const SKIP_CHOICES = [5, 10, 15, 30, 45, 60];
const RESUME_CHOICES = [0, 5, 10, 20, 30, 60].map((m) => m * 60_000);
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

/** How songs play one after another, and what the player and headphones do. */
export function PlaybackSettingsScreen() {
  const styles = useStyles();
  const prefs = usePrefs();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Section title="Between songs">
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
      </Section>

      <Section title="Volume" footer="ReplayGain evens out loudness using the tags in your files.">
        <ChoiceRow
          pref="replayGain"
          title="ReplayGain"
          options={Object.keys(REPLAY_GAIN) as Prefs['replayGain'][]}
          label={(m) => REPLAY_GAIN[m]}
        />
        {prefs.replayGain !== 'off' ? (
          <ChoiceRow
            pref="replayGainPreampDb"
            title="Pre-amp"
            options={RG_PREAMP_CHOICES}
            label={(db) => (db === 0 ? '0 dB' : `${db > 0 ? '+' : '−'}${Math.abs(db)} dB`)}
          />
        ) : null}
        <ToggleRow title="Volume slider in the player" value={prefs.showVolume} onChange={(v) => setPref('showVolume', v)} />
      </Section>

      <Section title="Controls">
        <ChoiceRow pref="skipSeconds" title="Skip back and forward" options={SKIP_CHOICES} label={(s) => `${s} seconds`} />
        <ChoiceRow pref="resumeMinMs" title="Remember position in long songs" options={RESUME_CHOICES} label={minutesLabel} />
        <ToggleRow title="Fade out before the sleep timer stops" value={prefs.sleepFade} onChange={(v) => setPref('sleepFade', v)} />
      </Section>

      <Section title="Headphones">
        <ToggleRow
          title="Resume when they reconnect"
          value={prefs.resumeOnConnect}
          onChange={(v) => setPref('resumeOnConnect', v)}
        />
        {android ? <HeadsetRows /> : null}
      </Section>

      <Section title="Screen">
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
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
}));
