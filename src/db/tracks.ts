import type { SQLiteDatabase } from 'expo-sqlite';
import type { AlbumSummary, ArtistSummary, FolderEntry, Track } from './types';

export type TrackSort = 'title' | 'artist' | 'album' | 'added' | 'played' | 'duration';

const sortSql: Record<TrackSort, string> = {
  title: 'title COLLATE NOCASE ASC',
  artist: 'artist COLLATE NOCASE ASC, album COLLATE NOCASE ASC, disc_no, track_no',
  album: 'album COLLATE NOCASE ASC, disc_no, track_no',
  added: 'added_at DESC',
  played: 'last_played_at DESC',
  duration: 'duration_ms DESC',
};

const VISIBLE = 'hidden = 0';

export function listTracks(db: SQLiteDatabase, sort: TrackSort = 'title'): Promise<Track[]> {
  return db.getAllAsync<Track>(`SELECT * FROM tracks WHERE ${VISIBLE} ORDER BY ${sortSql[sort]}`);
}

export function getTrack(db: SQLiteDatabase, id: number): Promise<Track | null> {
  return db.getFirstAsync<Track>('SELECT * FROM tracks WHERE id = ?', id);
}

export function countTracks(db: SQLiteDatabase): Promise<number> {
  return db
    .getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM tracks WHERE ${VISIBLE}`)
    .then((r) => r?.n ?? 0);
}

export function listAlbums(db: SQLiteDatabase): Promise<AlbumSummary[]> {
  return db.getAllAsync<AlbumSummary>(`
    SELECT album, COALESCE(album_artist, artist) AS album_artist, MAX(year) AS year,
           COUNT(*) AS track_count, MAX(art_key) AS art_key, MIN(id) AS first_track_id
    FROM tracks
    WHERE ${VISIBLE} AND album IS NOT NULL
    GROUP BY album, COALESCE(album_artist, artist)
    ORDER BY album COLLATE NOCASE ASC
  `);
}

export function listAlbumTracks(db: SQLiteDatabase, album: string, albumArtist: string | null): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks
     WHERE ${VISIBLE} AND album = ? AND COALESCE(album_artist, artist) IS ?
     ORDER BY disc_no, track_no, title COLLATE NOCASE`,
    album,
    albumArtist,
  );
}

export function listArtists(db: SQLiteDatabase): Promise<ArtistSummary[]> {
  return db.getAllAsync<ArtistSummary>(`
    SELECT artist, COUNT(DISTINCT album) AS album_count, COUNT(*) AS track_count
    FROM tracks
    WHERE ${VISIBLE} AND artist IS NOT NULL
    GROUP BY artist
    ORDER BY artist COLLATE NOCASE ASC
  `);
}

export function listArtistTracks(db: SQLiteDatabase, artist: string): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${VISIBLE} AND artist = ?
     ORDER BY album COLLATE NOCASE, disc_no, track_no, title COLLATE NOCASE`,
    artist,
  );
}

/** Immediate subfolders of `folder` plus the tracks directly inside it. */
export async function listFolder(
  db: SQLiteDatabase,
  folder: string,
): Promise<{ folders: FolderEntry[]; tracks: Track[] }> {
  const prefix = folder === '' ? '' : `${folder}/`;
  const rows = await db.getAllAsync<{ child: string; n: number }>(
    `SELECT substr(folder, ?, instr(substr(folder, ?) || '/', '/') - 1) AS child, COUNT(*) AS n
     FROM tracks
     WHERE ${VISIBLE} AND folder != ? AND substr(folder, 1, ?) = ?
     GROUP BY child
     ORDER BY child COLLATE NOCASE`,
    prefix.length + 1,
    prefix.length + 1,
    folder,
    prefix.length,
    prefix,
  );
  const folders: FolderEntry[] = rows
    .filter((r) => r.child !== '')
    .map((r) => ({ path: prefix + r.child, name: r.child, track_count: r.n }));
  const tracks = await db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${VISIBLE} AND folder = ? ORDER BY disc_no, track_no, filename COLLATE NOCASE`,
    folder,
  );
  return { folders, tracks };
}

export function listFolderTracksRecursive(db: SQLiteDatabase, folder: string): Promise<Track[]> {
  const prefix = folder === '' ? '' : `${folder}/`;
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${VISIBLE} AND (folder = ? OR substr(folder, 1, ?) = ?)
     ORDER BY folder COLLATE NOCASE, disc_no, track_no, filename COLLATE NOCASE`,
    folder,
    prefix.length,
    prefix,
  );
}

export function searchTracks(db: SQLiteDatabase, query: string, limit = 100): Promise<Track[]> {
  const q = `%${query.trim()}%`;
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks
     WHERE ${VISIBLE} AND (title LIKE ? OR artist LIKE ? OR album LIKE ? OR filename LIKE ?)
     ORDER BY title COLLATE NOCASE LIMIT ?`,
    q, q, q, q, limit,
  );
}
