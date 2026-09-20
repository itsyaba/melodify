import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Paths } from 'expo-file-system';
import { ListRow } from '@/components/list-row';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { probeNativeAudio } from '@/player/native-probe';
import { colors, spacing, type } from '@/theme';
import { formatCount } from '@/utils/format';

export function SettingsScreen() {
  const router = useRouter();
  const { data: count } = useLibraryQuery(countTracks);
  const native = probeNativeAudio();
  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <Section title="Library">
        <ListRow title="Scan library" subtitle={count == null ? '' : formatCount(count, 'song')} onPress={() => router.push('/scan')} />
      </Section>
      <Section title="Audio engine">
        <Text style={[type.footnote, styles.note]}>
          {native.linked
            ? `melodify-audio ${native.version} (${native.implementation}) — state: ${native.state}`
            : 'melodify-audio is not in this build. Playback is the fake engine until a newer IPA is installed.'}
        </Text>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
});
