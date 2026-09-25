import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { confirm } from '@/components/menus';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { canReadTags } from '@/scan/read-tags';
import { scanLibrary, tagCoverage } from '@/scan/scanner';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { libraryEvents, type ScanProgress } from '@/utils/events';

export function ScanScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const running = progress != null && progress.phase !== 'done' && progress.phase !== 'error';

  useEffect(() => libraryEvents.on('scanProgress', setProgress), []);
  const { data: coverage } = useLibraryQuery(tagCoverage);

  const rereadAll = async () => {
    const ok = await confirm(
      'Read every song’s tags again?',
      'Scans the folder, then reads the tags and artwork of every song, not only new and changed ones. It takes a while on a big library.',
      'Read again',
    );
    if (ok) void scanLibrary(db, { rereadAll: true });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable
        disabled={running}
        onPress={() => void scanLibrary(db)}
        style={({ pressed }) => [styles.button, (pressed || running) && { opacity: 0.6 }]}
      >
        {running ? <ActivityIndicator color={colors.onTint} /> : <Text style={[type.headline, styles.buttonText]}>Scan now</Text>}
      </Pressable>
      {coverage && coverage.songs > 0 ? (
        <View style={styles.stats}>
          <Line label="Songs" value={String(coverage.songs)} />
          <Line label="Tags not read yet" value={String(coverage.untagged)} />
          <Line label="Without a length" value={String(coverage.noDuration)} />
          <Line label="Without artwork" value={String(coverage.noArt)} />
          {!canReadTags() ? (
            <Text style={[type.footnote, { color: colors.destructive }]}>
              This build has no tag reader, so titles come from file names. Install a newer build.
            </Text>
          ) : null}
        </View>
      ) : null}
      {progress ? (
        <View style={styles.stats}>
          <Line label="Phase" value={progress.phase} />
          <Line label="Files seen" value={String(progress.seen)} />
          <Line label="Added" value={String(progress.added)} />
          <Line label="Updated" value={String(progress.updated)} />
          <Line label="Removed" value={String(progress.removed)} />
          <Line label="Tags read" value={String(progress.tagged)} />
          {progress.tagFailed > 0 ? <Line label="Unreadable tags" value={String(progress.tagFailed)} /> : null}
          {progress.tagError ? <Text style={[type.footnote, { color: colors.secondaryLabel }]}>{progress.tagError}</Text> : null}
          {progress.message ? <Text style={[type.footnote, { color: colors.destructive }]}>{progress.message}</Text> : null}
        </View>
      ) : (
        <Text style={[type.subhead, { color: colors.secondaryLabel, textAlign: 'center' }]}>
          Scanning walks the Melodify folder, adds new files and drops missing ones, then reads the tags and artwork of anything new or changed.
        </Text>
      )}
      {canReadTags() ? (
        <Pressable disabled={running} onPress={() => void rereadAll()} style={({ pressed }) => [styles.secondary, (pressed || running) && { opacity: 0.6 }]}>
          <Text style={[type.body, { color: colors.tint }]}>Read every song’s tags again</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[type.body, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[type.body, { color: colors.label }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xl },
  button: { backgroundColor: colors.tint, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: colors.onTint },
  secondary: { alignItems: 'center', paddingVertical: spacing.sm },
  stats: { gap: spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
}));
