import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { confirm } from '@/components/menus';
import { toast } from '@/components/toast';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { importFolder, importSongs, isImporting, lastImport, stopImport } from '@/scan/import';
import { IMPORT_DIR, importSummary } from '@/scan/import-plan';
import { canReadTags } from '@/scan/read-tags';
import { scanLibrary, tagCoverage } from '@/scan/scanner';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { libraryEvents, type ImportProgress, type ScanProgress } from '@/utils/events';
import { isLiveContainerGuest } from '@/utils/quick-actions';

export function ScanScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [imported, setImported] = useState<ImportProgress | null>(lastImport);
  const running = progress != null && progress.phase !== 'done' && progress.phase !== 'error';
  const importing = isImporting(imported);
  const busy = running || importing;

  useEffect(() => libraryEvents.on('scanProgress', setProgress), []);
  useEffect(() => libraryEvents.on('importProgress', setImported), []);
  const { data: coverage } = useLibraryQuery(tagCoverage);

  const rereadAll = async () => {
    const ok = await confirm(
      'Read every song’s tags again?',
      'Scans the folder, then reads the tags and artwork of every song, not only new and changed ones. It takes a while on a big library.',
      'Read again',
    );
    if (ok) void scanLibrary(db, { rereadAll: true });
  };

  // The toast comes up even when the screen was left while the import ran.
  const runImport = async (job: typeof importSongs) => {
    try {
      const result = await job(db);
      if (result) toast.show(importSummary(result));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.imports}>
        <Pressable
          disabled={busy}
          onPress={() => void runImport(importFolder)}
          style={({ pressed }) => [styles.import, (pressed || busy) && { opacity: 0.6 }]}
        >
          <Text style={[type.headline, { color: colors.tint }]}>Import a folder</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => void runImport(importSongs)}
          style={({ pressed }) => [styles.import, (pressed || busy) && { opacity: 0.6 }]}
        >
          <Text style={[type.headline, { color: colors.tint }]}>Import songs</Text>
        </Pressable>
      </View>
      {isLiveContainerGuest() ? (
        <Text style={[type.footnote, { color: colors.secondaryLabel, textAlign: 'center' }]}>
          In LiveContainer, the picker’s Open button does nothing until Fix File Picker is on for Melodify: hold
          its card in LiveContainer, then Settings › Fixes. Use Fix File Picker, not the legacy one, which cannot
          open folders.
        </Text>
      ) : null}
      {imported ? (
        <ImportStatus progress={imported} />
      ) : (
        <Text style={[type.footnote, { color: colors.secondaryLabel, textAlign: 'center' }]}>
          Copies music in from the Files app: On My iPhone, iCloud Drive, a USB drive or a server. A folder keeps
          its subfolders, and importing it again copies only what is new. Download an iCloud Drive folder in Files
          first.
        </Text>
      )}
      <Pressable
        disabled={busy}
        onPress={() => void scanLibrary(db)}
        style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}
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
        <Pressable disabled={busy} onPress={() => void rereadAll()} style={({ pressed }) => [styles.secondary, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={[type.body, { color: colors.tint }]}>Read every song’s tags again</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function ImportStatus({ progress: p }: { progress: ImportProgress }) {
  const styles = useStyles();
  const colors = useTheme();
  const cloudHint = p.notDownloaded ? (
    <Text style={[type.footnote, { color: colors.secondaryLabel }]}>
      Download the folder in the Files app, then import it again to add the rest.
    </Text>
  ) : null;

  if (!isImporting(p)) {
    const summary = importSummary(p);
    return (
      <View style={styles.stats}>
        <Text style={[type.headline, { color: p.phase === 'error' ? colors.destructive : colors.label }]}>{summary}</Text>
        {p.message && p.message !== summary ? (
          <Text style={[type.footnote, { color: colors.destructive }]}>{p.message}</Text>
        ) : null}
        {cloudHint}
      </View>
    );
  }

  const what = p.folder === IMPORT_DIR ? 'songs' : p.folder;
  return (
    <View style={styles.stats}>
      <View style={styles.line}>
        <Text style={[type.headline, { color: colors.label, flexShrink: 1 }]}>
          {p.phase === 'finding' ? `Looking through ${what}…` : `Importing ${what}`}
        </Text>
        <ActivityIndicator color={colors.secondaryLabel} />
      </View>
      {p.phase === 'copying' ? <Line label="Copied" value={`${p.copied} of ${p.total}`} /> : null}
      {p.skipped ? <Line label="Already imported" value={String(p.skipped)} /> : null}
      {p.notDownloaded ? <Line label="Not downloaded from iCloud" value={String(p.notDownloaded)} /> : null}
      {p.unsupported ? <Line label="Not playable" value={String(p.unsupported)} /> : null}
      {p.failed ? <Line label="Failed" value={String(p.failed)} /> : null}
      {p.current ? (
        <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>{p.current}</Text>
      ) : null}
      {p.message ? <Text style={[type.footnote, { color: colors.destructive }]}>{p.message}</Text> : null}
      {cloudHint}
      {p.phase === 'copying' ? (
        <Pressable onPress={stopImport} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}>
          <Text style={[type.body, { color: colors.destructive }]}>Stop importing</Text>
        </Pressable>
      ) : null}
    </View>
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
  imports: { flexDirection: 'row', gap: spacing.md },
  import: { flex: 1, backgroundColor: colors.fill, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  secondary: { alignItems: 'center', paddingVertical: spacing.sm },
  stats: { gap: spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
}));
