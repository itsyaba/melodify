import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { planRestore, readBackup, restoreBackup, type LoadedBackup } from '@/backup';
import { summarize } from '@/backup/format';
import type { MatchResult, PathRule } from '@/backup/match';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { confirm, promptText, showMenu } from '@/components/menus';
import { Note, Section } from '@/components/settings-rows';
import { toast } from '@/components/toast';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatCount, formatDate } from '@/utils/format';

/** Enough to see where the missing songs were; the counts cover the rest. */
const FOLDER_LIMIT = 30;

function folderLabel(folder: string): string {
  return folder === '' ? 'the top of the music folder' : folder;
}

/**
 * A backup, what restoring it would bring back, and how many of its songs were found in the
 * library as it is now. Folders whose songs were not found can be pointed at their new place,
 * which runs the matching again before anything is written. Musicolet's backups restore here
 * too; their songs are found the same way, from the paths they had on the Android phone.
 */
export function RestoreScreen({ uri, name }: { uri: string; name: string }) {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<PathRule[]>([]);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readBackup(uri).then(
      (b) => !cancelled && setLoaded(b),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    // The old match belongs to the old rules; nothing may be restored with it meanwhile.
    setMatch(null);
    planRestore(db, loaded.backup, rules).then(
      (m) => !cancelled && setMatch(m),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [db, loaded, rules]);

  if (error) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={[type.headline, { color: colors.label, textAlign: 'center' }]}>This backup cannot be restored</Text>
        <Text style={[type.subhead, { color: colors.secondaryLabel, textAlign: 'center' }]}>{error}</Text>
      </View>
    );
  }
  if (!loaded || !match) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  const { backup } = loaded;
  const fromMusicolet = loaded.from === 'musicolet';
  const summary = summarize(backup);
  const found = match.exact + match.remapped + match.byTags;

  const pointFolder = async (folder: string) => {
    const to = await promptText(`Where is ${folderLabel(folder)} now?`, {
      message: 'Type its path inside the music folder, as the Folders tab shows it. Leave it empty for the top level.',
      defaultValue: folder,
      ok: 'Look there',
    });
    if (to === null) return;
    setRules((r) => [...r.filter((x) => x.from !== folder), { from: folder, to: to.replace(/^\/+|\/+$/g, '') }]);
  };

  const restore = async () => {
    const ok = await confirm(
      'Restore this backup?',
      fromMusicolet
        ? `Your playlists, queues, bookmarks, excluded folders and recent searches are replaced with Musicolet’s, and play counts and favorites go back on ${formatCount(found, 'song')}. Melodify’s own settings stay. What is there now is saved as a backup first. Playback stops.`
        : `Your playlists, queues, bookmarks and settings are replaced with the backup’s, and play counts and favorites go back on ${formatCount(found, 'song')}. What is there now is saved as a backup first. Playback stops.`,
      'Restore',
    );
    if (!ok) return;
    setRestoring(true);
    try {
      const counts = await restoreBackup(db, loaded, match, rules, uri);
      toast.show(
        `Restored ${formatCount(counts.playlists, 'playlist')}, ${formatCount(counts.queues, 'queue')} and ${formatCount(counts.bookmarks, 'bookmark')}`,
      );
      router.back();
    } catch (err) {
      setRestoring(false);
      toast.show(`Restoring failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <Text style={[type.title, { color: colors.label, textAlign: 'center' }]}>{formatDate(backup.createdAt)}</Text>
        <Text style={[type.footnote, { color: colors.secondaryLabel, textAlign: 'center' }]}>
          {fromMusicolet ? `Musicolet backup · ${name}` : name}
        </Text>
      </View>

      <Section title="In this backup">
        <Line label="Songs" value={summary.songs} />
        <Line label="Favorites" value={summary.favorites} />
        <Line label="Songs with plays" value={summary.played} />
        <Line label="Playlists" value={summary.playlists} />
        <Line label="Queues" value={summary.queues} />
        {fromMusicolet ? null : <Line label="Bookmarks" value={summary.bookmarks} />}
      </Section>

      <Section title={`Found ${found} of ${formatCount(summary.songs, 'song')}`}>
        <Line label="Where they were" value={match.exact} />
        {match.remapped ? <Line label="In a folder that moved" value={match.remapped} /> : null}
        {match.byTags ? <Line label="By title, artist and length" value={match.byTags} /> : null}
        <Line label="Not found" value={match.missing} />
      </Section>

      {rules.length ? (
        <Section title="Folders you pointed" footer="Tap one to take it back out.">
          {rules.map((r) => (
            <ListRow
              key={r.from}
              title={`${folderLabel(r.from)} → ${folderLabel(r.to)}`}
              trailing={null}
              onPress={() => setRules((all) => all.filter((x) => x !== r))}
            />
          ))}
        </Section>
      ) : null}

      {match.rules.length ? (
        <Section title="Folders that moved">
          {match.rules.map((r) => (
            <ListRow
              key={`${r.from}\u0000${r.to}`}
              title={`${folderLabel(r.from)} → ${folderLabel(r.to)}`}
              subtitle={formatCount(r.songs, 'song')}
              leading={<IconTile name="arrow.right.doc.on.clipboard" />}
              trailing={null}
            />
          ))}
        </Section>
      ) : null}

      {match.missingFolders.length ? (
        <Section
          title="Not found"
          footer="Songs that are not found drop out of the playlists and queues they were in. If a folder moved, tap it and say where it is now."
        >
          {match.missingFolders.slice(0, FOLDER_LIMIT).map((f) => (
            <ListRow
              key={f.folder}
              title={f.folder || 'Top level'}
              subtitle={formatCount(f.count, 'song')}
              leading={<IconTile name="questionmark.folder" />}
              onPress={() =>
                showMenu({
                  title: f.folder || 'Top level',
                  items: [{ label: 'Point to where it is now…', onPress: () => void pointFolder(f.folder) }],
                })
              }
            />
          ))}
          {match.missingFolders.length > FOLDER_LIMIT ? (
            <Note>And {formatCount(match.missingFolders.length - FOLDER_LIMIT, 'more folder')}.</Note>
          ) : null}
        </Section>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          disabled={restoring}
          onPress={() => void restore()}
          style={({ pressed }) => [styles.button, (pressed || restoring) && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          {restoring ? (
            <ActivityIndicator color={colors.onTint} />
          ) : (
            <Text style={[type.headline, { color: colors.onTint }]}>Restore</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[type.body, { color: colors.label }]}>{label}</Text>
      <Text style={[type.body, { color: colors.secondaryLabel }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.xs },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  footer: { padding: spacing.xl },
  button: { backgroundColor: colors.tint, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
}));
