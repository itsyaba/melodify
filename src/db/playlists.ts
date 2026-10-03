import type { SQLiteDatabase } from 'expo-sqlite';
import { serial } from './serial';
import type { Track } from './types';

export interface PlaylistSummary {
  id: number;
  name: string;
  track_count: number;
  duration_ms: number | null;
  /** Art of the first track that has any. */
  art_key: string | null;
  updated_at: number;
}

export type PlaylistSort = 'name' | 'updated' | 'tracks';

const playlistSortSql: Record<PlaylistSort, string> = {
  name: 'p.name COLLATE NOCASE',
  updated: 'p.updated_at DESC',
  tracks: 'track_count DESC, p.name COLLATE NOCASE',
};

/** `nameLike` is a ready `LIKE` pattern (see `likePattern`), for search. */
export function listPlaylists(
  db: SQLiteDatabase,
  sort: PlaylistSort = 'name',
  nameLike?: string,
): Promise<PlaylistSummary[]> {
  return db.getAllAsync<PlaylistSummary>(
    `SELECT p.id, p.name, p.updated_at,
           COUNT(t.id) AS track_count,
           SUM(t.duration_ms) AS duration_ms,
           (SELECT t2.art_key FROM playlist_tracks pt2 JOIN tracks t2 ON t2.id = pt2.track_id
            WHERE pt2.playlist_id = p.id AND t2.art_key IS NOT NULL
            ORDER BY pt2.position LIMIT 1) AS art_key
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    ${nameLike ? "WHERE p.name LIKE ? ESCAPE '\\'" : ''}
    GROUP BY p.id
    ORDER BY ${playlistSortSql[sort]}`,
    ...(nameLike ? [nameLike] : []),
  );
}

export interface PlaylistCard {
  id: number;
  name: string;
  track_count: number;
  art_key: string | null;
  /** The artists with the most songs in it, most first; one more than shown, to say "and more". */
  artists: string[];
}

/** The artists a card names, and one more to know there are others. */
const CARD_ARTISTS = 4;

/** Playlists for Home, the one changed last first, each with its cover and leading artists. */
export async function listPlaylistCards(db: SQLiteDatabase, limit: number): Promise<PlaylistCard[]> {
  const rows = await db.getAllAsync<Omit<PlaylistCard, 'artists'> & { artists: string | null }>(
    `SELECT p.id, p.name,
            (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count,
            (SELECT t.art_key FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
             WHERE pt.playlist_id = p.id AND t.art_key IS NOT NULL ORDER BY pt.position LIMIT 1) AS art_key,
            (SELECT json_group_array(artist) FROM (
               SELECT t.artist FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
               WHERE pt.playlist_id = p.id AND t.artist IS NOT NULL AND t.artist != ''
               GROUP BY t.artist COLLATE NOCASE
               ORDER BY COUNT(*) DESC, MIN(pt.position) LIMIT ${CARD_ARTISTS})) AS artists
     FROM playlists p
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ?`,
    limit,
  );
  return rows.map((r) => ({ ...r, artists: r.artists ? (JSON.parse(r.artists) as string[]) : [] }));
}

export function getPlaylist(db: SQLiteDatabase, id: number): Promise<{ id: number; name: string } | null> {
  return db.getFirstAsync<{ id: number; name: string }>('SELECT id, name FROM playlists WHERE id = ?', id);
}

/** Hidden tracks included: hiding keeps a file out of the library lists, not out of a playlist. */
export function listPlaylistTracks(db: SQLiteDatabase, id: number): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ? ORDER BY pt.position`,
    id,
  );
}

export function createPlaylist(db: SQLiteDatabase, name: string, trackIds: number[] = []): Promise<number> {
  return serial(async () => {
    const now = Date.now();
    let id = 0;
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        'INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)',
        name,
        now,
        now,
      );
      id = result.lastInsertRowId;
      await insertAt(db, id, 0, trackIds);
    });
    return id;
  });
}

export function renamePlaylist(db: SQLiteDatabase, id: number, name: string): Promise<void> {
  return serial(async () => {
    await db.runAsync('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', name, Date.now(), id);
  });
}

export function deletePlaylist(db: SQLiteDatabase, id: number): Promise<void> {
  return serial(async () => {
    await db.runAsync('DELETE FROM playlists WHERE id = ?', id);
  });
}

/** Appends to the end. The same track may appear more than once, as in any playlist. */
export function addToPlaylist(db: SQLiteDatabase, id: number, trackIds: number[]): Promise<void> {
  return serial(() =>
    db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ next: number }>(
        'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM playlist_tracks WHERE playlist_id = ?',
        id,
      );
      await insertAt(db, id, row?.next ?? 0, trackIds);
      await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', Date.now(), id);
    }),
  );
}

/** Replaces the whole list: how reordering and removing are saved. */
export function setPlaylistTracks(db: SQLiteDatabase, id: number, trackIds: number[]): Promise<void> {
  return serial(() =>
    db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', id);
      await insertAt(db, id, 0, trackIds);
      await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', Date.now(), id);
    }),
  );
}

/** One statement for the whole list; ids of tracks deleted since are skipped, leaving a gap. */
function insertAt(db: SQLiteDatabase, id: number, base: number, trackIds: number[]): Promise<unknown> {
  if (trackIds.length === 0) return Promise.resolve();
  return db.runAsync(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position)
     SELECT ?, j.value, ? + j.key FROM json_each(?) j JOIN tracks t ON t.id = j.value`,
    id,
    base,
    JSON.stringify(trackIds),
  );
}
