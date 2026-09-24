import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_QUEUE_ID } from '@/db/queues';
import { getSetting, setSetting, type Settings } from '@/db/settings';
import type { Backup, BackupSource } from './format';
import { remapFolder, type LibraryTrack, type PathRule } from './match';

/**
 * The database half of backup and restore. No file access and nothing from React Native, so the
 * tests run it against the real schema. Callers go through `serial`, like every other
 * multi-statement write.
 */

export async function collectBackupSource(db: SQLiteDatabase): Promise<BackupSource> {
  const tracks = await db.getAllAsync<BackupSource['tracks'][number]>(
    `SELECT id, path, title, artist, album, duration_ms, favorite, hidden, play_count, skip_count,
            last_played_at, resume_ms, added_at
     FROM tracks ORDER BY path`,
  );
  const playlists = await db.getAllAsync<BackupSource['playlists'][number]>(
    'SELECT id, name, created_at, updated_at FROM playlists ORDER BY id',
  );
  const playlistTracks = await db.getAllAsync<BackupSource['playlistTracks'][number]>(
    'SELECT playlist_id, track_id FROM playlist_tracks ORDER BY playlist_id, position',
  );
  const queues = await db.getAllAsync<BackupSource['queues'][number]>(
    'SELECT id, name, current_index, current_ms, repeat FROM queues ORDER BY position, id',
  );
  const queueTracks = await db.getAllAsync<BackupSource['queueTracks'][number]>(
    'SELECT queue_id, track_id, position FROM queue_tracks ORDER BY queue_id, position',
  );
  const bookmarks = await db.getAllAsync<BackupSource['bookmarks'][number]>(
    'SELECT track_id, position_ms, label, created_at FROM bookmarks ORDER BY created_at, id',
  );
  const excluded = await db.getAllAsync<{ folder: string }>('SELECT folder FROM excluded_folders ORDER BY folder');
  const prefs = await getSetting(db, 'prefs');
  const choices = await getSetting(db, 'choices');
  const recentSearches = await getSetting(db, 'recentSearches');
  return {
    tracks,
    playlists,
    playlistTracks,
    queues,
    queueTracks,
    activeQueueId: await getSetting(db, 'activeQueueId'),
    bookmarks,
    excludedFolders: excluded.map((r) => r.folder),
    settings: {
      ...(prefs ? { prefs: prefs as Record<string, unknown> } : {}),
      ...(choices ? { choices } : {}),
      ...(recentSearches ? { recentSearches } : {}),
    },
  };
}

/** What `matchTracks` needs to know about the library as it is now. */
export function listLibraryForMatching(db: SQLiteDatabase): Promise<LibraryTrack[]> {
  return db.getAllAsync<LibraryTrack>('SELECT id, path, title, artist, album, duration_ms FROM tracks');
}

export interface RestoreCounts {
  songs: number;
  playlists: number;
  playlistSongsMissing: number;
  queues: number;
  bookmarks: number;
}

/**
 * Replaces playlists, queues, bookmarks, excluded folders and settings with the backup's, and
 * writes the backed-up play counts, favorites, hidden flags and resume points onto the songs it
 * was matched to. Library songs the backup does not know are left as they are. Songs that were
 * not found drop out of the playlists and queues rather than failing the restore.
 *
 * On the main connection inside one transaction, so foreign keys hold and a failure part way
 * leaves the library as it was.
 */
export async function writeRestore(
  db: SQLiteDatabase,
  backup: Backup,
  ids: (number | null)[],
  rules: PathRule[],
): Promise<RestoreCounts> {
  const counts: RestoreCounts = { songs: 0, playlists: 0, playlistSongsMissing: 0, queues: 0, bookmarks: 0 };
  const idOf = (index: number) => ids[index] ?? null;

  await db.withTransactionAsync(async () => {
    // Children first: the cascade is not relied on, since a connection opened for an exclusive
    // transaction does not have foreign keys switched on.
    await db.execAsync(`
      DELETE FROM playlist_tracks; DELETE FROM playlists;
      DELETE FROM queue_tracks; DELETE FROM queues;
      DELETE FROM bookmarks; DELETE FROM excluded_folders;
    `);

    const updates = backup.tracks.flatMap((t, i) => {
      const id = idOf(i);
      return id === null
        ? []
        : [{
            id,
            favorite: t.favorite ? 1 : 0,
            hidden: t.hidden ? 1 : 0,
            play_count: t.playCount ?? 0,
            skip_count: t.skipCount ?? 0,
            last_played_at: t.lastPlayedAt ?? null,
            resume_ms: t.resumeMs ?? null,
            added_at: t.addedAt ?? null,
          }];
    });
    // One statement over a JSON array, like the queue saves: a 10k-song restore is not 10k calls.
    await db.runAsync(
      `UPDATE tracks SET
         favorite = u.favorite, hidden = u.hidden, play_count = u.play_count, skip_count = u.skip_count,
         last_played_at = u.last_played_at, resume_ms = u.resume_ms, added_at = COALESCE(u.added_at, tracks.added_at)
       FROM (SELECT j.value ->> 'id' AS id, j.value ->> 'favorite' AS favorite, j.value ->> 'hidden' AS hidden,
                    j.value ->> 'play_count' AS play_count, j.value ->> 'skip_count' AS skip_count,
                    j.value ->> 'last_played_at' AS last_played_at, j.value ->> 'resume_ms' AS resume_ms,
                    j.value ->> 'added_at' AS added_at
             FROM json_each(?) j) AS u
       WHERE tracks.id = u.id`,
      JSON.stringify(updates),
    );
    counts.songs = updates.length;

    for (const p of backup.playlists) {
      const result = await db.runAsync(
        'INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)',
        p.name,
        p.createdAt || backup.createdAt,
        p.updatedAt || backup.createdAt,
      );
      const trackIds = p.tracks.map(idOf);
      counts.playlistSongsMissing += trackIds.filter((id) => id === null).length;
      await insertList(db, 'playlist_tracks', 'playlist_id', result.lastInsertRowId, trackIds);
      counts.playlists += 1;
    }

    // Queue ids restart at 1, so there is always the default queue the store falls back to.
    let activeId = DEFAULT_QUEUE_ID;
    const queues = backup.queues.length
      ? backup.queues
      : [{ name: 'Queue 1', currentIndex: -1, currentMs: 0, repeat: 'off' as const, tracks: [] }];
    for (const [position, q] of queues.entries()) {
      const id = DEFAULT_QUEUE_ID + position;
      const found = q.tracks.map(idOf);
      const kept = found.flatMap((trackId, i) => (trackId === null ? [] : [{ trackId, i }]));
      // The current song, or the first survivor after it; its position only if it is the same song.
      let current = kept.findIndex((k) => k.i >= q.currentIndex);
      if (current === -1) current = kept.length - 1;
      const sameSong = current >= 0 && kept[current].i === q.currentIndex;
      await db.runAsync(
        `INSERT INTO queues (id, name, position, current_index, current_ms, repeat, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        q.name,
        position,
        Math.max(0, current),
        sameSong ? Math.round(q.currentMs) : 0,
        q.repeat,
        backup.createdAt,
      );
      await insertList(db, 'queue_tracks', 'queue_id', id, kept.map((k) => k.trackId));
      if (position === backup.activeQueue) activeId = id;
      if (kept.length) counts.queues += 1;
    }

    for (const b of backup.bookmarks) {
      const id = idOf(b.track);
      if (id === null) continue;
      await db.runAsync(
        'INSERT INTO bookmarks (track_id, position_ms, label, created_at) VALUES (?, ?, ?, ?)',
        id,
        Math.round(b.positionMs),
        b.label,
        b.createdAt,
      );
      counts.bookmarks += 1;
    }

    for (const folder of new Set(backup.excludedFolders.map((f) => remapFolder(f, rules)))) {
      await db.runAsync('INSERT OR IGNORE INTO excluded_folders (folder) VALUES (?)', folder);
    }

    const { prefs, choices, recentSearches } = backup.settings;
    if (prefs) await setSetting(db, 'prefs', prefs as Settings['prefs']);
    if (choices) await setSetting(db, 'choices', choices);
    if (recentSearches) await setSetting(db, 'recentSearches', recentSearches);
    await setSetting(db, 'activeQueueId', activeId);
  });
  return counts;
}

/** Contiguous positions over the ids that were found; the missing ones are skipped. */
async function insertList(
  db: SQLiteDatabase,
  table: 'playlist_tracks' | 'queue_tracks',
  owner: 'playlist_id' | 'queue_id',
  ownerId: number,
  trackIds: (number | null)[],
): Promise<void> {
  const present = trackIds.filter((id): id is number => id !== null);
  if (present.length === 0) return;
  await db.runAsync(
    `INSERT INTO ${table} (${owner}, track_id, position)
     SELECT ?, j.value, j.key FROM json_each(?) j JOIN tracks t ON t.id = j.value`,
    ownerId,
    JSON.stringify(present),
  );
}
