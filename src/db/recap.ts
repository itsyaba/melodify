import type { SQLiteDatabase } from 'expo-sqlite';

/** One counted play inside a recap's span, with what it was and when the song was first heard. */
export interface PlayRow {
  played_at: number;
  track_id: number;
  title: string;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  genre: string | null;
  art_key: string | null;
  duration_ms: number | null;
  year: number | null;
  /** The first time this song was played at all, over the whole table: what makes it a discovery. */
  first_played_at: number;
}

/**
 * Every play between two moments, oldest first, with its song. `to` is exclusive. Deleted songs
 * take their plays with them (ON DELETE CASCADE), so every row here has a track.
 */
export function listPlaysBetween(db: SQLiteDatabase, from: number, to: number): Promise<PlayRow[]> {
  return db.getAllAsync<PlayRow>(
    `SELECT p.played_at, t.id AS track_id, t.title, t.artist, t.album, t.album_artist, t.genre,
            t.art_key, t.duration_ms, t.year, f.first_played_at
     FROM plays p
     JOIN tracks t ON t.id = p.track_id
     JOIN (SELECT track_id, MIN(played_at) AS first_played_at FROM plays GROUP BY track_id) f
       ON f.track_id = p.track_id
     WHERE p.played_at >= ? AND p.played_at < ?
     ORDER BY p.played_at`,
    from,
    to,
  );
}

/** How many plays a span holds, without reading them: what decides a recap is worth showing. */
export async function countPlaysBetween(db: SQLiteDatabase, from: number, to: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM plays WHERE played_at >= ? AND played_at < ?',
    from,
    to,
  );
  return row?.n ?? 0;
}
