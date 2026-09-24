import type { BackupTrack } from './format';

/**
 * Finds each backed-up track in the library as it is now. A restore onto the same library
 * matches everything by path. A library that was copied back under a different folder, or
 * whose folders were renamed, is matched in three further passes:
 *
 * 1. Path rules the user gave ("Music/Old" is now "New"), applied before anything else.
 * 2. Folder by folder: a backed-up folder whose songs went missing is mapped to the library
 *    folder holding the most files of the same names, and its songs are matched by file name
 *    within it. Lengths, where both sides know them, must agree.
 * 3. Tags: the same title, artist and album, with a length within a few seconds, when exactly
 *    one song in the library fits.
 *
 * Matching is one to one: a library song stands in for at most one backed-up song.
 */
export interface LibraryTrack {
  id: number;
  path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
}

/** Folder prefixes, relative to Documents/. `''` is the top level. */
export interface PathRule {
  from: string;
  to: string;
}

export interface MatchResult {
  /** Library id per backed-up track, by index; null where none was found. */
  ids: (number | null)[];
  exact: number;
  remapped: number;
  byTags: number;
  missing: number;
  /** The folder moves the matching found, most songs first, for showing and for excluded folders. */
  rules: (PathRule & { songs: number })[];
  /** Backed-up folders that still have songs missing, most first. */
  missingFolders: { folder: string; count: number }[];
}

const LENGTH_SLACK_MS = 3000;

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function joinPath(folder: string, rest: string): string {
  if (!folder) return rest;
  if (!rest) return folder;
  return `${folder}/${rest}`;
}

/** `path` with the folder prefix `from` swapped for `to`, or null when it is not under `from`. */
export function applyRule(path: string, rule: PathRule): string | null {
  const from = rule.from.replace(/^\/+|\/+$/g, '');
  const to = rule.to.replace(/^\/+|\/+$/g, '');
  if (from === '') return joinPath(to, path);
  if (path === from) return to;
  if (!path.startsWith(`${from}/`)) return null;
  return joinPath(to, path.slice(from.length + 1));
}

/**
 * The move that turned folder `from` into `to`, with their shared trailing folders dropped:
 * "Music/Artist/Album" → "Artist/Album" is the one rule "Music" → "", which then also covers
 * every other album that moved the same way.
 */
export function ruleBetween(from: string, to: string): PathRule {
  const a = from ? from.split('/') : [];
  const b = to ? to.split('/') : [];
  while (a.length && b.length && a[a.length - 1] === b[b.length - 1]) {
    a.pop();
    b.pop();
  }
  return { from: a.join('/'), to: b.join('/') };
}

function lengthsAgree(a: number | null | undefined, b: number | null | undefined): boolean {
  return !a || !b || Math.abs(a - b) <= LENGTH_SLACK_MS;
}

function tagKey(title: string, artist: string | null | undefined, album: string | null | undefined): string {
  return [title, artist ?? '', album ?? ''].map((s) => s.trim().toLowerCase()).join('\u0000');
}

export function matchTracks(backup: BackupTrack[], library: LibraryTrack[], manual: PathRule[] = []): MatchResult {
  const ids: (number | null)[] = backup.map(() => null);
  const taken = new Set<number>();
  const byPath = new Map(library.map((t) => [t.path, t]));
  let exact = 0;
  let remapped = 0;
  let byTags = 0;

  const claim = (i: number, track: LibraryTrack | undefined): boolean => {
    if (!track || taken.has(track.id)) return false;
    ids[i] = track.id;
    taken.add(track.id);
    return true;
  };

  // Pass 0 and 1: the user's rules, then the path as it was.
  backup.forEach((b, i) => {
    for (const rule of manual) {
      const moved = applyRule(b.path, rule);
      if (moved !== null && claim(i, byPath.get(moved))) {
        remapped += 1;
        return;
      }
    }
    if (claim(i, byPath.get(b.path))) exact += 1;
  });

  // Pass 2: folder by folder.
  const unmatchedByFolder = new Map<string, number[]>();
  backup.forEach((b, i) => {
    if (ids[i] !== null) return;
    const folder = dirname(b.path);
    const list = unmatchedByFolder.get(folder) ?? [];
    list.push(i);
    unmatchedByFolder.set(folder, list);
  });
  // Library folder -> lowercased file name -> tracks, only for songs not yet claimed.
  const libraryFolders = new Map<string, Map<string, LibraryTrack[]>>();
  const foldersByName = new Map<string, Set<string>>();
  for (const t of library) {
    if (taken.has(t.id)) continue;
    const folder = dirname(t.path);
    const name = basename(t.path).toLowerCase();
    let files = libraryFolders.get(folder);
    if (!files) libraryFolders.set(folder, (files = new Map()));
    files.set(name, [...(files.get(name) ?? []), t]);
    let folders = foldersByName.get(name);
    if (!folders) foldersByName.set(name, (folders = new Set()));
    folders.add(folder);
  }

  const ruleSongs = new Map<string, PathRule & { songs: number }>();
  for (const [folder, indexes] of unmatchedByFolder) {
    const votes = new Map<string, number>();
    for (const i of indexes) {
      for (const candidate of foldersByName.get(basename(backup[i].path).toLowerCase()) ?? []) {
        votes.set(candidate, (votes.get(candidate) ?? 0) + 1);
      }
    }
    let best: string | null = null;
    let bestVotes = 0;
    for (const [candidate, n] of votes) {
      // Ties go to the folder with the more similar path, so "A/Disc 1" maps to "B/A/Disc 1".
      if (n > bestVotes || (n === bestVotes && best !== null && sharedTail(candidate, folder) > sharedTail(best, folder))) {
        best = candidate;
        bestVotes = n;
      }
    }
    // One stray file of a common name ("01 Intro.mp3") is not enough to call a folder moved.
    if (best === null || bestVotes < Math.min(2, indexes.length)) continue;
    const files = libraryFolders.get(best)!;
    let moved = 0;
    for (const i of indexes) {
      const candidates = files.get(basename(backup[i].path).toLowerCase()) ?? [];
      const found = candidates.find((t) => !taken.has(t.id) && lengthsAgree(t.duration_ms, backup[i].durationMs));
      if (claim(i, found)) moved += 1;
    }
    if (moved === 0) continue;
    remapped += moved;
    const rule = ruleBetween(folder, best);
    const key = `${rule.from}\u0000${rule.to}`;
    const known = ruleSongs.get(key);
    if (known) known.songs += moved;
    else ruleSongs.set(key, { ...rule, songs: moved });
  }

  // Pass 3: tags, for whatever is still missing.
  const byTag = new Map<string, LibraryTrack[]>();
  for (const t of library) {
    if (taken.has(t.id)) continue;
    const key = tagKey(t.title, t.artist, t.album);
    byTag.set(key, [...(byTag.get(key) ?? []), t]);
  }
  backup.forEach((b, i) => {
    if (ids[i] !== null || !b.title) return;
    const fits = (byTag.get(tagKey(b.title, b.artist, b.album)) ?? []).filter(
      (t) => !taken.has(t.id) && lengthsAgree(t.duration_ms, b.durationMs),
    );
    // Only when it is unambiguous, and only with an artist or album to go on: a bare title such
    // as "Intro" matches too much.
    if (fits.length === 1 && (b.artist || b.album) && claim(i, fits[0])) byTags += 1;
  });

  const missingCounts = new Map<string, number>();
  backup.forEach((b, i) => {
    if (ids[i] === null) missingCounts.set(dirname(b.path), (missingCounts.get(dirname(b.path)) ?? 0) + 1);
  });
  const missing = backup.length - exact - remapped - byTags;

  return {
    ids,
    exact,
    remapped,
    byTags,
    missing,
    rules: [...ruleSongs.values()].sort((a, b) => b.songs - a.songs),
    missingFolders: [...missingCounts]
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder)),
  };
}

/** How many trailing folder names two paths share. */
function sharedTail(a: string, b: string): number {
  const x = a ? a.split('/') : [];
  const y = b ? b.split('/') : [];
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n += 1;
  return n;
}

/**
 * Where an excluded folder from the backup lives now: moved by the first rule that covers it
 * (the user's before the ones matching found), or unchanged.
 */
export function remapFolder(folder: string, rules: PathRule[]): string {
  for (const rule of rules) {
    const moved = applyRule(folder, rule);
    if (moved !== null) return moved;
  }
  return folder;
}
