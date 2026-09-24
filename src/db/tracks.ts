import type { SQLiteDatabase } from 'expo-sqlite';
import type { AlbumSummary, FolderEntry, GroupSummary, Track } from './types';

export type TrackSort = 'title' | 'artist' | 'album' | 'added' | 'played' | 'plays' | 'duration' | 'year' | 'filename';

const sortSql: Record<TrackSort, string> = {
  title: 'title COLLATE NOCASE ASC',
  artist: 'artist COLLATE NOCASE ASC, album COLLATE NOCASE ASC, disc_no, track_no',
  album: 'album COLLATE NOCASE ASC, disc_no, track_no',
  added: 'added_at DESC, path',
  // Never-played tracks last, not first as a plain DESC on a nullable column would put them.
  played: 'last_played_at IS NULL, last_played_at DESC',
  plays: 'play_count DESC, title COLLATE NOCASE',
  duration: 'duration_ms DESC',
  year: 'year IS NULL, year DESC, album COLLATE NOCASE, disc_no, track_no',
  filename: 'path COLLATE NOCASE',
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

/**
 * The grouped views. Album artist falls back to the track artist, the same way albums are
 * grouped, so an untagged compilation still lands somewhere sensible.
 */
export type GroupKind = 'artist' | 'album_artist' | 'genre' | 'composer' | 'year';

const groupColumn: Record<GroupKind, string> = {
  artist: 'artist',
  album_artist: 'COALESCE(album_artist, artist)',
  genre: 'genre',
  composer: 'composer',
  year: 'year',
};

export type GroupSort = 'name' | 'tracks' | 'albums';

export function listGroups(db: SQLiteDatabase, kind: GroupKind, sort: GroupSort = 'name'): Promise<GroupSummary[]> {
  const col = groupColumn[kind];
  const byName = kind === 'year' ? `${col} DESC` : `name COLLATE NOCASE ASC`;
  const order = { name: byName, tracks: `track_count DESC, ${byName}`, albums: `album_count DESC, ${byName}` }[sort];
  return db.getAllAsync<GroupSummary>(`
    SELECT CAST(${col} AS TEXT) AS name, COUNT(*) AS track_count, COUNT(DISTINCT album) AS album_count,
           MAX(art_key) AS art_key, SUM(duration_ms) AS duration_ms
    FROM tracks
    WHERE ${VISIBLE} AND ${col} IS NOT NULL AND ${col} != ''
    GROUP BY ${col}
    ORDER BY ${order}
  `);
}

/** Every track in one group, album by album. `value` is the group's `name` as listed. */
export function listGroupTracks(db: SQLiteDatabase, kind: GroupKind, value: string): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${VISIBLE} AND CAST(${groupColumn[kind]} AS TEXT) = ?
     ORDER BY album COLLATE NOCASE, disc_no, track_no, title COLLATE NOCASE`,
    value,
  );
}

export type AlbumSort = 'name' | 'artist' | 'year' | 'tracks' | 'added';

const albumSortSql: Record<AlbumSort, string> = {
  name: 'album COLLATE NOCASE ASC',
  artist: 'album_artist COLLATE NOCASE ASC, year, album COLLATE NOCASE',
  year: 'year IS NULL, year DESC, album COLLATE NOCASE',
  tracks: 'track_count DESC, album COLLATE NOCASE',
  added: 'added_at DESC',
};

/** All albums, or only those with a track in one group (an artist's albums, a year's). */
export function listAlbums(
  db: SQLiteDatabase,
  sort: AlbumSort = 'name',
  within?: { kind: GroupKind; value: string },
): Promise<AlbumSummary[]> {
  const filter = within ? `AND CAST(${groupColumn[within.kind]} AS TEXT) = ?` : '';
  return db.getAllAsync<AlbumSummary>(
    `SELECT album, COALESCE(album_artist, artist) AS album_artist, MAX(year) AS year,
            COUNT(*) AS track_count, MAX(art_key) AS art_key, MIN(id) AS first_track_id,
            MAX(added_at) AS added_at
     FROM tracks
     WHERE ${VISIBLE} AND album IS NOT NULL ${filter}
     GROUP BY album, COALESCE(album_artist, artist)
     ORDER BY ${albumSortSql[sort]}`,
    ...(within ? [within.value] : []),
  );
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

/** `LIKE` pattern for a substring match, with the user's own `%` and `_` taken literally. */
export function likePattern(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function searchTracks(db: SQLiteDatabase, query: string, limit = 100): Promise<Track[]> {
  const q = likePattern(query);
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks
     WHERE ${VISIBLE} AND (title LIKE ?1 ESCAPE '\\' OR artist LIKE ?1 ESCAPE '\\'
       OR album LIKE ?1 ESCAPE '\\' OR filename LIKE ?1 ESCAPE '\\')
     ORDER BY title COLLATE NOCASE LIMIT ?2`,
    q, limit,
  );
}

export function searchAlbums(db: SQLiteDatabase, query: string, limit = 20): Promise<AlbumSummary[]> {
  return db.getAllAsync<AlbumSummary>(
    `SELECT album, COALESCE(album_artist, artist) AS album_artist, MAX(year) AS year,
            COUNT(*) AS track_count, MAX(art_key) AS art_key, MIN(id) AS first_track_id,
            MAX(added_at) AS added_at
     FROM tracks
     WHERE ${VISIBLE} AND album LIKE ?1 ESCAPE '\\'
     GROUP BY album, COALESCE(album_artist, artist)
     ORDER BY album COLLATE NOCASE LIMIT ?2`,
    likePattern(query), limit,
  );
}

export function searchGroups(db: SQLiteDatabase, kind: GroupKind, query: string, limit = 20): Promise<GroupSummary[]> {
  const col = groupColumn[kind];
  return db.getAllAsync<GroupSummary>(
    `SELECT CAST(${col} AS TEXT) AS name, COUNT(*) AS track_count, COUNT(DISTINCT album) AS album_count,
            MAX(art_key) AS art_key, SUM(duration_ms) AS duration_ms
     FROM tracks
     WHERE ${VISIBLE} AND CAST(${col} AS TEXT) LIKE ?1 ESCAPE '\\'
     GROUP BY ${col}
     ORDER BY name COLLATE NOCASE LIMIT ?2`,
    likePattern(query), limit,
  );
}

/** Folders whose own name matches, not every folder beneath a match. */
export async function searchFolders(db: SQLiteDatabase, query: string, limit = 20): Promise<FolderEntry[]> {
  const rows = await db.getAllAsync<{ folder: string; n: number }>(
    `SELECT folder, COUNT(*) AS n FROM tracks
     WHERE ${VISIBLE} AND folder != '' AND folder LIKE ?1 ESCAPE '\\'
     GROUP BY folder ORDER BY folder COLLATE NOCASE`,
    likePattern(query),
  );
  const needle = query.trim().toLowerCase();
  return rows
    .map((r) => ({ path: r.folder, name: r.folder.slice(r.folder.lastIndexOf('/') + 1), track_count: r.n }))
    .filter((f) => f.name.toLowerCase().includes(needle))
    .slice(0, limit);
}
