import type { SQLiteDatabase } from 'expo-sqlite';
import { serial } from './serial';
import type { Track } from './types';

export interface Bookmark {
  id: number;
  track_id: number;
  position_ms: number;
  label: string | null;
  created_at: number;
}

export type BookmarkWithTrack = Bookmark & { track: Track };

/** Newest first, each with its track. Bookmarks on deleted files went with them (cascade). */
export async function listBookmarks(db: SQLiteDatabase, trackId?: number): Promise<BookmarkWithTrack[]> {
  const rows = await db.getAllAsync<Bookmark & { track_json: string }>(
    `SELECT b.*, json_object(
       'id', t.id, 'path', t.path, 'folder', t.folder, 'filename', t.filename, 'ext', t.ext,
       'size', t.size, 'mtime', t.mtime, 'title', t.title, 'artist', t.artist, 'album', t.album,
       'album_artist', t.album_artist, 'genre', t.genre, 'composer', t.composer, 'year', t.year,
       'track_no', t.track_no, 'disc_no', t.disc_no, 'duration_ms', t.duration_ms,
       'bitrate', t.bitrate, 'sample_rate', t.sample_rate, 'art_key', t.art_key,
       'lyrics_path', t.lyrics_path, 'tagged', t.tagged, 'hidden', t.hidden, 'favorite', t.favorite,
       'play_count', t.play_count, 'skip_count', t.skip_count, 'last_played_at', t.last_played_at,
       'resume_ms', t.resume_ms, 'added_at', t.added_at, 'rg_track_gain', t.rg_track_gain,
       'rg_album_gain', t.rg_album_gain, 'rg_track_peak', t.rg_track_peak,
       'rg_album_peak', t.rg_album_peak, 'tag_version', t.tag_version) AS track_json
     FROM bookmarks b JOIN tracks t ON t.id = b.track_id
     ${trackId === undefined ? '' : 'WHERE b.track_id = ?'}
     ORDER BY ${trackId === undefined ? 'b.created_at DESC' : 'b.position_ms'}`,
    ...(trackId === undefined ? [] : [trackId]),
  );
  return rows.map(({ track_json, ...b }) => ({ ...b, track: JSON.parse(track_json) as Track }));
}

export function addBookmark(db: SQLiteDatabase, trackId: number, positionMs: number, label: string | null): Promise<number> {
  return serial(async () => {
    const result = await db.runAsync(
      'INSERT INTO bookmarks (track_id, position_ms, label, created_at) VALUES (?, ?, ?, ?)',
      trackId,
      Math.round(positionMs),
      label,
      Date.now(),
    );
    return result.lastInsertRowId;
  });
}

export function renameBookmark(db: SQLiteDatabase, id: number, label: string | null): Promise<void> {
  return serial(async () => {
    await db.runAsync('UPDATE bookmarks SET label = ? WHERE id = ?', label, id);
  });
}

export function deleteBookmark(db: SQLiteDatabase, id: number): Promise<void> {
  return serial(async () => {
    await db.runAsync('DELETE FROM bookmarks WHERE id = ?', id);
  });
}
