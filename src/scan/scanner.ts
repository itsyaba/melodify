import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ART_EXTENSIONS, ART_FILENAMES, AUDIO_EXTENSIONS, LYRICS_EXTENSION } from '@/constants';
import { BUSY_TIMEOUT } from '@/db';
import { isExcluded } from '@/db/folders';
import { libraryEvents, type ScanProgress } from '@/utils/events';
import { mergeTags, type GuessedColumns } from './merge-tags';
import { guessTags } from './parse-filename';
import { canReadTags, readTags, TAG_BATCH, tagReaderVersion } from './read-tags';

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

type PendingRow = GuessedColumns & { id: number; path: string; folder: string; art_key: string | null };

/**
 * Rows whose tags still need reading: never read, read without yielding a duration, or read by an
 * older reader than this build's. Every file that plays has a duration, so a row without one is a
 * read that failed, and it is tried again rather than left looking empty until the file changes.
 */
function pendingRows(db: SQLiteDatabase): Promise<PendingRow[]> {
  return db.getAllAsync<PendingRow>(
    `SELECT id, path, folder, title, artist, album, track_no, disc_no, art_key FROM tracks
     WHERE tagged = 0 OR duration_ms IS NULL OR tag_version < ?`,
    tagReaderVersion(),
  );
}

/**
 * Reads real tags for the pending rows, a batch at a time. The native read happens outside any
 * transaction, so the database is only locked for the short write that follows it. `folderArt` is
 * the fresh map from a walk; without one (the launch pass) each row keeps the art it already has.
 */
async function tagPending(
  db: SQLiteDatabase,
  pending: PendingRow[],
  folderArt: Map<string, string> | null,
  progress: ScanProgress,
  emit: () => void,
): Promise<void> {
  const version = tagReaderVersion();
  for (let i = 0; i < pending.length; i += TAG_BATCH) {
    const batch = pending.slice(i, i + TAG_BATCH);
    const tags = await readTags(batch.map((r) => r.path));
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(BUSY_TIMEOUT);
      const write = await tx.prepareAsync(
        `UPDATE tracks SET title = $title, artist = $artist, album = $album, album_artist = $album_artist,
           genre = $genre, composer = $composer, year = $year, track_no = $track_no, disc_no = $disc_no,
           duration_ms = $duration_ms, bitrate = $bitrate, sample_rate = $sample_rate,
           art_key = $art_key, rg_track_gain = $rg_track_gain, rg_album_gain = $rg_album_gain,
           rg_track_peak = $rg_track_peak, rg_album_peak = $rg_album_peak,
           tag_version = $tag_version, tagged = 1
         WHERE id = $id`,
      );
      try {
        for (const row of batch) {
          const found = tags.get(row.path);
          // No record at all means the batch came back short; the row stays untagged for next time.
          if (!found) continue;
          const c = mergeTags(row, found, folderArt ? (folderArt.get(row.folder) ?? null) : row.art_key);
          await write.executeAsync({
            $title: c.title, $artist: c.artist, $album: c.album, $album_artist: c.album_artist,
            $genre: c.genre, $composer: c.composer, $year: c.year, $track_no: c.track_no,
            $disc_no: c.disc_no, $duration_ms: c.duration_ms, $bitrate: c.bitrate,
            $sample_rate: c.sample_rate, $art_key: c.art_key, $rg_track_gain: c.rg_track_gain,
            $rg_album_gain: c.rg_album_gain, $rg_track_peak: c.rg_track_peak, $rg_album_peak: c.rg_album_peak,
            $tag_version: version, $id: row.id,
          });
          progress.tagged += 1;
          if (found.error) {
            progress.tagFailed += 1;
            progress.tagError ??= `${row.path}: ${found.error}`;
          }
        }
      } finally {
        await write.finalizeAsync();
      }
    });
    emit();
  }
}

let running: Promise<unknown> = Promise.resolve();

/**
 * Scans and the launch tag pass run one at a time: two at once would read the same pending rows
 * twice and interleave their progress on the Scan screen. A request made meanwhile waits its turn.
 */
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = running.then(job, job);
  running = run.catch(() => undefined);
  return run;
}

/**
 * Incremental scan of Documents/: adds new files, updates changed ones (size or mtime),
 * removes rows whose file is gone, then reads real tags through the native module. New rows get
 * filename-based guesses first so the library is browsable while tags are still being read, and
 * rows still awaiting real tags have those guesses re-derived on each scan. On a build without
 * the tag reader the guesses are all there is.
 */
export function scanLibrary(db: SQLiteDatabase): Promise<ScanProgress> {
  return exclusive(() => runScan(db));
}

async function runScan(db: SQLiteDatabase): Promise<ScanProgress> {
  const progress: ScanProgress = {
    phase: 'walking', seen: 0, added: 0, updated: 0, removed: 0, tagged: 0, tagFailed: 0,
  };
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

    const existing = await db.getAllAsync<{
      id: number; path: string; size: number; mtime: number; tagged: 0 | 1;
      title: string; artist: string | null; album: string | null;
      track_no: number | null; disc_no: number | null;
    }>(
      `SELECT id, path, size, mtime, tagged, title, artist, album, track_no, disc_no FROM tracks`,
    );
    const byPath = new Map(existing.map((r) => [r.path, r]));
    const seenPaths = new Set<string>();

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(BUSY_TIMEOUT);
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
      const reguess = await tx.prepareAsync(
        `UPDATE tracks SET title = $title, artist = $artist, album = $album,
           track_no = $track_no, disc_no = $disc_no WHERE id = $id AND tagged = 0`,
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
          } else if (!prev.tagged) {
            // Filename guesses only stand in until native tag reading runs, so refresh them
            // on every scan while the row is untagged. Without this an improved parser could
            // never reach rows that are already indexed and whose files have not changed.
            const g = guessTags(f.path);
            if (
              g.title !== prev.title || g.artist !== prev.artist || g.album !== prev.album ||
              g.track_no !== prev.track_no || g.disc_no !== prev.disc_no
            ) {
              await reguess.executeAsync({
                $title: g.title, $artist: g.artist, $album: g.album,
                $track_no: g.track_no, $disc_no: g.disc_no, $id: prev.id,
              });
              progress.updated += 1;
            }
          }
        }
      } finally {
        await insert.finalizeAsync();
        await update.finalizeAsync();
        await reguess.finalizeAsync();
      }
    });

    // On the main connection, not the transaction's: that one is opened fresh without
    // `foreign_keys = ON`, which cannot be switched on inside a transaction, so deleting there
    // would skip the cascade and leave the file behind in queues and playlists.
    // Rows under an excluded folder were not walked, but they are kept: excluding hides, and
    // including the folder again should bring the songs back as they were.
    const gone = existing
      .filter((r) => !seenPaths.has(r.path) && !isExcluded(dirname(r.path), excluded))
      .map((r) => r.id);
    if (gone.length > 0) {
      await db.runAsync('DELETE FROM tracks WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(gone));
      progress.removed = gone.length;
    }

    if (canReadTags()) {
      // The index is complete at this point, so let the lists pick up new files now rather than
      // after every tag has been read.
      libraryEvents.emit('changed', undefined);
      progress.phase = 'tagging';
      emit();
      await tagPending(db, await pendingRows(db), found.folderArt, progress, emit);
    }

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

/**
 * Run at launch: reads the tags a scan left unread, without walking the folder or dropping rows.
 * Rows indexed by a build without the tag reader, or by a scan cut short when iOS suspended the
 * app mid-tagging, would otherwise show filename guesses, no art and no length until the next
 * manual scan. Silent when nothing is pending, so the Scan screen stays empty on a normal launch.
 */
export function readPendingTags(db: SQLiteDatabase): Promise<void> {
  return exclusive(async () => {
    if (!canReadTags()) return;
    const progress: ScanProgress = {
      phase: 'tagging', seen: 0, added: 0, updated: 0, removed: 0, tagged: 0, tagFailed: 0,
    };
    const emit = () => libraryEvents.emit('scanProgress', { ...progress });
    try {
      const pending = await pendingRows(db);
      if (pending.length === 0) return;
      emit();
      await tagPending(db, pending, null, progress, emit);
      progress.phase = 'done';
    } catch (err) {
      progress.phase = 'error';
      progress.message = err instanceof Error ? err.message : String(err);
    }
    emit();
    libraryEvents.emit('changed', undefined);
  });
}

/** The cover image in `folder` (relative to Documents/), found the way a scan finds it. */
function findFolderArt(folder: string): string | null {
  try {
    const dir = folder ? new Directory(Paths.document, ...folder.split('/')) : Paths.document;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const ext = entry.extension.replace(/^\./, '').toLowerCase();
      const stem = entry.name.replace(/\.[^.]+$/, '').toLowerCase();
      if (ART_EXTENSIONS.has(ext) && ART_FILENAMES.includes(stem)) return folder ? `${folder}/${entry.name}` : entry.name;
    }
  } catch {
    // A folder that cannot be listed has no cover as far as the library is concerned.
  }
  return null;
}

/**
 * Reads these songs' tags again straight away, after the tag editor wrote to their files, and
 * records the files' new size and date so the next scan does not count them as changed. The
 * filename guesses are the fallback rather than the old values, so a field the user cleared
 * comes back empty (or guessed) instead of keeping what it was.
 */
export function retagTracks(db: SQLiteDatabase, tracks: { id: number; path: string; folder: string }[]): Promise<void> {
  return exclusive(async () => {
    if (!canReadTags() || tracks.length === 0) return;
    const folderArt = new Map<string, string>();
    for (const folder of new Set(tracks.map((t) => t.folder))) {
      const art = findFolderArt(folder);
      if (art) folderArt.set(folder, art);
    }
    const rows: PendingRow[] = tracks.map((t) => ({ id: t.id, path: t.path, folder: t.folder, art_key: null, ...guessTags(t.path) }));
    const progress: ScanProgress = {
      phase: 'tagging', seen: 0, added: 0, updated: 0, removed: 0, tagged: 0, tagFailed: 0,
    };
    await tagPending(db, rows, folderArt, progress, () => undefined);
    for (const t of tracks) {
      const file = new File(Paths.document, ...t.path.split('/'));
      if (!file.exists) continue;
      await db.runAsync(
        'UPDATE tracks SET size = ?, mtime = ? WHERE id = ?',
        file.size ?? 0,
        Math.round(file.modificationTime ?? 0),
        t.id,
      );
    }
  });
}
