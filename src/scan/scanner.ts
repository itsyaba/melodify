import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ART_EXTENSIONS, ART_FILENAMES, AUDIO_EXTENSIONS, LYRICS_EXTENSION } from '@/constants';
import { libraryEvents, type ScanProgress } from '@/utils/events';
import { guessTags } from './parse-filename';

interface FoundFile {
  path: string; // relative to Documents/
  folder: string;
  filename: string;
  ext: string;
  size: number;
  mtime: number;
}

interface WalkResult {
  audio: FoundFile[];
  /** folder -> relative path of a cover image */
  folderArt: Map<string, string>;
  /** stem path (without extension) -> relative .lrc path */
  lyrics: Map<string, string>;
}

function relative(root: Directory, uri: string): string {
  const rel = Paths.relative(root, uri);
  return decodeURIComponent(rel).replace(/^\/+|\/+$/g, '');
}

function dirname(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

function walk(root: Directory, excluded: Set<string>, onSeen: (n: number) => void): WalkResult {
  const result: WalkResult = { audio: [], folderArt: new Map(), lyrics: new Map() };
  const stack: Directory[] = [root];
  let seen = 0;

  while (stack.length) {
    const dir = stack.pop()!;
    const dirRel = relative(root, dir.uri);
    if (excluded.has(dirRel)) continue;

    let entries: (Directory | File)[];
    try {
      entries = dir.list();
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry instanceof Directory) {
        if (!entry.name.startsWith('.')) stack.push(entry);
        continue;
      }
      const ext = entry.extension.replace(/^\./, '').toLowerCase();
      const rel = relative(root, entry.uri);
      const stemRel = rel.replace(/\.[^./]+$/, '');
      const stemName = entry.name.replace(/\.[^.]+$/, '').toLowerCase();

      if (AUDIO_EXTENSIONS.has(ext)) {
        seen += 1;
        if (seen % 200 === 0) onSeen(seen);
        result.audio.push({
          path: rel,
          folder: dirRel,
          filename: entry.name,
          ext,
          size: entry.size ?? 0,
          mtime: Math.round(entry.modificationTime ?? 0),
        });
      } else if (ART_EXTENSIONS.has(ext) && ART_FILENAMES.includes(stemName)) {
        if (!result.folderArt.has(dirRel)) result.folderArt.set(dirRel, rel);
      } else if (ext === LYRICS_EXTENSION) {
        result.lyrics.set(stemRel, rel);
      }
    }
  }
  onSeen(seen);
  return result;
}

/**
 * Incremental scan of Documents/: adds new files, updates changed ones (size or mtime),
 * removes rows whose file is gone. Tag reading happens later in the native module;
 * new rows get filename-based guesses so the library is browsable immediately.
 */
export async function scanLibrary(db: SQLiteDatabase): Promise<ScanProgress> {
  const progress: ScanProgress = { phase: 'walking', seen: 0, added: 0, updated: 0, removed: 0 };
  const emit = () => libraryEvents.emit('scanProgress', { ...progress });
  const startedAt = Date.now();
  const run = await db.runAsync('INSERT INTO scan_runs (started_at) VALUES (?)', startedAt);

  try {
    const excludedRows = await db.getAllAsync<{ folder: string }>('SELECT folder FROM excluded_folders');
    const excluded = new Set(excludedRows.map((r) => r.folder));
    emit();

    const found = walk(Paths.document, excluded, (n) => {
      progress.seen = n;
      emit();
    });

    progress.phase = 'indexing';
    emit();

    const existing = await db.getAllAsync<{ id: number; path: string; size: number; mtime: number }>(
      'SELECT id, path, size, mtime FROM tracks',
    );
    const byPath = new Map(existing.map((r) => [r.path, r]));
    const seenPaths = new Set<string>();

    await db.withExclusiveTransactionAsync(async (tx) => {
      const insert = await tx.prepareAsync(
        `INSERT INTO tracks (path, folder, filename, ext, size, mtime, title, artist, album,
           track_no, disc_no, art_key, lyrics_path, added_at)
         VALUES ($path, $folder, $filename, $ext, $size, $mtime, $title, $artist, $album,
           $track_no, $disc_no, $art_key, $lyrics_path, $added_at)`,
      );
      const update = await tx.prepareAsync(
        `UPDATE tracks SET size = $size, mtime = $mtime, tagged = 0, art_key = COALESCE(art_key, $art_key),
           lyrics_path = $lyrics_path WHERE id = $id`,
      );
      try {
        for (const f of found.audio) {
          seenPaths.add(f.path);
          const artKey = found.folderArt.get(f.folder) ?? null;
          const lyricsPath = found.lyrics.get(f.path.replace(/\.[^./]+$/, '')) ?? null;
          const prev = byPath.get(f.path);
          if (!prev) {
            const g = guessTags(f.path);
            await insert.executeAsync({
              $path: f.path, $folder: f.folder, $filename: f.filename, $ext: f.ext,
              $size: f.size, $mtime: f.mtime, $title: g.title, $artist: g.artist, $album: g.album,
              $track_no: g.track_no, $disc_no: g.disc_no, $art_key: artKey, $lyrics_path: lyricsPath,
              $added_at: startedAt,
            });
            progress.added += 1;
          } else if (prev.size !== f.size || prev.mtime !== f.mtime) {
            await update.executeAsync({ $size: f.size, $mtime: f.mtime, $art_key: artKey, $lyrics_path: lyricsPath, $id: prev.id });
            progress.updated += 1;
          }
        }
      } finally {
        await insert.finalizeAsync();
        await update.finalizeAsync();
      }

      const gone = existing.filter((r) => !seenPaths.has(r.path));
      for (const r of gone) {
        await tx.runAsync('DELETE FROM tracks WHERE id = ?', r.id);
        progress.removed += 1;
      }
    });

    progress.phase = 'done';
    await db.runAsync(
      'UPDATE scan_runs SET finished_at = ?, added = ?, updated = ?, removed = ? WHERE id = ?',
      Date.now(), progress.added, progress.updated, progress.removed, run.lastInsertRowId,
    );
  } catch (err) {
    progress.phase = 'error';
    progress.message = err instanceof Error ? err.message : String(err);
    await db.runAsync('UPDATE scan_runs SET finished_at = ?, error = ? WHERE id = ?', Date.now(), progress.message, run.lastInsertRowId);
  }

  emit();
  libraryEvents.emit('changed', undefined);
  return progress;
}
