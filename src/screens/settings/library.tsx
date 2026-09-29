import { Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow } from '@/components/list-row';
import { ChoiceRow, Section, ToggleRow } from '@/components/settings-rows';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { setPref, usePrefs } from '@/prefs';
import { musicRootLabel } from '@/storage';
import { makeStyles, spacing } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { formatCount } from '@/utils/format';
import { useStorageAccess, type StorageAccess } from '@/utils/storage-access';

const MIN_DURATION_CHOICES = [0, 10, 30, 60, 120].map((s) => s * 1000);
const ACCESS_LABELS: Record<StorageAccess, string> = {
  full: 'All files: scan, lyrics files, tag editing and backups',
  read: 'Music only: folder covers, lyrics files, tag editing and backups need all files',
  none: 'None yet: Melodify cannot see your music',
};
const android = Platform.OS === 'android';

function secondsLabel(ms: number): string {
  if (ms === 0) return 'Off';
  return ms < 60_000 ? `Under ${ms / 1000} s` : `Under ${ms / 60_000} min`;
}

/** Where the music comes from, and which of it the library leaves out. */
export function LibrarySettingsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const prefs = usePrefs();
  const { data: count } = useLibraryQuery(countTracks);
  const [access, requestAccess] = useStorageAccess();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Section
        title="Music"
        footer={
          android
            ? `Melodify reads your music where it already is (${musicRootLabel()}): every folder except Android/ and hidden ones. Copy songs over USB or with any file manager, then scan. Backups go to Melodify/Backups.`
            : `Music folder: ${musicRootLabel()}. Copy music into it over USB with ifuse or through the Files app. A LiveContainer install nests it inside LiveContainer’s own container; see the README.`
        }
      >
        <ListRow
          title={android ? 'Scan music' : 'Import and scan'}
          subtitle={count == null ? '' : formatCount(count, 'song')}
          onPress={() => router.push('/settings/scan')}
        />
        {android ? (
          <ListRow
            title="Access to your music"
            subtitle={ACCESS_LABELS[access]}
            trailing={access === 'full' ? null : undefined}
            onPress={access === 'full' ? undefined : () => void requestAccess('full')}
          />
        ) : null}
      </Section>

      <Section title="Filters">
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
            title="Skip .nomedia folders"
            subtitle="Folders with a .nomedia file stay out of the library"
            value={prefs.respectNomedia}
            onChange={(v) => setPref('respectNomedia', v)}
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
