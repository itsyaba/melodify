import type { SQLiteDatabase } from 'expo-sqlite';
import { getPrefs } from '@/prefs';
import { listMostPlayed as listPlayedSince, summarizeMostPlayed, type MostPlayed, type PlaySummary } from './plays';
import { ADDED_ORDER, addedPeriodCovers, countAddedPeriods, listAddedSince, type AddedPeriod } from './added';
import type { AlbumSummary, ArtistSummary, FolderEntry, GroupSummary, Track } from './types';

export type TrackSort = 'title' | 'artist' | 'album' | 'added' | 'played' | 'plays' | 'duration' | 'year' | 'filename';

const sortSql: Record<TrackSort, string> = {
  title: 'title COLLATE NOCASE ASC',
  artist: 'artist COLLATE NOCASE ASC, album COLLATE NOCASE ASC, disc_no, track_no',
  album: 'album COLLATE NOCASE ASC, disc_no, track_no',
  added: ADDED_ORDER,
  // Never-played tracks last, not first as a plain DESC on a nullable column would put them.
  played: 'last_played_at IS NULL, last_played_at DESC',
  plays: 'play_count DESC, title COLLATE NOCASE',
  duration: 'duration_ms DESC',
  year: 'year IS NULL, year DESC, album COLLATE NOCASE, disc_no, track_no',
  filename: 'path COLLATE NOCASE',
};

/**
 * What the library lists show: not hidden, and not shorter than the hide-short-songs setting.
 * A track whose duration is still unknown (tags not read yet) is shown. The threshold is a number
 * this app controls, so it is inlined rather than bound, which keeps every query's parameters
 * as they were.
 */
function visible(): string {
  const min = Math.max(0, Math.floor(getPrefs().minDurationMs));
  const long = min > 0 ? ` AND (duration_ms IS NULL OR duration_ms >= ${min})` : '';
  return `hidden = 0${long} AND ${NOT_EXCLUDED}`;
}

/** Outside every excluded folder. Cheap: the table is empty or holds a handful of rows. */
const NOT_EXCLUDED = `NOT EXISTS (SELECT 1 FROM excluded_folders e
  WHERE tracks.folder = e.folder OR substr(tracks.folder, 1, length(e.folder) + 1) = e.folder || '/')`;

export function listTracks(db: SQLiteDatabase, sort: TrackSort = 'title'): Promise<Track[]> {
  return db.getAllAsync<Track>(`SELECT * FROM tracks WHERE ${visible()} ORDER BY ${sortSql[sort]}`);
}

export function getTrack(db: SQLiteDatabase, id: number): Promise<Track | null> {
  return db.getFirstAsync<Track>('SELECT * FROM tracks WHERE id = ?', id);
}

export function countTracks(db: SQLiteDatabase): Promise<number> {
  return db
    .getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM tracks WHERE ${visible()}`)
    .then((r) => r?.n ?? 0);
}

export interface LibraryOverview {
  songs: number;
  albums: number;
  artists: number;
  bytes: number;
  durationMs: number;
}

/** What the library lists add up to, for the top of Import and scan. Albums group as `listAlbums` does. */
export async function libraryOverview(db: SQLiteDatabase): Promise<LibraryOverview> {
  const row = await db.getFirstAsync<LibraryOverview>(
    `SELECT COUNT(*) AS songs,
            COUNT(DISTINCT CASE WHEN album IS NOT NULL THEN album || char(0) || COALESCE(album_artist, artist, '') END) AS albums,
            COUNT(DISTINCT artist) AS artists,
            COALESCE(SUM(size), 0) AS bytes,
            COALESCE(SUM(duration_ms), 0) AS durationMs
     FROM tracks WHERE ${visible()}`,
  );
  return row ?? { songs: 0, albums: 0, artists: 0, bytes: 0, durationMs: 0 };
}

/**
 * A few covers that stand for the whole library, for the All songs card: the albums played most,
 * then the newest, one cover each. A library never played still gets its latest covers.
 */
export async function libraryCovers(db: SQLiteDatabase, limit: number): Promise<string[]> {
  const rows = await db.getAllAsync<{ art_key: string }>(
    `SELECT art_key FROM tracks WHERE ${visible()} AND art_key IS NOT NULL
     GROUP BY art_key
     ORDER BY SUM(play_count) DESC, MAX(added_at) DESC
     LIMIT ?`,
    limit,
  );
  return rows.map((r) => r.art_key);
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
    WHERE ${visible()} AND ${col} IS NOT NULL AND ${col} != ''
    GROUP BY ${col}
    ORDER BY ${order}
  `);
}

/**
 * The artists played most, for the rail at the top of the Artists tab. Artists with no plays yet
 * are left out, so a library that has never been played shows no rail at all.
 */
export function listTopArtists(db: SQLiteDatabase, limit = 10): Promise<ArtistSummary[]> {
  return db.getAllAsync<ArtistSummary>(
    `SELECT CAST(artist AS TEXT) AS name, COUNT(*) AS track_count, COUNT(DISTINCT album) AS album_count,
            MAX(art_key) AS art_key, SUM(duration_ms) AS duration_ms, SUM(play_count) AS plays
     FROM tracks
     WHERE ${visible()} AND artist IS NOT NULL AND artist != ''
     GROUP BY artist
     HAVING plays > 0
     ORDER BY plays DESC, track_count DESC, name COLLATE NOCASE
     LIMIT ?`,
    limit,
  );
}

/** Every track in one group, album by album. `value` is the group's `name` as listed. */
export function listGroupTracks(db: SQLiteDatabase, kind: GroupKind, value: string): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${visible()} AND CAST(${groupColumn[kind]} AS TEXT) = ?
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
     WHERE ${visible()} AND album IS NOT NULL ${filter}
     GROUP BY album, COALESCE(album_artist, artist)
     ORDER BY ${albumSortSql[sort]}`,
    ...(within ? [within.value] : []),
  );
}

export function listAlbumTracks(db: SQLiteDatabase, album: string, albumArtist: string | null): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks
     WHERE ${visible()} AND album = ? AND COALESCE(album_artist, artist) IS ?
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
     WHERE ${visible()} AND folder != ? AND substr(folder, 1, ?) = ?
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
    `SELECT * FROM tracks WHERE ${visible()} AND folder = ? ORDER BY disc_no, track_no, filename COLLATE NOCASE`,
    folder,
  );
  return { folders, tracks };
}

export function listFolderTracksRecursive(db: SQLiteDatabase, folder: string): Promise<Track[]> {
  const prefix = folder === '' ? '' : `${folder}/`;
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${visible()} AND (folder = ? OR substr(folder, 1, ?) = ?)
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
     WHERE ${visible()} AND (title LIKE ?1 ESCAPE '\\' OR artist LIKE ?1 ESCAPE '\\'
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
     WHERE ${visible()} AND album LIKE ?1 ESCAPE '\\'
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
     WHERE ${visible()} AND CAST(${col} AS TEXT) LIKE ?1 ESCAPE '\\'
     GROUP BY ${col}
     ORDER BY name COLLATE NOCASE LIMIT ?2`,
    likePattern(query), limit,
  );
}

/** Folders whose own name matches, not every folder beneath a match. */
export async function searchFolders(db: SQLiteDatabase, query: string, limit = 20): Promise<FolderEntry[]> {
  const rows = await db.getAllAsync<{ folder: string; n: number }>(
    `SELECT folder, COUNT(*) AS n FROM tracks
     WHERE ${visible()} AND folder != '' AND folder LIKE ?1 ESCAPE '\\'
     GROUP BY folder ORDER BY folder COLLATE NOCASE`,
    likePattern(query),
  );
  const needle = query.trim().toLowerCase();
  return rows
    .map((r) => ({ path: r.folder, name: r.folder.slice(r.folder.lastIndexOf('/') + 1), track_count: r.n }))
    .filter((f) => f.name.toLowerCase().includes(needle))
    .slice(0, limit);
}

/** Every folder that holds a song directly, for Search to find by name. */
export function listSongFolders(db: SQLiteDatabase): Promise<FolderEntry[]> {
  return searchFolders(db, '', Number.MAX_SAFE_INTEGER);
}

/** A month: an album played more recently than this is not one to rediscover. */
const REDISCOVER_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Albums with art that have not been played for a month or ever, in a random order. */
export function listDiscoverAlbums(db: SQLiteDatabase, limit = 10, now = Date.now()): Promise<AlbumSummary[]> {
  return db.getAllAsync<AlbumSummary>(
    `SELECT album, COALESCE(album_artist, artist) AS album_artist, MAX(year) AS year,
            COUNT(*) AS track_count, MAX(art_key) AS art_key, MIN(id) AS first_track_id,
            MAX(added_at) AS added_at
     FROM tracks
     WHERE ${visible()} AND album IS NOT NULL AND album != ''
     GROUP BY album, COALESCE(album_artist, artist)
     HAVING MAX(art_key) IS NOT NULL AND COALESCE(MAX(last_played_at), 0) < ?
     ORDER BY RANDOM() LIMIT ?`,
    now - REDISCOVER_AFTER_MS,
    limit,
  );
}

/** The built-in playlists, filled by queries rather than by hand. */
export type AutoPlaylist = 'favorites' | 'recently_added' | 'most_played' | 'recently_played';

/** Long enough to be useful, short enough that a big library's list opens at once. */
const AUTO_LIMIT = 300;

const AUTO_WHERE: Record<AutoPlaylist, string> = {
  favorites: 'favorite = 1',
  recently_added: '1',
  most_played: 'play_count > 0',
  recently_played: 'last_played_at IS NOT NULL',
};

const AUTO_ORDER: Record<AutoPlaylist, string> = {
  favorites: 'title COLLATE NOCASE',
  recently_added: ADDED_ORDER,
  most_played: 'play_count DESC, last_played_at DESC',
  recently_played: 'last_played_at DESC',
};

/** Favorites are the only built-in list with no cap; -1 is SQLite's "no limit". */
const autoLimit = (kind: AutoPlaylist) => (kind === 'favorites' ? -1 : AUTO_LIMIT);

/** The list, or only its first `limit` songs (Home's recently played rows). */
export function listAutoPlaylist(db: SQLiteDatabase, kind: AutoPlaylist, limit = autoLimit(kind)): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${visible()} AND ${AUTO_WHERE[kind]} ORDER BY ${AUTO_ORDER[kind]} LIMIT ?`,
    limit,
  );
}

export interface AutoPlaylistSummary {
  /** From the song that tops the list; null while it is empty or none of its songs has art. */
  art_key: string | null;
  /** Songs the list opens with, so capped as the list is. */
  count: number;
  duration_ms: number;
}

/** A cover, a count and a length for each built-in playlist, for Home's cards. */
export async function autoPlaylistSummaries(db: SQLiteDatabase): Promise<Record<AutoPlaylist, AutoPlaylistSummary>> {
  const kinds = Object.keys(AUTO_WHERE) as AutoPlaylist[];
  const rows = await Promise.all(
    kinds.map((kind) => {
      const where = `${visible()} AND ${AUTO_WHERE[kind]}`;
      return db.getFirstAsync<AutoPlaylistSummary>(
        `SELECT (SELECT art_key FROM tracks WHERE ${where} AND art_key IS NOT NULL ORDER BY ${AUTO_ORDER[kind]} LIMIT 1) AS art_key,
                COUNT(*) AS count, COALESCE(SUM(duration_ms), 0) AS duration_ms
         FROM (SELECT duration_ms FROM tracks WHERE ${where} ORDER BY ${AUTO_ORDER[kind]} LIMIT ?)`,
        autoLimit(kind),
      );
    }),
  );
  return Object.fromEntries(
    kinds.map((kind, i) => [kind, rows[i] ?? { art_key: null, count: 0, duration_ms: 0 }]),
  ) as Record<AutoPlaylist, AutoPlaylistSummary>;
}

/** Recently added over a span of days, or every song for null; see `db/added.ts`. */
export function listRecentlyAdded(db: SQLiteDatabase, days: number | null): Promise<Track[]> {
  return listAddedSince(db, visible(), days);
}

/** How many songs Recently added holds over each of its spans, and the newest covers in each. */
export async function summarizeRecentlyAdded(
  db: SQLiteDatabase,
): Promise<{ counts: Record<AddedPeriod, number>; covers: Record<AddedPeriod, string[]> }> {
  const now = Date.now();
  const [counts, covers] = await Promise.all([countAddedPeriods(db, visible(), now), addedPeriodCovers(db, visible(), now)]);
  return { counts, covers };
}

/** Most played over a span of days, or all time for null, with each song's plays; see `db/plays.ts`. */
export function listMostPlayed(db: SQLiteDatabase, days: number | null): Promise<MostPlayed> {
  return listPlayedSince(db, visible(), days);
}

/** How many songs were played over each of Most played's spans, and the top covers in each. */
export function summarizePlays(db: SQLiteDatabase): Promise<PlaySummary> {
  return summarizeMostPlayed(db, visible());
}

export function listHiddenTracks(db: SQLiteDatabase): Promise<Track[]> {
  return db.getAllAsync<Track>('SELECT * FROM tracks WHERE hidden = 1 ORDER BY title COLLATE NOCASE');
}

export async function setFavorite(db: SQLiteDatabase, id: number, favorite: boolean): Promise<void> {
  await db.runAsync('UPDATE tracks SET favorite = ? WHERE id = ?', favorite ? 1 : 0, id);
}

export async function setHidden(db: SQLiteDatabase, ids: number[], hidden: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE tracks SET hidden = ? WHERE id IN (SELECT value FROM json_each(?))',
    hidden ? 1 : 0,
    JSON.stringify(ids),
  );
}

export async function recordPlay(db: SQLiteDatabase, id: number, at: number): Promise<void> {
  await db.runAsync('UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE id = ?', at, id);
  await db.runAsync('INSERT INTO plays (track_id, played_at) VALUES (?, ?)', id, at);
}

/** A song passed over with next before it counted as played. */
export async function recordSkip(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('UPDATE tracks SET skip_count = skip_count + 1 WHERE id = ?', id);
}

/** Null clears it, for a track played to the end. */
export async function setResumeMs(db: SQLiteDatabase, id: number, ms: number | null): Promise<void> {
  await db.runAsync('UPDATE tracks SET resume_ms = ? WHERE id = ?', ms === null ? null : Math.round(ms), id);
}

/** Removes rows (the file itself is the caller's business). Queues and playlists cascade. */
export async function deleteTrackRows(db: SQLiteDatabase, ids: number[]): Promise<void> {
  await db.runAsync('DELETE FROM tracks WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids));
}
