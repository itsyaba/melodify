import { AppState, Share } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createPlaylist, listPlaylists, listPlaylistTracks, setPlaylistTracks } from '@/db/playlists';
import { serial } from '@/db/serial';
import { getSetting, setSetting } from '@/db/settings';
import { forgetStoredChoices } from '@/hooks/use-stored-choice';
import { detachQueues, reloadQueues } from '@/player/queue-store';
import { getPrefs, loadPrefs } from '@/prefs';
import { libraryEvents } from '@/utils/events';
import { collectBackupSource, listLibraryForMatching, writeRestore, type RestoreCounts } from './db';
import { buildBackup, parseBackup, type Backup, type BackupReason } from './format';
import { fileNameForPlaylist, formatM3u, parseM3u, PathIndex, playlistNameFromFile, resolveEntry } from './m3u';
import { matchTracks, type MatchResult, type PathRule } from './match';

/**
 * Backups and exported playlists live in the music folder itself, under `Melodify/`, so they
 * come off the phone with the music (ifuse, the Files app) and survive reinstalling the app.
 * The scanner walks that folder too, but finds nothing in it that it indexes.
 */
export const BACKUP_DIR = 'Melodify/Backups';
export const PLAYLIST_DIR = 'Melodify/Playlists';

/** Automatic backups kept, and safety copies made before a restore; older ones are deleted. */
const KEEP = 5;
const PREFIX: Record<BackupReason, string> = { manual: 'melodify-', auto: 'auto-', 'before-restore': 'before-restore-' };
const INTERVAL_MS = { daily: 24 * 60 * 60_000, weekly: 7 * 24 * 60 * 60_000 } as const;

function folder(relative: string): Directory {
  const dir = new Directory(Paths.document, ...relative.split('/'));
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Local time, to the second, in a form that sorts and is safe in a file name. */
function stamp(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

function writeText(file: File, text: string) {
  if (!file.exists) file.create({ intermediates: true });
  file.write(text);
}

export interface BackupFile {
  uri: string;
  name: string;
  size: number;
  modified: number;
  reason: BackupReason;
}

function reasonOf(name: string): BackupReason {
  if (name.startsWith(PREFIX.auto)) return 'auto';
  if (name.startsWith(PREFIX['before-restore'])) return 'before-restore';
  return 'manual';
}

/**
 * Writes a backup of the library as it is now. Goes through `serial`, so pending queue saves land
 * first. Automatic and before-restore backups beyond the last few are deleted, except `keep`.
 */
export async function writeBackup(db: SQLiteDatabase, reason: BackupReason, keep?: string): Promise<BackupFile> {
  const source = await serial(() => collectBackupSource(db));
  const backup = buildBackup(source, reason);
  const name = `${PREFIX[reason]}${stamp(backup.createdAt)}.json`;
  const file = new File(folder(BACKUP_DIR), name);
  writeText(file, JSON.stringify(backup));
  if (reason !== 'manual') prune(reason, keep);
  return { uri: file.uri, name, size: file.size, modified: backup.createdAt, reason };
}

/** Newest first. */
export function listBackups(): BackupFile[] {
  const dir = new Directory(Paths.document, ...BACKUP_DIR.split('/'));
  if (!dir.exists) return [];
  return dir
    .list()
    .flatMap((entry) =>
      entry instanceof File && entry.name.toLowerCase().endsWith('.json')
        ? [{ uri: entry.uri, name: entry.name, size: entry.size, modified: entry.modificationTime ?? 0, reason: reasonOf(entry.name) }]
        : [],
    )
    .sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
}

function prune(reason: BackupReason, keep?: string) {
  for (const old of listBackups().filter((b) => b.reason === reason && b.uri !== keep).slice(KEEP)) {
    try {
      new File(old.uri).delete();
    } catch (err) {
      console.warn('[melodify] removing an old backup failed:', old.name, err);
    }
  }
}

export function deleteBackup(uri: string): void {
  new File(uri).delete();
}

export async function shareFile(uri: string): Promise<void> {
  await Share.share({ url: uri });
}

/** Reads and checks a backup file. Throws `BackupError` with a message fit to show. */
export async function readBackup(uri: string): Promise<Backup> {
  return parseBackup(await new File(uri).text());
}

/** Lets the user pick a file from anywhere the Files app can see. Null when cancelled. */
export async function pickFile(kind: 'backup' | 'playlist'): Promise<{ uri: string; name: string } | null> {
  // Unknown types are dropped by the picker; M3U is registered under several, and as plain text.
  const mimeTypes =
    kind === 'backup'
      ? ['application/json']
      : ['audio/x-mpegurl', 'audio/mpegurl', 'application/vnd.apple.mpegurl', 'application/x-mpegurl', 'text/*'];
  const picked = await File.pickFileAsync({ mimeTypes });
  if (picked.canceled) return null;
  return { uri: picked.result.uri, name: picked.result.name };
}

export async function planRestore(db: SQLiteDatabase, backup: Backup, rules: PathRule[]): Promise<MatchResult> {
  return matchTracks(backup.tracks, await listLibraryForMatching(db), rules);
}

/**
 * Restores `backup`, after saving the current state as a before-restore backup so the restore
 * itself can be undone by restoring that. Afterwards the preferences, queues and every list are
 * reloaded from the database, as at launch, and playback is stopped.
 */
export async function restoreBackup(
  db: SQLiteDatabase,
  backup: Backup,
  match: MatchResult,
  rules: PathRule[],
  sourceUri?: string,
): Promise<RestoreCounts> {
  // The file being restored may itself be an old safety copy; the new one must not prune it.
  await writeBackup(db, 'before-restore', sourceUri);
  // Nothing from the old queues may be saved over the restored ones, before or after the write.
  await detachQueues();
  try {
    return await serial(() => writeRestore(db, backup, match.ids, [...rules, ...match.rules]));
  } finally {
    await loadPrefs(db);
    forgetStoredChoices();
    await reloadQueues(db);
    libraryEvents.emit('changed', undefined);
  }
}

let autoRunning = false;

/** Writes an automatic backup when one is due. Silent: a failure is logged, never shown. */
export async function maybeAutoBackup(db: SQLiteDatabase): Promise<void> {
  const mode = getPrefs().autoBackup;
  if (mode === 'off' || autoRunning) return;
  autoRunning = true;
  try {
    const last = (await getSetting(db, 'lastAutoBackupAt')) ?? 0;
    if (Date.now() - last < INTERVAL_MS[mode]) return;
    // A fresh install with nothing scanned has nothing worth keeping.
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tracks');
    if (!row?.n) return;
    await writeBackup(db, 'auto');
    await setSetting(db, 'lastAutoBackupAt', Date.now());
  } catch (err) {
    console.warn('[melodify] automatic backup failed:', err);
  } finally {
    autoRunning = false;
  }
}

/**
 * At launch, and whenever the app goes to the background: a player can stay alive for days
 * without relaunching, and leaving the app is the last dependable moment before iOS may end it.
 */
export function startAutoBackup(db: SQLiteDatabase): void {
  void maybeAutoBackup(db);
  AppState.addEventListener('change', (next) => {
    if (next === 'background') void maybeAutoBackup(db);
  });
}

// Playlists as M3U.

/** Writes one playlist to `Melodify/Playlists/<name>.m3u8`: its path relative to Documents/, and its URI. */
export async function exportPlaylist(db: SQLiteDatabase, id: number, name: string): Promise<{ path: string; uri: string }> {
  const tracks = await listPlaylistTracks(db, id);
  const fileName = fileNameForPlaylist(name);
  const text = formatM3u(
    tracks.map((t) => ({ path: t.path, title: t.title, artist: t.artist, durationMs: t.duration_ms })),
    PLAYLIST_DIR,
  );
  const file = new File(folder(PLAYLIST_DIR), fileName);
  writeText(file, text);
  return { path: `${PLAYLIST_DIR}/${fileName}`, uri: file.uri };
}

/** Every playlist; two with the same file name overwrite, so the later gets a number. */
export async function exportAllPlaylists(db: SQLiteDatabase): Promise<number> {
  const playlists = await listPlaylists(db, 'name');
  const used = new Set<string>();
  for (const p of playlists) {
    let name = p.name;
    for (let n = 2; used.has(fileNameForPlaylist(name).toLowerCase()); n += 1) name = `${p.name} ${n}`;
    used.add(fileNameForPlaylist(name).toLowerCase());
    await exportPlaylist(db, p.id, name);
  }
  return playlists.length;
}

export interface PlaylistFile {
  uri: string;
  name: string;
  /** Folder relative to Documents/, which relative entries are resolved against. */
  folder: string;
}

/** Every .m3u / .m3u8 in the music folder, outside dot-folders, by name. */
export function findPlaylistFiles(): PlaylistFile[] {
  const found: PlaylistFile[] = [];
  const stack: { dir: Directory; rel: string }[] = [{ dir: Paths.document, rel: '' }];
  while (stack.length) {
    const { dir, rel } = stack.pop()!;
    let entries: (Directory | File)[];
    try {
      entries = dir.list();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry instanceof Directory) {
        if (!entry.name.startsWith('.')) stack.push({ dir: entry, rel: rel ? `${rel}/${entry.name}` : entry.name });
      } else if (/\.m3u8?$/i.test(entry.name)) {
        found.push({ uri: entry.uri, name: entry.name, folder: rel });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export interface ImportResult {
  id: number;
  name: string;
  found: number;
  total: number;
}

/**
 * Makes a playlist from an M3U file, or replaces the songs of the playlist called `name` when
 * `replace` is set. Entries that match no song in the library are left out and counted.
 */
export async function importPlaylistFile(
  db: SQLiteDatabase,
  file: { uri: string; name: string; folder: string },
  opts: { name?: string; replace?: boolean } = {},
): Promise<ImportResult> {
  const entries = parseM3u(await new File(file.uri).text());
  const rows = await db.getAllAsync<{ id: number; path: string }>('SELECT id, path FROM tracks');
  const idByPath = new Map(rows.map((r) => [r.path, r.id]));
  const index = new PathIndex(idByPath.keys());
  const ids = entries.flatMap((e) => {
    const path = resolveEntry(e, file.folder, index);
    const id = path === null ? undefined : idByPath.get(path);
    return id === undefined ? [] : [id];
  });
  const name = opts.name ?? playlistNameFromFile(file.name);
  const existing = opts.replace ? (await listPlaylists(db, 'name')).find((p) => p.name === name) : undefined;
  let id: number;
  if (existing) {
    await setPlaylistTracks(db, existing.id, ids);
    id = existing.id;
  } else {
    id = await createPlaylist(db, name, ids);
  }
  libraryEvents.emit('changed', undefined);
  return { id, name, found: ids.length, total: entries.length };
}
