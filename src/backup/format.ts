import type { Queue } from '@/db/types';

/**
 * The backup file: everything the library cannot rebuild by scanning. Play counts, favorites,
 * hidden songs and resume points per track; playlists, queues, bookmarks, excluded folders and
 * settings. Tracks are identified by path, with their title, artist, album and length alongside,
 * so a restore onto a library that has moved can still find them (see `match.ts`).
 *
 * Everything else refers to a track by its index in `tracks`, which keeps the file small and
 * means each path is written once however many playlists it is in.
 */
export const BACKUP_FORMAT = 1;

export type BackupReason = 'manual' | 'auto' | 'before-restore';

export interface BackupTrack {
  path: string;
  title: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  // User data. Left out when it is the default, which is most of it for most tracks.
  favorite?: true;
  hidden?: true;
  playCount?: number;
  skipCount?: number;
  lastPlayedAt?: number;
  resumeMs?: number;
  addedAt?: number;
}

export interface BackupPlaylist {
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Indexes into `Backup.tracks`, in playlist order. */
  tracks: number[];
}

export interface BackupQueue {
  name: string;
  /** Index into this queue's `tracks` of the current song, -1 for an empty queue. */
  currentIndex: number;
  currentMs: number;
  repeat: Queue['repeat'];
  tracks: number[];
}

export interface BackupBookmark {
  track: number;
  positionMs: number;
  label: string | null;
  createdAt: number;
}

export interface BackupSettings {
  prefs?: Record<string, unknown>;
  choices?: Record<string, string>;
  recentSearches?: string[];
}

export interface Backup {
  app: 'melodify';
  format: number;
  createdAt: number;
  reason: BackupReason;
  tracks: BackupTrack[];
  playlists: BackupPlaylist[];
  queues: BackupQueue[];
  /** Index into `queues`. */
  activeQueue: number;
  bookmarks: BackupBookmark[];
  excludedFolders: string[];
  settings: BackupSettings;
}

/** The rows a backup is built from, as the database hands them over. */
export interface BackupSource {
  tracks: {
    id: number;
    path: string;
    title: string;
    artist: string | null;
    album: string | null;
    duration_ms: number | null;
    favorite: number;
    hidden: number;
    play_count: number;
    skip_count: number;
    last_played_at: number | null;
    resume_ms: number | null;
    added_at: number;
  }[];
  playlists: { id: number; name: string; created_at: number; updated_at: number }[];
  /** In position order within each playlist. */
  playlistTracks: { playlist_id: number; track_id: number }[];
  /** In tab order. */
  queues: { id: number; name: string; current_index: number; current_ms: number; repeat: Queue['repeat'] }[];
  /** In position order within each queue, with the stored position. */
  queueTracks: { queue_id: number; track_id: number; position: number }[];
  activeQueueId: number | null;
  bookmarks: { track_id: number; position_ms: number; label: string | null; created_at: number }[];
  excludedFolders: string[];
  settings: BackupSettings;
}

export function buildBackup(source: BackupSource, reason: BackupReason, createdAt = Date.now()): Backup {
  const indexById = new Map<number, number>();
  const tracks = source.tracks.map((t, i): BackupTrack => {
    indexById.set(t.id, i);
    const out: BackupTrack = { path: t.path, title: t.title };
    if (t.artist) out.artist = t.artist;
    if (t.album) out.album = t.album;
    if (t.duration_ms) out.durationMs = t.duration_ms;
    if (t.favorite) out.favorite = true;
    if (t.hidden) out.hidden = true;
    if (t.play_count) out.playCount = t.play_count;
    if (t.skip_count) out.skipCount = t.skip_count;
    if (t.last_played_at) out.lastPlayedAt = t.last_played_at;
    if (t.resume_ms) out.resumeMs = t.resume_ms;
    if (t.added_at) out.addedAt = t.added_at;
    return out;
  });
  const indexOf = (id: number) => indexById.get(id);

  const playlists = source.playlists.map((p): BackupPlaylist => ({
    name: p.name,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    tracks: source.playlistTracks
      .filter((pt) => pt.playlist_id === p.id)
      .flatMap((pt) => {
        const i = indexOf(pt.track_id);
        return i === undefined ? [] : [i];
      }),
  }));

  const queues = source.queues.map((q): BackupQueue => {
    const rows = source.queueTracks.filter((qt) => qt.queue_id === q.id);
    const tracksOut: number[] = [];
    let currentIndex = -1;
    for (const row of rows) {
      const i = indexOf(row.track_id);
      if (i === undefined) continue;
      // Stored positions can have gaps; the current song is the first at or after the saved one.
      if (currentIndex === -1 && row.position >= q.current_index) currentIndex = tracksOut.length;
      tracksOut.push(i);
    }
    if (currentIndex === -1 && tracksOut.length) currentIndex = tracksOut.length - 1;
    return { name: q.name, currentIndex, currentMs: q.current_ms, repeat: q.repeat, tracks: tracksOut };
  });
  const active = source.queues.findIndex((q) => q.id === source.activeQueueId);

  const bookmarks = source.bookmarks.flatMap((b): BackupBookmark[] => {
    const i = indexOf(b.track_id);
    return i === undefined ? [] : [{ track: i, positionMs: b.position_ms, label: b.label, createdAt: b.created_at }];
  });

  return {
    app: 'melodify',
    format: BACKUP_FORMAT,
    createdAt,
    reason,
    tracks,
    playlists,
    queues,
    activeQueue: Math.max(0, active),
    bookmarks,
    excludedFolders: [...source.excludedFolders],
    settings: source.settings,
  };
}

export class BackupError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (isNumber(v) ? v : undefined);

/**
 * Reads a backup file's text. Throws `BackupError` with a message fit to show when the file is
 * not a Melodify backup or comes from a newer version. Within a valid file, entries that are
 * malformed or point at a track that is not there are dropped rather than failing the restore.
 */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new BackupError('This file is not a Melodify backup: it is not valid JSON.');
  }
  if (!isObject(data) || data.app !== 'melodify' || !isNumber(data.format)) {
    throw new BackupError('This file is not a Melodify backup.');
  }
  if (data.format > BACKUP_FORMAT) {
    throw new BackupError('This backup was made by a newer version of Melodify. Update the app to restore it.');
  }
  if (!Array.isArray(data.tracks)) throw new BackupError('This backup has no song list.');

  const tracks: BackupTrack[] = [];
  // Old index to new, for when a malformed track entry is dropped and the ones after it shift.
  const remap = new Map<number, number>();
  data.tracks.forEach((raw, i) => {
    if (!isObject(raw) || !str(raw.path)) return;
    const t: BackupTrack = { path: raw.path as string, title: str(raw.title) ?? '' };
    if (str(raw.artist)) t.artist = raw.artist as string;
    if (str(raw.album)) t.album = raw.album as string;
    if (num(raw.durationMs)) t.durationMs = raw.durationMs as number;
    if (raw.favorite === true) t.favorite = true;
    if (raw.hidden === true) t.hidden = true;
    if (num(raw.playCount)) t.playCount = Math.max(0, Math.round(raw.playCount as number));
    if (num(raw.skipCount)) t.skipCount = Math.max(0, Math.round(raw.skipCount as number));
    if (num(raw.lastPlayedAt)) t.lastPlayedAt = raw.lastPlayedAt as number;
    if (num(raw.resumeMs)) t.resumeMs = raw.resumeMs as number;
    if (num(raw.addedAt)) t.addedAt = raw.addedAt as number;
    remap.set(i, tracks.length);
    tracks.push(t);
  });
  const trackList = (v: unknown): number[] =>
    Array.isArray(v)
      ? v.flatMap((i) => {
          const at = isNumber(i) ? remap.get(i) : undefined;
          return at === undefined ? [] : [at];
        })
      : [];
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : []);

  const playlists = list(data.playlists).flatMap((p): BackupPlaylist[] => {
    const name = str(p.name);
    if (!name) return [];
    return [{ name, createdAt: num(p.createdAt) ?? 0, updatedAt: num(p.updatedAt) ?? 0, tracks: trackList(p.tracks) }];
  });

  const queues = list(data.queues).map((q, i): BackupQueue => {
    const qTracks = trackList(q.tracks);
    const current = num(q.currentIndex) ?? -1;
    const repeat = q.repeat === 'all' || q.repeat === 'one' ? q.repeat : 'off';
    return {
      name: str(q.name) ?? `Queue ${i + 1}`,
      currentIndex: qTracks.length ? Math.min(Math.max(0, current), qTracks.length - 1) : -1,
      currentMs: Math.max(0, num(q.currentMs) ?? 0),
      repeat,
      tracks: qTracks,
    };
  });

  const bookmarks = list(data.bookmarks).flatMap((b): BackupBookmark[] => {
    const track = isNumber(b.track) ? remap.get(b.track) : undefined;
    if (track === undefined || !isNumber(b.positionMs)) return [];
    return [{ track, positionMs: b.positionMs, label: str(b.label) ?? null, createdAt: num(b.createdAt) ?? 0 }];
  });

  const settings: BackupSettings = {};
  if (isObject(data.settings)) {
    const s = data.settings;
    if (isObject(s.prefs)) settings.prefs = s.prefs;
    if (isObject(s.choices)) {
      settings.choices = Object.fromEntries(
        Object.entries(s.choices).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
    }
    if (Array.isArray(s.recentSearches)) {
      settings.recentSearches = s.recentSearches.filter((x): x is string => typeof x === 'string');
    }
  }

  const activeQueue = num(data.activeQueue) ?? 0;
  return {
    app: 'melodify',
    format: data.format,
    createdAt: num(data.createdAt) ?? 0,
    reason: data.reason === 'auto' || data.reason === 'before-restore' ? data.reason : 'manual',
    tracks,
    playlists,
    queues,
    activeQueue: activeQueue >= 0 && activeQueue < queues.length ? activeQueue : 0,
    bookmarks,
    excludedFolders: Array.isArray(data.excludedFolders)
      ? data.excludedFolders.filter((f): f is string => typeof f === 'string')
      : [],
    settings,
  };
}

export interface BackupSummary {
  songs: number;
  favorites: number;
  played: number;
  playlists: number;
  queues: number;
  bookmarks: number;
}

export function summarize(backup: Backup): BackupSummary {
  return {
    songs: backup.tracks.length,
    favorites: backup.tracks.filter((t) => t.favorite).length,
    played: backup.tracks.filter((t) => t.playCount).length,
    playlists: backup.playlists.length,
    queues: backup.queues.filter((q) => q.tracks.length).length,
    bookmarks: backup.bookmarks.length,
  };
}
