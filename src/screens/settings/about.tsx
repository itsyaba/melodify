import { Platform, ScrollView } from 'react-native';
import { Note, Section } from '@/components/settings-rows';
import { engineInfo } from '@/player';
import { musicRootLabel } from '@/storage';
import { makeStyles, spacing } from '@/theme';
import { versionLabel } from '@/utils/updates';

/** Which build this is, which engine plays, and where the music lives. */
export function AboutSettingsScreen() {
  const styles = useStyles();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Section title="Version">
        <Note>{versionLabel()}</Note>
      </Section>
      <Section title="Audio engine">
        <Note>
          {engineInfo.kind === 'native'
            ? `melodify-audio ${engineInfo.version} (${engineInfo.implementation})`
            : `Fake engine: melodify-audio is not in this build, so nothing will play. Install a newer ${Platform.OS === 'android' ? 'APK' : 'IPA'}.`}
        </Note>
        {engineInfo.reason ? <Note>{engineInfo.reason}</Note> : null}
      </Section>
      <Section title="Music folder" footer="Your music and play history stay on this phone.">
        <Note>{musicRootLabel()}</Note>
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
}));
