import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { libraryEvents, type ImportProgress } from '@/utils/events';
import { formatBytes } from '@/utils/format';
import { freeName, IMPORT_DIR, importFolderName, importKind, isInside, planFolderImport, type FoundEntry } from './import-plan';
import { scanLibrary } from './scanner';

/**
 * Copying music in from the Files app: On My iPhone, iCloud Drive, a USB drive, a server. Only
 * Melodify's own Documents/ is scanned, so everything picked is copied there, then scanned.
 */

/** What the song picker offers. FLAC is named as well, in case iOS files it outside public.audio. */
const SONG_TYPES = ['audio/*', 'audio/flac', 'audio/x-flac'];
/** Left free after a folder import, so the phone is never filled to the last byte. */
const SPARE_BYTES = 200 * 1024 * 1024;

let latest: ImportProgress | null = null;
let stopRequested = false;

/** The import running now, or the last one, for a screen opened after it started. */
export function lastImport(): ImportProgress | null {
  return latest;
}

export function isImporting(p: ImportProgress | null): boolean {
  return p != null && (p.phase === 'finding' || p.phase === 'copying');
}

/** Stops a running import after the song being copied; what was copied is kept and scanned. */
export function stopImport(): void {
  stopRequested = true;
}

function publish(p: ImportProgress) {
  latest = { ...p };
  libraryEvents.emit('importProgress', latest);
}

function begin(phase: ImportProgress['phase'], folder: string): ImportProgress {
  stopRequested = false;
  return { phase, folder, total: 0, copied: 0, skipped: 0, failed: 0, notDownloaded: 0, unsupported: 0 };
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function fail(p: ImportProgress, name: string, err: unknown) {
  p.failed += 1;
  p.message ??= `${name}: ${reason(err)}`;
  console.warn('[melodify] import failed:', name, err);
}

/** Deletes one of the picker's temporary copies. */
function discard(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // It is in the app's temporary folder, which iOS empties by itself.
  }
}

/** `extras`: covers or lyrics were copied without a song, which a scan still has to pick up. */
async function finish(db: SQLiteDatabase, p: ImportProgress, extras = false): Promise<ImportProgress> {
  p.phase = 'done';
  p.current = undefined;
  publish(p);
  if (p.copied || extras) await scanLibrary(db);
  return p;
}

/**
 * Songs picked in the Files app, into `Imported/`. iOS hands over copies in the app's temporary
 * folder, which are moved there; a song already there under the same name and size is taken for
 * a repeat and dropped. Null when the picker was cancelled or an import is already running.
 */
export async function importSongs(db: SQLiteDatabase): Promise<ImportProgress | null> {
  if (isImporting(latest)) return null;
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: SONG_TYPES });
  if (picked.canceled) return null;

  const songs = picked.result.filter((file) => importKind(file.name) === 'song');
  picked.result.filter((file) => !songs.includes(file)).forEach(discard);
  const p = begin('copying', IMPORT_DIR);
  p.total = songs.length;
  p.unsupported = picked.result.length - songs.length;
  publish(p);
  const dir = new Directory(Paths.document, IMPORT_DIR);
  try {
    if (songs.length && !dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch (err) {
    songs.forEach(discard);
    p.phase = 'error';
    p.message = `Could not make the ${IMPORT_DIR} folder: ${reason(err)}`;
    publish(p);
    return p;
  }

  for (const file of songs) {
    if (stopRequested) {
      p.stopped = true;
      discard(file);
      continue;
    }
    p.current = file.name;
    try {
      const same = new File(dir, file.name);
      if (same.exists && same.size === file.size) {
        p.skipped += 1;
        discard(file);
      } else {
        await file.move(new File(dir, freeName(file.name, (name) => new File(dir, name).exists)));
        p.copied += 1;
      }
    } catch (err) {
      fail(p, file.name, err);
      discard(file);
    }
    publish(p);
  }
  return finish(db, p);
}

interface Found extends FoundEntry {
  file: File;
}

/** Every file under the picked folder, outside hidden folders and outside Melodify's own. */
function walk(root: Directory): Found[] {
  const found: Found[] = [];
  const stack: { dir: Directory; rel: string }[] = [{ dir: root, rel: '' }];
  while (stack.length) {
    const { dir, rel } = stack.pop()!;
    let entries: (Directory | File)[];
    try {
      entries = dir.list();
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry instanceof Directory) {
        if (!entry.name.startsWith('.') && !isInside(entry.uri, Paths.document.uri)) stack.push({ dir: entry, rel: path });
      } else {
        found.push({ rel: path, name: entry.name, file: entry });
      }
    }
  }
  return found;
}

/**
 * Copies under a hidden name, then renames: a copy cut short by the app being closed is then never
 * taken for a song, and the next import of the folder copies it again.
 */
async function copyInto(root: Directory, entry: Found, made: Set<string>): Promise<void> {
  const parts = entry.rel.split('/');
  const name = parts.pop()!;
  const parent = parts.length ? new Directory(root, ...parts) : root;
  const key = parts.join('/');
  if (!made.has(key)) {
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    made.add(key);
  }
  const part = new File(parent, `.${name}.part`);
  try {
    await entry.file.copy(part, { overwrite: true });
    part.rename(name);
  } catch (err) {
    try {
      if (part.exists) part.delete();
    } catch {
      // Hidden, so scans skip it; the next import overwrites it.
    }
    throw err;
  }
}

/**
 * A folder picked in the Files app, copied with its subfolders into a folder of the same name, so
 * the Folders tab shows it as it was. Songs already there from an earlier import are kept, which
 * makes importing the same folder again copy only what is new. Null when the picker was
 * cancelled or an import is already running.
 */
export async function importFolder(db: SQLiteDatabase): Promise<ImportProgress | null> {
  if (isImporting(latest)) return null;
  let source: Directory;
  try {
    source = await Directory.pickDirectoryAsync();
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_FILE_PICKING_CANCELLED') return null;
    throw err;
  }

  const name = importFolderName(source.name);
  const p = begin('finding', name);
  publish(p);
  // The walk holds the JS thread; let "Looking through…" reach the screen first.
  await new Promise((resolve) => setTimeout(resolve, 50));
  try {
    if (isInside(source.uri, Paths.document.uri)) {
      p.phase = 'done';
      p.message = 'That folder is already in Melodify’s folder, so it was scanned instead';
      publish(p);
      await scanLibrary(db);
      return p;
    }

    const dest = new Directory(Paths.document, name);
    const plan = planFolderImport(walk(source), (rel) => new File(dest, ...rel.split('/')).exists);
    p.total = plan.songs;
    p.skipped = plan.skipped;
    p.notDownloaded = plan.notDownloaded;
    if (!plan.songs && !plan.skipped && !plan.notDownloaded) {
      p.phase = 'done';
      p.message = `No songs Melodify can play are in ${source.name}`;
      publish(p);
      return p;
    }

    const bytes = plan.copy.reduce((sum, e) => sum + (e.file.size ?? 0), 0);
    const free = Paths.availableDiskSpace;
    if (bytes + SPARE_BYTES > free) {
      throw new Error(`Not enough space on the phone: this needs ${formatBytes(bytes)} and ${formatBytes(free)} is free`);
    }

    p.phase = 'copying';
    publish(p);
    const made = new Set<string>();
    let extras = false;
    for (const entry of plan.copy) {
      if (stopRequested) {
        p.stopped = true;
        break;
      }
      const song = importKind(entry.name) === 'song';
      if (song) p.current = entry.name;
      try {
        await copyInto(dest, entry, made);
        if (song) p.copied += 1;
        else extras = true;
      } catch (err) {
        if (song) fail(p, entry.rel, err);
        else console.warn('[melodify] import skipped:', entry.rel, err);
      }
      if (song) publish(p);
    }
    return await finish(db, p, extras);
  } catch (err) {
    p.phase = 'error';
    p.current = undefined;
    p.message = reason(err);
    publish(p);
    if (p.copied) await scanLibrary(db);
    return p;
  }
}
