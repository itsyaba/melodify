import { useCallback, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  BACKUP_DIR,
  deleteBackup,
  exportAllPlaylists,
  findPlaylistFiles,
  importPlaylistFile,
  listBackups,
  PLAYLIST_DIR,
  pickFile,
  shareFile,
  writeBackup,
  type BackupFile,
  type PlaylistFile,
} from '@/backup';
import { playlistNameFromFile } from '@/backup/m3u';
import type { BackupReason } from '@/backup/format';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { confirm, showMenu } from '@/components/menus';
import { ChoiceRow, Section } from '@/components/settings-rows';
import { toast } from '@/components/toast';
import { listPlaylists } from '@/db/playlists';
import type { AutoBackup } from '@/prefs';
import { makeStyles } from '@/theme';
import { formatBytes, formatCount, formatDate } from '@/utils/format';

const AUTO: Record<AutoBackup, string> = { off: 'Off', daily: 'Once a day', weekly: 'Once a week' };
const REASON: Record<BackupReason, string> = {
  manual: 'Backup',
  auto: 'Automatic backup',
  'before-restore': 'Saved before a restore',
};
/** Past this many, the import sheet would scroll off the screen; the picker covers the rest. */
const SHEET_LIMIT = 12;

export function BackupScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const router = useRouter();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  // A ref, not state: the sheets' items are closures from an earlier render.
  const busy = useRef(false);
  const refresh = useCallback(() => {
    try {
      setBackups(listBackups());
    } catch (err) {
      console.warn('[melodify] listing backups failed:', err);
    }
  }, []);
  useFocusEffect(refresh);

  /** Runs one thing at a time and turns a failure into a toast. */
  const task = (fn: () => Promise<void>) => async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    } finally {
      busy.current = false;
      refresh();
    }
  };

  const backUp = task(async () => {
    const file = await writeBackup(db, 'manual');
    toast.show(`Saved ${file.name}`, { label: 'Share', onPress: () => void shareFile(file.uri) });
  });

  const openRestore = (uri: string, name: string) =>
    router.push({ pathname: '/restore', params: { uri, name } });

  const backupMenu = (file: BackupFile) =>
    showMenu({
      title: file.name,
      items: [
        { label: 'Restore…', onPress: () => openRestore(file.uri, file.name) },
        { label: 'Share…', onPress: () => void shareFile(file.uri) },
        {
          label: 'Delete',
          destructive: true,
          onPress: async () => {
            if (!(await confirm(`Delete ${file.name}?`, undefined, 'Delete'))) return;
            deleteBackup(file.uri);
            refresh();
          },
        },
      ],
    });

  const chooseBackup = task(async () => {
    const picked = await pickFile('backup');
    if (picked) openRestore(picked.uri, picked.name);
  });

  const exportAll = task(async () => {
    const n = await exportAllPlaylists(db);
    toast.show(n ? `Exported ${formatCount(n, 'playlist')} to ${PLAYLIST_DIR}` : 'There are no playlists to export');
  });

  /** Not wrapped in `task` itself: the picker path calls it from inside one. */
  const doImport = async (file: PlaylistFile) => {
    const name = playlistNameFromFile(file.name);
    const exists = (await listPlaylists(db, 'name')).some((p) => p.name === name);
    const run = async (replace: boolean) => {
      const result = await importPlaylistFile(db, file, { replace });
      toast.show(
        result.found === result.total
          ? `Imported ${result.name}, ${formatCount(result.found, 'song')}`
          : `Imported ${result.name}: found ${result.found} of ${formatCount(result.total, 'song')}`,
        { label: 'Open', onPress: () => router.push({ pathname: '/playlist/[id]', params: { id: String(result.id) } }) },
      );
    };
    if (!exists) return run(false);
    showMenu({
      title: `There is already a playlist called ${name}`,
      items: [
        { label: 'Replace its songs', destructive: true, onPress: () => void task(() => run(true))() },
        { label: 'Keep both', onPress: () => void task(() => run(false))() },
      ],
    });
  };

  const importMenu = task(async () => {
    const files = findPlaylistFiles();
    const pickOther = {
      label: 'Choose a file…',
      onPress: () =>
        void task(async () => {
          const picked = await pickFile('playlist');
          if (picked) await doImport({ ...picked, folder: '' });
        })(),
    };
    showMenu({
      title: files.length ? 'Import a playlist' : 'No playlist files in the music folder',
      message: files.length > SHEET_LIMIT ? `Showing the first ${SHEET_LIMIT} of ${files.length}.` : undefined,
      items: [
        ...files.slice(0, SHEET_LIMIT).map((f) => ({
          label: f.folder ? `${f.name} (${f.folder})` : f.name,
          onPress: () => void task(() => doImport(f))(),
        })),
        pickOther,
      ],
    });
  });

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <Section
        title="Back up"
        footer={`Backups go to ${BACKUP_DIR} in the music folder: playlists, queues, bookmarks, favorites, play counts, hidden songs, excluded folders and settings. The music itself is not copied.`}
      >
        <ListRow title="Back up now" tinted trailing={null} onPress={() => void backUp()} />
        <ChoiceRow
          pref="autoBackup"
          title="Automatic backups"
          options={Object.keys(AUTO) as AutoBackup[]}
          label={(v) => (v === 'off' ? AUTO.off : `${AUTO[v]}, keeping the last 5`)}
        />
      </Section>
      <Section
        title="Restore"
        footer="Restoring replaces playlists, queues, bookmarks and settings, and puts play counts and favorites back on the songs it finds. Songs whose folders moved are found by name. The current state is saved first."
      >
        {backups.map((b) => (
          <ListRow
            key={b.uri}
            title={formatDate(b.modified)}
            subtitle={`${REASON[b.reason]} · ${formatBytes(b.size)}`}
            leading={<IconTile name={b.reason === 'auto' ? 'clock.arrow.circlepath' : 'externaldrive'} />}
            onPress={() => openRestore(b.uri, b.name)}
            onLongPress={() => backupMenu(b)}
          />
        ))}
        <ListRow title="Choose a backup file…" tinted trailing={null} onPress={() => void chooseBackup()} />
      </Section>
      <Section
        title="Playlists as M3U"
        footer={`Exported playlists go to ${PLAYLIST_DIR}, with paths relative to it, so they keep working when the folder is copied to a computer. Importing finds songs by path, or by folder and file name when the paths came from somewhere else.`}
      >
        <ListRow title="Export all playlists" tinted trailing={null} onPress={() => void exportAll()} />
        <ListRow title="Import a playlist file…" tinted trailing={null} onPress={() => void importMenu()} />
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
}));
