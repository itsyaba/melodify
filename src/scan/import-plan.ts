import { ART_EXTENSIONS, ART_FILENAMES, AUDIO_EXTENSIONS, LYRICS_EXTENSION } from '@/constants';
import type { ImportProgress } from '@/utils/events';
import { formatCount } from '@/utils/format';

/** Songs picked one by one land here, inside Documents/. */
export const IMPORT_DIR = 'Imported';

/**
 * What an import copies: songs, and the files beside them that the scanner reads too (folder
 * covers, .lrc lyrics) or that list songs (M3U playlists). Hidden files are left behind, which
 * also drops the `._Song.mp3` shadow files macOS leaves on USB drives.
 */
export function importKind(name: string): 'song' | 'extra' | null {
  const dot = name.lastIndexOf('.');
  if (name.startsWith('.') || dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  const stem = name.slice(0, dot).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) return 'song';
  if (ext === LYRICS_EXTENSION || ext === 'm3u' || ext === 'm3u8') return 'extra';
  if (ART_EXTENSIONS.has(ext) && ART_FILENAMES.includes(stem)) return 'extra';
  return null;
}

/** iCloud Drive's stand-in for a file it has not downloaded: `.Song.mp3.icloud` for `Song.mp3`. */
export function cloudPlaceholderFor(name: string): string | null {
  const m = /^\.(.+)\.icloud$/.exec(name);
  return m ? m[1] : null;
}

/** `name` when `taken` says it is free, else `Song 2.mp3`, `Song 3.mp3`, and so on. */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} ${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * The folder inside Documents/ a picked folder is copied to: its own name, so importing it again
 * lands in the same place. Scans skip hidden folders, and `Melodify/` holds the backups.
 */
export function importFolderName(name: string): string {
  const clean = name.trim().replace(/^\.+/, '');
  if (!clean) return IMPORT_DIR;
  return clean.toLowerCase() === 'melodify' ? `${clean} (imported)` : clean;
}

/** Whether `uri` is `root` or inside it. iOS calls the same place both /var/… and /private/var/…. */
export function isInside(uri: string, root: string): boolean {
  const norm = (u: string) =>
    decodeURIComponent(u).replace(/^file:\/\//, '').replace(/^\/private(?=\/var\/)/, '').replace(/\/+$/, '');
  const a = norm(uri);
  const b = norm(root);
  return a === b || a.startsWith(`${b}/`);
}

export interface FoundEntry {
  /** Path relative to the picked folder. */
  rel: string;
  name: string;
}

export interface FolderPlan<E extends FoundEntry> {
  /** Songs and extras not imported yet, in the order found. */
  copy: E[];
  songs: number;
  skipped: number;
  notDownloaded: number;
}

/**
 * Sorts what a folder walk found. `exists` says whether a relative path is already in the
 * destination; those are kept as they are, since Melodify may have rewritten their tags.
 */
export function planFolderImport<E extends FoundEntry>(entries: E[], exists: (rel: string) => boolean): FolderPlan<E> {
  const plan: FolderPlan<E> = { copy: [], songs: 0, skipped: 0, notDownloaded: 0 };
  for (const entry of entries) {
    const placeholder = cloudPlaceholderFor(entry.name);
    if (placeholder !== null) {
      if (importKind(placeholder) === 'song') plan.notDownloaded += 1;
      continue;
    }
    const kind = importKind(entry.name);
    if (kind === null) continue;
    if (exists(entry.rel)) {
      if (kind === 'song') plan.skipped += 1;
      continue;
    }
    plan.copy.push(entry);
    if (kind === 'song') plan.songs += 1;
  }
  return plan;
}

/** One line for a toast once an import ends. */
export function importSummary(p: ImportProgress): string {
  if (p.phase === 'error') return p.message ?? 'The import failed';
  const notes = [
    p.skipped ? `${p.skipped} already there` : '',
    p.notDownloaded ? `${p.notDownloaded} not downloaded from iCloud` : '',
    p.unsupported ? `${p.unsupported} not playable` : '',
    p.failed ? `${p.failed} failed` : '',
  ].filter(Boolean);
  let head: string;
  if (p.copied) head = `${p.stopped ? 'Stopped after importing' : 'Imported'} ${formatCount(p.copied, 'song')}`;
  else if (p.stopped) head = 'Import stopped';
  else if (p.skipped && !p.notDownloaded && !p.unsupported && !p.failed) {
    return p.skipped === 1 ? 'That song was already imported' : `All ${p.skipped} songs were already imported`;
  }
  else if (p.message && !p.failed) return p.message;
  else head = 'Nothing imported';
  return notes.length ? `${head} (${notes.join(', ')})` : head;
}
