import { strFromU8, strToU8 } from 'fflate';
import { MAX_QUEUES } from '@/db/queues';
import { RECENT_SEARCHES } from '@/db/settings';
import {
  BackupError,
  parseBackup,
  type Backup,
  type BackupPlaylist,
  type BackupQueue,
  type BackupSource,
  type BackupTrack,
} from './format';
import { JavaListError, readJavaStringList, writeJavaStringList } from './java-list';
import { jsCodec, type Codec } from './codec';
import { readZip, unzipEntry, writeZip, zipEntry, ZipError, type ZipEntry } from './zip';

/**
 * Musicolet's backup file, read and written. Melodify's own backups are in the same format, so
 * one file restores in either app.
 *
 * A backup is a zip. Every member but `hash` is encrypted with Blowfish in ECB mode, PKCS5
 * padded, under a key built into Musicolet:
 *
 * | Member | What it holds |
 * | --- | --- |
 * | `0.musicolet.backup` | JSON manifest: `v` (Musicolet's version code), `time` (ms), `md5` (member → md5 of its decrypted bytes), `equalizer`, `db_file`, `DB_BDN`, `pcs` (the play count files) |
 * | `hash` | Not encrypted: the md5, in hex, of the decrypted manifest |
 * | `DB_SONGS_LOG` | SQLite, `user_version` 8: `TABLE_SONGS`, one row per song, keyed by `COL_PATH` (see `SONGS_TABLE`) |
 * | `0.favs`, `<name>.mpl` | JSON parallel arrays: `S_P` paths, `S_T` titles, `S_AL` albums, `S_AR` artists, `S_D` lengths in ms |
 * | `0.names` | The playlist names in order, as a Java-serialized `ArrayList<String>` |
 * | `0.qstk` | JSON queues: `S0_CPQ` the playing one; per queue `S0_PQ_T` name, `S0_PQ_OQS.S_P` songs, `S0_PQ_SI` the order they play in (a permutation of those), `S0_PQ_CPS` the current place in that order, `S0_PQ_LKP` the position in ms |
 * | `PP`, `USP`, `OMV`, `RPN`, `SSP` | Preferences, as JSON `[{key, value, type}]`. `SSP`'s `SQH` is the search history, `PP`'s `S_PTH_SCN_J` the excluded folders |
 * | `DB_BDN`, `PCs_{W,M,Y}_*` | SQLite: Bluetooth device names for per-device equalizers, and play counts per week, month and year |
 *
 * A Musicolet path (`COL_PATH`) is a `musicolet://media-store?p_v=<volume>&p_rp=<folder>&p_dn=<file>&p_id=<media store id>&p_mt=1`
 * URI, or in older backups a `file:///storage/...` URI. `COL_LOGPATH` spells the same file out as
 * `Storage/<volume>/<folder>/<file>`, and is what Melodify's paths are made from.
 *
 * Melodify writes every member it knows, plus `melodify.json`: its own backup, unencrypted and not
 * in the manifest, so Musicolet ignores it and Melodify restores bookmarks, skip counts and its
 * own settings from it. What only Musicolet uses (its preferences, device names, play counts per
 * period) is kept from the last Musicolet backup restored, and written back unchanged.
 */

const KEY = strToU8('JSTMUSIC_2');
const MANIFEST = '0.musicolet.backup';
const HASH = 'hash';
const SONGS_DB = 'DB_SONGS_LOG';
const DEVICES_DB = 'DB_BDN';
const FAVORITES = '0.favs';
const NAMES = '0.names';
const QUEUES = '0.qstk';
const SEARCHES = 'SSP';
const MELODIFY = 'melodify.json';
const PREFERENCE_FILES = ['PP', 'RPN', 'USP', 'OMV'];
const PLAYLIST_EXT = '.mpl';
/** Musicolet 6.x, the version the format was read from. */
const DEFAULT_VERSION = 540;
const DEFAULT_EQUALIZER = { numberOfBands: 5, bandLevelRange0: -1500, bandLevelRange1: 1500 };
/** What Musicolet writes for a tag a file does not have. */
const UNKNOWN = '<unknown>';

export const SONGS_TABLE = `CREATE TABLE TABLE_SONGS ( COL_PATH TEXT primary key, COL_TITLE TEXT COLLATE NOCASE, COL_ARTIST TEXT COLLATE NOCASE, COL_ALBUM TEXT COLLATE NOCASE, COL_GENRE TEXT COLLATE NOCASE, COL_COMPOSER TEXT, COL_YEAR INTEGER, COL_DURATION INTEGER, COL_TRACK_NO INTEGER, COL_DATE_ADDED INTEGER, COL_DATE_MODIFIED INTEGER, COL_NUM_PLAYED INTEGER DEFAULT 0, COL_LAST_PLAYED INTEGER DEFAULT 0, COL_LASTPOS INTEGER DEFAULT 0, album_artist TEXT COLLATE NOCASE, COL_NUM_PLAYED_W INTEGER DEFAULT 0, COL_NUM_PLAYED_M INTEGER DEFAULT 0, COL_NUM_PLAYED_Y INTEGER DEFAULT 0, COL_VIS_FLAGS INTEGER DEFAULT 0, COL_RATING INTEGER DEFAULT 0, COL_ENDPOINTS INTEGER DEFAULT 0, COL_GAINS TEXT, COL_LOGPATH TEXT, COL_EIJ TEXT )`;
const SONG_COLUMNS = [
  'COL_PATH', 'COL_TITLE', 'COL_ARTIST', 'COL_ALBUM', 'COL_GENRE', 'COL_COMPOSER', 'COL_YEAR', 'COL_DURATION',
  'COL_TRACK_NO', 'COL_DATE_ADDED', 'COL_DATE_MODIFIED', 'COL_NUM_PLAYED', 'COL_LAST_PLAYED', 'COL_LASTPOS',
  'album_artist', 'COL_NUM_PLAYED_W', 'COL_NUM_PLAYED_M', 'COL_NUM_PLAYED_Y', 'COL_VIS_FLAGS', 'COL_RATING',
  'COL_ENDPOINTS', 'COL_GAINS', 'COL_LOGPATH', 'COL_EIJ',
] as const;
const DEVICES_TABLE =
  'CREATE TABLE TABLE_DEVICES (COL_ID INTEGER PRIMARY KEY AUTOINCREMENT, COL_NAME TEXT NOT NULL UNIQUE COLLATE NOCASE,COL_TYPE INTEGER NOT NULL DEFAULT 0 )';

export type SqlValue = string | number | null;
export type SongRow = Record<string, SqlValue>;

/** How SQLite files are opened and made: through expo-sqlite in the app, Node's SQLite in tests. */
export interface SqliteFiles {
  /** Every row `sql` returns from the database file `file`. */
  rows(file: Uint8Array, sql: string): Promise<SongRow[]>;
  /** Runs `statements` on a new, empty database and returns its file. */
  build(statements: { sql: string; params?: SqlValue[] }[]): Promise<Uint8Array>;
}

/** A member Melodify does not read, as it was in the zip: still compressed and encrypted. */
export interface CarriedFile extends ZipEntry {
  /** Of the decrypted contents, for the manifest. */
  md5: string;
}

export interface MusicoletMeta {
  v: number;
  equalizer: unknown;
  locale: string;
}

/**
 * Musicolet's own data, kept so a backup written for it gives back what it had. `songs` is its
 * songs table by `COL_PATH`, each row with the library song it was matched to, if any.
 */
export interface MusicoletCarry {
  songs: { uri: string; path: string | null; row: SongRow }[];
  files: CarriedFile[];
  meta: MusicoletMeta;
}

export const EMPTY_CARRY: MusicoletCarry = {
  songs: [],
  files: [],
  meta: { v: DEFAULT_VERSION, equalizer: DEFAULT_EQUALIZER, locale: 'en_US' },
};

/** Lets the screen draw between the slow steps: all of this runs on the JS thread. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Paths.

const STORAGE_PREFIX = /^Storage\/[^/]+\//;
const DEVICE_PREFIX = /^\/?(storage\/emulated\/\d+|storage\/[^/]+|sdcard)\//;

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** A `musicolet://` URI's query, by hand: RN's URLSearchParams is not the web's. */
function queryOf(uri: string): Map<string, string> {
  const params = new Map<string, string>();
  const q = uri.indexOf('?');
  if (q === -1) return params;
  for (const pair of uri.slice(q + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) params.set(pair.slice(0, eq), decode(pair.slice(eq + 1)));
  }
  return params;
}

/**
 * The path inside the phone's storage, which is the best guess at the path inside Melodify's music
 * folder: `Music/Band/Song.mp3`, whatever the volume. Matching then finds songs that sit in
 * another folder on the iPhone.
 */
export function androidToPath(uri: string, logPath?: string | null): string {
  if (logPath && STORAGE_PREFIX.test(logPath)) return logPath.replace(STORAGE_PREFIX, '');
  if (uri.startsWith('file://')) return decode(uri.slice('file://'.length)).replace(DEVICE_PREFIX, '').replace(/^\/+/, '');
  if (uri.startsWith('musicolet://')) {
    const q = queryOf(uri);
    const folder = (q.get('p_rp') ?? '').replace(/^\/+|\/+$/g, '');
    const file = q.get('p_dn') ?? '';
    if (file) return folder ? `${folder}/${file}` : file;
  }
  return uri;
}

/**
 * Musicolet's path for a song it never had: the file at the same place in the phone's main
 * storage, as older Musicolet backups wrote paths.
 */
export function pathToAndroid(path: string): { uri: string; logPath: string } {
  return {
    uri: `file:///storage/emulated/0/${path.split('/').map(encodeURIComponent).join('/')}`,
    logPath: `Storage/primary/${path}`,
  };
}

// Reading.

export interface ReadResult {
  backup: Backup;
  from: 'melodify' | 'musicolet';
  carry: MusicoletCarry;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : []);
/** A tag, or undefined for Musicolet's "<unknown>" and empty ones. */
const tag = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' && v !== UNKNOWN ? v : undefined;
const positive = (v: unknown): number | undefined => (isNumber(v) && v > 0 ? Math.round(v) : undefined);

/**
 * An SQLite file as one that does not use a write-ahead log. Musicolet's databases are in WAL
 * mode (bytes 18 and 19 of the header), which an in-memory copy cannot be opened in. A backup is
 * a copy of the file alone, with no log beside it, so rollback mode reads the same pages.
 */
export function withoutWal(file: Uint8Array): Uint8Array {
  if (file.length < 100 || (file[18] !== 2 && file[19] !== 2)) return file;
  const copy = file.slice();
  copy[18] = 1;
  copy[19] = 1;
  return copy;
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new BackupError(`This backup is damaged: ${name} is not readable.`);
  }
}

/** A zip of a Musicolet or Melodify backup. Rejects with `BackupError`, with a message fit to show. */
export async function readBackupZip(zip: Uint8Array, sql: SqliteFiles, codec: Codec = jsCodec): Promise<ReadResult> {
  let members: Map<string, ZipEntry>;
  try {
    members = readZip(zip);
  } catch {
    throw new BackupError('This file is not a backup: the zip cannot be opened.');
  }
  if (!members.has(MANIFEST)) throw new BackupError('This zip is not a Musicolet or Melodify backup.');

  const unpack = async (name: string): Promise<Uint8Array> => {
    try {
      return await unzipEntry(members.get(name)!, codec);
    } catch (err) {
      if (err instanceof ZipError) throw new BackupError(`This backup is damaged: ${err.message}`);
      throw err;
    }
  };
  const decrypt = async (name: string): Promise<Uint8Array> => {
    const sealed = await unpack(name);
    try {
      return await codec.blowfish(sealed, KEY, false);
    } catch {
      throw new BackupError(`This backup is damaged: ${name} cannot be decrypted.`);
    }
  };
  const manifestBytes = await decrypt(MANIFEST);
  const manifest = parseJson(await codec.text(manifestBytes), 'the manifest');
  if (!isObject(manifest)) throw new BackupError('This backup is damaged: the manifest is not readable.');
  if (members.has(HASH) && strFromU8(await unpack(HASH)).trim() !== (await codec.md5(manifestBytes))) {
    throw new BackupError('This backup is damaged: the manifest does not match its checksum.');
  }
  const sums = isObject(manifest.md5) ? manifest.md5 : {};
  /** A member's decrypted contents, checked against the manifest; null when it is not there. */
  const open = async (name: string): Promise<Uint8Array | null> => {
    if (!members.has(name)) return null;
    const bytes = await decrypt(name);
    const sum = sums[name];
    if (typeof sum === 'string' && sum !== (await codec.md5(bytes))) {
      throw new BackupError(`This backup is damaged: ${name} does not match its checksum.`);
    }
    return bytes;
  };

  const songsName = typeof manifest.db_file === 'string' ? manifest.db_file : SONGS_DB;
  const opened = await open(songsName);
  const songsFile = opened && withoutWal(opened);
  await breathe();
  let songRows: SongRow[] = [];
  let locale = EMPTY_CARRY.meta.locale;
  if (songsFile && songsFile.length) {
    try {
      songRows = await sql.rows(songsFile, 'SELECT * FROM TABLE_SONGS');
      const [meta] = await sql.rows(songsFile, 'SELECT locale FROM android_metadata LIMIT 1');
      if (typeof meta?.locale === 'string') locale = meta.locale;
    } catch {
      throw new BackupError('This backup is damaged: its song list cannot be read.');
    }
  }

  const known = new Set([MANIFEST, HASH, songsName, FAVORITES, NAMES, QUEUES, SEARCHES, MELODIFY]);
  const carry: MusicoletCarry = {
    songs: songRows.flatMap((r) => {
      if (typeof r.COL_PATH !== 'string' || !r.COL_PATH) return [];
      const { COL_PATH: uri, ...row } = r;
      return [{ uri, path: null, row }];
    }),
    // Only members the manifest vouches for. Their contents are not needed, so not unpacked.
    files: [...members.values()]
      .filter((e) => !known.has(e.name) && !e.name.endsWith(PLAYLIST_EXT) && typeof sums[e.name] === 'string')
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      // Copies: each is a view into the whole zip, which would otherwise be kept, or stored, with it.
      .map((e) => ({ ...e, data: e.data.slice(), md5: sums[e.name] as string })),
    meta: {
      v: isNumber(manifest.v) ? manifest.v : DEFAULT_VERSION,
      equalizer: isObject(manifest.equalizer) ? manifest.equalizer : DEFAULT_EQUALIZER,
      locale,
    },
  };

  if (members.has(MELODIFY)) {
    return { backup: parseBackup(await codec.text(await unpack(MELODIFY))), from: 'melodify', carry };
  }

  // Everything else Melodify reads, opened up front so the conversion itself can be synchronous.
  const names = [...members.keys()];
  const parsed = new Map<string, unknown>();
  for (const name of names) {
    if (![FAVORITES, QUEUES, SEARCHES, 'PP'].includes(name) && !name.endsWith(PLAYLIST_EXT)) continue;
    const bytes = await open(name);
    if (bytes) parsed.set(name, parseJson(await codec.text(bytes), name));
  }
  const read: Musicolet = {
    json: (name) => parsed.get(name),
    playlistNames: await open(NAMES),
    names,
  };
  await breathe();
  const backup = fromMusicolet(songRows, read, isNumber(manifest.time) ? manifest.time : 0);
  return { backup, from: 'musicolet', carry };
}

interface SongList {
  paths: string[];
  titles: string[];
  albums: string[];
  artists: string[];
  lengths: unknown[];
}

function songList(data: unknown): SongList {
  const o = isObject(data) ? data : {};
  return {
    paths: strings(o.S_P),
    titles: strings(o.S_T),
    albums: strings(o.S_AL),
    artists: strings(o.S_AR),
    lengths: Array.isArray(o.S_D) ? o.S_D : [],
  };
}

/** Musicolet's preferences file: its entries by key. */
function preferences(data: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!Array.isArray(data)) return out;
  for (const e of data) if (isObject(e) && typeof e.key === 'string') out.set(e.key, e.value);
  return out;
}

function jsonStrings(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const DAY_MS = 86_400_000;

/**
 * Dates for a song's plays from Musicolet's counts over the last week, month and year before
 * `until` (the backup's time). Musicolet keeps no single plays, so each span's plays are spread
 * evenly over the part of it the shorter span leaves, and none comes after the song's last play.
 * Plays older than a year stay in the total alone.
 */
export function datePlays(r: SongRow, until: number): number[] {
  if (!until) return [];
  // Each counter is reset on its own, so a week can hold more than a month that just began: a
  // longer span holds at least the shorter one's plays, and none more than the total.
  const total = positive(r.COL_NUM_PLAYED) ?? 0;
  const week = Math.min(positive(r.COL_NUM_PLAYED_W) ?? 0, total);
  const month = Math.min(Math.max(positive(r.COL_NUM_PLAYED_M) ?? 0, week), total);
  const year = Math.min(Math.max(positive(r.COL_NUM_PLAYED_Y) ?? 0, month), total);
  const last = positive(r.COL_LAST_PLAYED);
  const out: number[] = [];
  const spread = (count: number, fromDays: number, toDays: number) => {
    const start = until - toDays * DAY_MS;
    let end = until - fromDays * DAY_MS;
    if (last !== undefined && last > start && last < end) end = last;
    for (let i = 0; i < count; i++) out.push(Math.round(end - ((i + 0.5) * (end - start)) / count));
  };
  spread(week, 0, 7);
  spread(month - week, 7, 30);
  spread(year - month, 30, 365);
  return out;
}

/** The members `fromMusicolet` reads, already decrypted and checked. */
interface Musicolet {
  /** A JSON member, parsed; undefined when it is not there. */
  json(name: string): unknown;
  /** `0.names`, still serialized. */
  playlistNames: Uint8Array | null;
  /** Every member's name. */
  names: string[];
}

function fromMusicolet(rows: SongRow[], members: Musicolet, createdAt: number): Backup {
  const tracks: BackupTrack[] = [];
  const indexOf = new Map<string, number>();

  // Musicolet can hold one file twice: a stale row with its plays and a fresh one without. The
  // restore matches one song to one row, first come, so the one with the plays comes first.
  const plays = (r: SongRow) => (isNumber(r.COL_NUM_PLAYED) ? r.COL_NUM_PLAYED : 0);
  // A backup without its time counts back from its last play.
  const newestPlay = rows.reduce((max, r) => Math.max(max, positive(r.COL_LAST_PLAYED) ?? 0), 0);
  for (const r of [...rows].sort((a, b) => plays(b) - plays(a))) {
    const uri = r.COL_PATH;
    if (typeof uri !== 'string' || !uri || indexOf.has(uri)) continue;
    const path = androidToPath(uri, typeof r.COL_LOGPATH === 'string' ? r.COL_LOGPATH : null);
    const t: BackupTrack = { path, title: tag(r.COL_TITLE) ?? '', android: uri };
    const artist = tag(r.COL_ARTIST);
    const album = tag(r.COL_ALBUM);
    if (artist) t.artist = artist;
    if (album) t.album = album;
    const set = (key: 'durationMs' | 'playCount' | 'lastPlayedAt' | 'resumeMs' | 'addedAt', v: unknown) => {
      const n = positive(v);
      if (n !== undefined) t[key] = n;
    };
    set('durationMs', r.COL_DURATION);
    set('playCount', r.COL_NUM_PLAYED);
    set('lastPlayedAt', r.COL_LAST_PLAYED);
    set('resumeMs', r.COL_LASTPOS);
    set('addedAt', r.COL_DATE_ADDED);
    const playedAt = datePlays(r, createdAt || newestPlay);
    if (playedAt.length) t.playedAt = playedAt;
    indexOf.set(uri, tracks.length);
    tracks.push(t);
  }

  /** A song a list names; one the songs table does not have is added, with the list's tags. */
  const songAt = (list: SongList, i: number): number | null => {
    const uri = list.paths[i];
    if (!uri) return null;
    const known = indexOf.get(uri);
    if (known !== undefined) return known;
    const t: BackupTrack = { path: androidToPath(uri), title: tag(list.titles[i]) ?? '', android: uri };
    const artist = tag(list.artists[i]);
    const album = tag(list.albums[i]);
    if (artist) t.artist = artist;
    if (album) t.album = album;
    const length = positive(list.lengths[i]);
    if (length !== undefined) t.durationMs = length;
    indexOf.set(uri, tracks.length);
    tracks.push(t);
    return tracks.length - 1;
  };
  const indexes = (list: SongList): number[] =>
    list.paths.flatMap((_, i) => {
      const at = songAt(list, i);
      return at === null ? [] : [at];
    });

  for (const i of indexes(songList(members.json(FAVORITES)))) tracks[i].favorite = true;

  // Playlists in Musicolet's order, then any file the list of names leaves out.
  let order: string[] = [];
  if (members.playlistNames) {
    try {
      order = readJavaStringList(members.playlistNames);
    } catch (err) {
      if (!(err instanceof JavaListError)) throw err;
    }
  }
  const files = members.names.filter((n) => n.endsWith(PLAYLIST_EXT)).map((n) => n.slice(0, -PLAYLIST_EXT.length));
  const playlistNames = [...new Set([...order.filter((n) => files.includes(n)), ...files.sort()])];
  const playlists = playlistNames.flatMap((name): BackupPlaylist[] => {
    const data = members.json(name + PLAYLIST_EXT);
    if (data === undefined) return [];
    return [{ name, createdAt: 0, updatedAt: 0, tracks: indexes(songList(data)) }];
  });

  const queues: BackupQueue[] = [];
  let activeQueue = 0;
  const data = members.json(QUEUES);
  if (data !== undefined) {
    const list = isObject(data) && Array.isArray(data.S0_PQ) ? data.S0_PQ.filter(isObject) : [];
    for (const q of list.slice(0, MAX_QUEUES)) {
      const songs = songList(isObject(q.S0_PQ_OQS) ? q.S0_PQ_OQS : {});
      const all = songs.paths.map((_, i) => songAt(songs, i));
      // The songs in the order they play: through the shuffle order when it is a whole one.
      const shuffle = Array.isArray(q.S0_PQ_SI) ? q.S0_PQ_SI : [];
      const whole =
        shuffle.length === all.length &&
        new Set(shuffle.filter((j) => Number.isInteger(j) && j >= 0 && j < all.length)).size === all.length;
      const played = whole ? (shuffle as number[]).map((j) => all[j]) : all;
      // Missing entries go, and the current place moves back with them.
      const at = isNumber(q.S0_PQ_CPS) ? Math.max(0, Math.round(q.S0_PQ_CPS)) : 0;
      const kept: number[] = [];
      let current = -1;
      played.forEach((i, place) => {
        if (i === null) return;
        if (current === -1 && place >= at) current = kept.length;
        kept.push(i);
      });
      if (current === -1) current = kept.length - 1;
      queues.push({
        name: typeof q.S0_PQ_T === 'string' && q.S0_PQ_T ? q.S0_PQ_T : `Queue ${queues.length + 1}`,
        currentIndex: current,
        currentMs: positive(q.S0_PQ_LKP) ?? 0,
        repeat: 'off',
        tracks: kept,
      });
    }
    if (isObject(data) && isNumber(data.S0_CPQ) && data.S0_CPQ >= 0 && data.S0_CPQ < queues.length) {
      activeQueue = Math.round(data.S0_CPQ);
    }
  }

  const excluded = jsonStrings(preferences(members.json('PP')).get('S_PTH_SCN_J'))
    .map((f) => f.replace(STORAGE_PREFIX, '').replace(/\/+$/, ''))
    .filter((f) => f !== '');
  const searches = jsonStrings(preferences(members.json(SEARCHES)).get('SQH')).slice(0, RECENT_SEARCHES);

  return {
    app: 'melodify',
    format: 1,
    createdAt,
    reason: 'manual',
    tracks,
    playlists,
    queues,
    activeQueue,
    bookmarks: [],
    excludedFolders: [...new Set(excluded)],
    settings: { recentSearches: searches },
  };
}

// Writing.

/** A playlist name as a member's file name, unique among the rest, case aside. */
function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = raw.replace(/[/\\]/g, '_').trim() || 'Playlist';
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

const orUnknown = (v: string | null | undefined): string => (v ? v : UNKNOWN);

/**
 * Writes `backup` (built from `source`, whose tracks it follows index for index) as a zip both apps
 * restore. `carry` is what was kept of the last Musicolet backup restored.
 */
export async function writeBackupZip(
  source: BackupSource,
  backup: Backup,
  carry: MusicoletCarry,
  sql: SqliteFiles,
  codec: Codec = jsCodec,
): Promise<Uint8Array> {
  const now = backup.createdAt;
  const bySongPath = new Map<string, MusicoletCarry['songs'][number]>();
  const byUri = new Map<string, MusicoletCarry['songs'][number]>();
  for (const s of carry.songs) {
    byUri.set(s.uri, s);
    if (s.path !== null) bySongPath.set(s.path, s);
  }

  // Each library song's Musicolet path: the one it had, or one made from its own.
  const used = new Set<string>();
  const uris = source.tracks.map((t) => {
    const had = t.android_uri ?? bySongPath.get(t.path)?.uri;
    const uri = had && !used.has(had) ? had : pathToAndroid(t.path).uri;
    used.add(uri);
    return uri;
  });

  const songRows: SongRow[] = source.tracks.map((t, i) => {
    const kept = byUri.get(uris[i])?.row ?? {};
    // Melodify's tag when it has one (it may have been edited here); else Musicolet's, blank or
    // not; else what Musicolet writes for a song without it.
    const had = (key: string, fallback: SqlValue): SqlValue => (key in kept ? kept[key] : fallback);
    const pick = (mine: SqlValue | undefined, key: string, fallback: SqlValue): SqlValue =>
      mine !== null && mine !== undefined && mine !== '' ? mine : had(key, fallback);
    return {
      COL_NUM_PLAYED_W: 0,
      COL_NUM_PLAYED_M: 0,
      COL_NUM_PLAYED_Y: 0,
      COL_VIS_FLAGS: 0,
      COL_RATING: 0,
      COL_ENDPOINTS: 0,
      COL_GAINS: null,
      COL_EIJ: null,
      ...kept,
      COL_PATH: uris[i],
      COL_TITLE: pick(t.title, 'COL_TITLE', null),
      COL_ARTIST: pick(t.artist, 'COL_ARTIST', UNKNOWN),
      COL_ALBUM: pick(t.album, 'COL_ALBUM', UNKNOWN),
      COL_GENRE: pick(t.genre, 'COL_GENRE', UNKNOWN),
      COL_COMPOSER: pick(t.composer, 'COL_COMPOSER', UNKNOWN),
      album_artist: pick(t.album_artist, 'album_artist', UNKNOWN),
      COL_YEAR: pick(t.year, 'COL_YEAR', 0),
      COL_TRACK_NO: pick(t.track_no, 'COL_TRACK_NO', 0),
      COL_DURATION: pick(t.duration_ms, 'COL_DURATION', 0),
      // Musicolet's dates are the Android files'; Melodify's are when they reached the iPhone.
      COL_DATE_ADDED: had('COL_DATE_ADDED', t.added_at || now),
      COL_DATE_MODIFIED: had('COL_DATE_MODIFIED', t.mtime || now),
      COL_NUM_PLAYED: t.play_count,
      COL_LAST_PLAYED: t.last_played_at ?? 0,
      COL_LASTPOS: t.resume_ms ?? 0,
      COL_LOGPATH: had('COL_LOGPATH', pathToAndroid(t.path).logPath),
    };
  });
  // Songs Musicolet knows that are not in this library go back as they came, stats and all.
  const libraryPaths = new Set(source.tracks.map((t) => t.path));
  for (const s of carry.songs) {
    if (used.has(s.uri) || (s.path !== null && libraryPaths.has(s.path))) continue;
    used.add(s.uri);
    songRows.push({ ...s.row, COL_PATH: s.uri });
  }

  const insert = `INSERT INTO TABLE_SONGS (${SONG_COLUMNS.join(', ')}) SELECT ${SONG_COLUMNS.map(
    (c) => `j.value ->> '${c}'`,
  ).join(', ')} FROM json_each(?) j`;
  const songsDb = await sql.build([
    { sql: 'CREATE TABLE android_metadata (locale TEXT)' },
    { sql: 'INSERT INTO android_metadata VALUES (?)', params: [carry.meta.locale] },
    { sql: SONGS_TABLE },
    { sql: insert, params: [JSON.stringify(songRows)] },
    { sql: 'PRAGMA user_version = 8' },
  ]);
  await breathe();

  const list = (indexes: number[]) => {
    const tracks = indexes.map((i) => source.tracks[i]);
    return strToU8(
      JSON.stringify({
        S_P: indexes.map((i) => uris[i]),
        S_T: tracks.map((t) => t.title),
        S_AL: tracks.map((t) => orUnknown(t.album)),
        S_AR: tracks.map((t) => orUnknown(t.artist)),
        S_D: tracks.map((t) => t.duration_ms ?? 0),
      }),
    );
  };

  // The members Melodify writes itself, before encryption.
  const plain: [string, Uint8Array][] = [];
  const names = uniqueNames(backup.playlists.map((p) => p.name));
  plain.push([NAMES, writeJavaStringList(names)]);
  plain.push([FAVORITES, list(backup.tracks.flatMap((t, i) => (t.favorite ? [i] : [])))]);
  backup.playlists.forEach((p, i) => plain.push([names[i] + PLAYLIST_EXT, list(p.tracks)]));

  const carried = new Set(carry.files.map((f) => f.name));
  const searches = backup.settings.recentSearches ?? [];
  plain.push([SEARCHES, strToU8(JSON.stringify([{ key: 'SQH', value: JSON.stringify(searches), type: 'String' }]))]);
  // Musicolet's own preferences, when none were kept: empty, which leaves Musicolet on its defaults.
  for (const name of PREFERENCE_FILES) if (!carried.has(name)) plain.push([name, strToU8('[]')]);
  plain.push([SONGS_DB, songsDb]);
  if (!carried.has(DEVICES_DB)) {
    plain.push([
      DEVICES_DB,
      await sql.build([
        { sql: 'CREATE TABLE android_metadata (locale TEXT)' },
        { sql: 'INSERT INTO android_metadata VALUES (?)', params: [carry.meta.locale] },
        { sql: DEVICES_TABLE },
        { sql: 'PRAGMA user_version = 1' },
      ]),
    ]);
  }
  plain.push([
    QUEUES,
    strToU8(
      JSON.stringify({
        S0_CPQ: backup.activeQueue,
        S0_PQ: backup.queues.map((q) => ({
          S0_PQ_T: q.name,
          S0_PQ_CPS: Math.max(0, q.currentIndex),
          S0_PQ_LKP: Math.round(q.currentMs),
          S0_PQ_OQS: { S_P: q.tracks.map((i) => uris[i]) },
          // Already in the order they play, so the same whether Musicolet's shuffle is on or off.
          S0_PQ_SI: q.tracks.map((_, i) => i),
        })),
      }),
    ),
  ]);

  const entries: ZipEntry[] = [];
  const md5: Record<string, string> = {};
  for (const [name, bytes] of plain) {
    md5[name] = await codec.md5(bytes);
    entries.push(await zipEntry(name, await codec.blowfish(bytes, KEY, true), codec));
    if (bytes.length > 256 * 1024) await breathe();
  }
  for (const f of carry.files) {
    md5[f.name] = f.md5;
    entries.push(f);
  }

  const manifest = strToU8(
    JSON.stringify({
      v: carry.meta.v,
      time: now,
      md5: orderedSums(md5),
      equalizer: carry.meta.equalizer,
      db_file: SONGS_DB,
      DB_BDN: DEVICES_DB,
      pcs: carry.files.filter((f) => f.name.startsWith('PCs_')).map((f) => f.name),
    }),
  );
  entries.push(await zipEntry(HASH, strToU8(await codec.md5(manifest)), codec, false));
  // With the path each song went to Musicolet under, so restoring this ties its row to the song.
  const own = { ...backup, tracks: backup.tracks.map((t, i) => ({ ...t, android: uris[i] })) };
  entries.push(await zipEntry(MELODIFY, strToU8(JSON.stringify(own)), codec));
  // Last, as Musicolet writes it.
  entries.push(await zipEntry(MANIFEST, await codec.blowfish(manifest, KEY, true), codec));
  await breathe();
  return writeZip(entries, new Date(now));
}

/** The manifest's checksums in the order Musicolet writes them. */
function orderedSums(md5: Record<string, string>): Record<string, string> {
  const rank = (name: string) => {
    if (name === NAMES) return 0;
    if (name === FAVORITES) return 1;
    if (name.endsWith(PLAYLIST_EXT)) return 2;
    const pref = ['PP', 'RPN', SEARCHES, 'USP', 'OMV'].indexOf(name);
    if (pref !== -1) return 3 + pref / 10;
    if (name === SONGS_DB) return 4;
    if (name === DEVICES_DB) return 5;
    if (name.startsWith('PCs_')) return 6;
    if (name === QUEUES) return 8;
    return 7;
  };
  const out: Record<string, string> = {};
  for (const name of Object.keys(md5).sort((a, b) => rank(a) - rank(b))) out[name] = md5[name];
  return out;
}
