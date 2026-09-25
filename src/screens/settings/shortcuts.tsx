import { ScrollView } from 'react-native';
import { OrderedToggles } from '@/components/ordered-toggles';
import { ALL_PLAYER_SHORTCUTS, setPref, usePrefs, type PlayerShortcut } from '@/prefs';
import { SHORTCUTS } from '@/screens/player/shortcuts';
import { makeStyles } from '@/theme';

const LABELS = Object.fromEntries(ALL_PLAYER_SHORTCUTS.map((k) => [k, SHORTCUTS[k].label])) as Record<PlayerShortcut, string>;

/** Which quick-access buttons sit under the player's controls, and in what order. */
export function ShortcutsSettingsScreen() {
  const styles = useStyles();
  const prefs = usePrefs();
  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <OrderedToggles
        title="Player shortcuts"
        footer="A row of buttons under the player's controls: three to start with, and six still fit. Whatever is switched off here is at the top of the player's ••• menu."
        all={ALL_PLAYER_SHORTCUTS}
        shown={prefs.playerShortcuts}
        required={[]}
        labels={LABELS}
        onChange={(shortcuts) => setPref('playerShortcuts', shortcuts)}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
}));
