/**
 * M3U / M3U8 playlists. Written as UTF-8 extended M3U with paths relative to the playlist file,
 * which is what keeps an exported playlist working when the whole folder is copied to a computer.
 * Read leniently: plain or extended, relative or absolute paths, `file://` URLs, Windows
 * separators, and a byte order mark.
 */
export interface M3uEntry {
  /** As written in the file, trimmed. */
  location: string;
  /** From `#EXTINF`, when present. */
  title?: string;
  durationS?: number;
}

export function parseM3u(text: string): M3uEntry[] {
  const entries: M3uEntry[] = [];
  let pending: Pick<M3uEntry, 'title' | 'durationS'> = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const info = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i.exec(line);
      if (info) {
        const seconds = Number(info[1]);
        pending = { title: info[2].trim() || undefined, durationS: seconds > 0 ? seconds : undefined };
      }
      continue;
    }
    entries.push({ location: line, ...pending });
    pending = {};
  }
  return entries;
}

export interface M3uTrack {
  /** Relative to Documents/. */
  path: string;
  title: string;
  artist: string | null;
  durationMs: number | null;
}

/** An extended M3U for a playlist file stored in `playlistFolder` (relative to Documents/). */
export function formatM3u(tracks: M3uTrack[], playlistFolder: string): string {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    const seconds = t.durationMs ? Math.round(t.durationMs / 1000) : -1;
    const label = t.artist ? `${t.artist} - ${t.title}` : t.title;
    lines.push(`#EXTINF:${seconds},${label.replace(/[\r\n]+/g, ' ')}`);
    lines.push(relativePath(playlistFolder, t.path));
  }
  return `${lines.join('\n')}\n`;
}

function segments(path: string): string[] {
  return path.split('/').filter((s) => s !== '' && s !== '.');
}

/** Resolves `.` and `..`. A `..` above the top is dropped, as a file system would. */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const s of segments(path)) {
    if (s === '..') out.pop();
    else out.push(s);
  }
  return out.join('/');
}

/** `to` (a file) as seen from the folder `from`, both relative to the same root. */
export function relativePath(from: string, to: string): string {
  const a = segments(from);
  const b = segments(to);
  let shared = 0;
  while (shared < a.length && shared < b.length - 1 && a[shared] === b[shared]) shared += 1;
  return [...a.slice(shared).map(() => '..'), ...b.slice(shared)].join('/');
}

/**
 * The entry's location as a plain `/`-separated path, and whether it was absolute. `file://`
 * URLs are percent-decoded; anything else is taken literally, since a file name may contain `%`.
 */
function cleanLocation(location: string): { path: string; absolute: boolean } | null {
  let path = location;
  if (/^file:\/\//i.test(path)) {
    path = path.replace(/^file:\/\/(localhost)?/i, '');
    try {
      path = decodeURIComponent(path);
    } catch {
      // Leave a malformed escape as it is.
    }
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    // A stream URL. Nothing on the phone can stand in for it.
    return null;
  }
  path = path.replace(/\\/g, '/');
  const absolute = path.startsWith('/') || /^[a-z]:\//i.test(path);
  path = path.replace(/^[a-z]:\//i, '/');
  return { path, absolute };
}

/**
 * Looks library paths up by exact path, then case-insensitively, then by the longest run of
 * trailing folders and file name they share with the entry. The last is how an absolute path
 * from a computer ("/home/me/Music/Artist/Album/01.flac") finds "Artist/Album/01.flac".
 */
export class PathIndex {
  private exact = new Set<string>();
  private lower = new Map<string, string>();
  private byName = new Map<string, string[]>();

  constructor(paths: Iterable<string>) {
    for (const p of paths) {
      this.exact.add(p);
      const lower = p.toLowerCase();
      if (!this.lower.has(lower)) this.lower.set(lower, p);
      const name = lower.slice(lower.lastIndexOf('/') + 1);
      this.byName.set(name, [...(this.byName.get(name) ?? []), p]);
    }
  }

  find(path: string): string | null {
    if (this.exact.has(path)) return path;
    return this.lower.get(path.toLowerCase()) ?? null;
  }

  /** Best library path sharing a tail with `path`, or null if none or it is a tie. */
  bySuffix(path: string): string | null {
    const wanted = segments(path.toLowerCase());
    const candidates = this.byName.get(wanted[wanted.length - 1] ?? '') ?? [];
    let best: string | null = null;
    let bestShared = 0;
    let tie = false;
    for (const candidate of candidates) {
      const have = segments(candidate.toLowerCase());
      let shared = 0;
      while (shared < have.length && shared < wanted.length && have[have.length - 1 - shared] === wanted[wanted.length - 1 - shared]) {
        shared += 1;
      }
      if (shared > bestShared) {
        best = candidate;
        bestShared = shared;
        tie = false;
      } else if (shared === bestShared) {
        tie = true;
      }
    }
    return tie ? null : best;
  }
}

/**
 * The library path an entry points at, for a playlist file in `playlistFolder`. Relative paths
 * are tried as written first; when that finds nothing (the playlist was made against another
 * layout) they fall back to the suffix match, like absolute ones.
 */
export function resolveEntry(entry: M3uEntry, playlistFolder: string, index: PathIndex): string | null {
  const clean = cleanLocation(entry.location);
  if (!clean) return null;
  if (!clean.absolute) {
    const direct = index.find(normalizePath(`${playlistFolder}/${clean.path}`)) ?? index.find(normalizePath(clean.path));
    if (direct) return direct;
  }
  return index.bySuffix(clean.path);
}

/** A playlist name for the file name: no extension. */
export function playlistNameFromFile(filename: string): string {
  return filename.replace(/\.m3u8?$/i, '').trim() || 'Imported playlist';
}

/** A file name for a playlist name, safe on every file system the folder might be copied to. */
export function fileNameForPlaylist(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
  return `${safe.slice(0, 120) || 'Playlist'}.m3u8`;
}
