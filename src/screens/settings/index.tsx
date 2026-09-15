import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Paths } from 'expo-file-system';
import { ListRow } from '@/components/list-row';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { colors, spacing, type } from '@/theme';
import { formatCount } from '@/utils/format';

export function SettingsScreen() {
  const router = useRouter();
  const { data: count } = useLibraryQuery(countTracks);
  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <Section title="Library">
        <ListRow title="Scan library" subtitle={count == null ? '' : formatCount(count, 'song')} onPress={() => router.push('/scan')} />
      </Section>
      <Section title="Storage">
        <Text style={[type.footnote, styles.note]}>Music folder: {decodeURIComponent(Paths.document.uri)}</Text>
        <Text style={[type.footnote, styles.note]}>
          Copy music here over USB (ifuse --documents dev.yeab.melodify) or through the Files app.
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
