import type { Track } from '@/db/types';

/**
 * Pure queue arithmetic, kept apart from the store so it can be tested without an engine or a
 * database. Every function returns a new list and leaves its input alone, which is what lets the
 * store keep the previous list around for undo.
 */

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueList {
  tracks: Track[];
  /** Index of the current track, or -1 for an empty queue. */
  currentIndex: number;
}

/**
 * What plays after `index`, or -1 when the queue should stop. A track ending by itself repeats
 * under `one`; the user pressing next always moves on, wrapping as `all` does.
 */
export function nextIndex(length: number, index: number, repeat: RepeatMode, manual: boolean): number {
  if (length === 0) return -1;
  if (repeat === 'one' && !manual) return Math.max(0, index);
  if (index + 1 < length) return index + 1;
  return repeat === 'off' ? -1 : 0;
}

/** What plays before `index`. Only `all` wraps to the end; otherwise the first track restarts. */
export function previousIndex(length: number, index: number, repeat: RepeatMode): number {
  if (length === 0) return -1;
  if (index > 0) return index - 1;
  return repeat === 'all' ? length - 1 : 0;
}

export function cycleRepeat(repeat: RepeatMode): RepeatMode {
  return repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
}

/** Moves one track, keeping `currentIndex` on the same track wherever it ends up. */
export function moveTrack(list: QueueList, from: number, to: number): QueueList {
  const { tracks, currentIndex } = list;
  if (from === to || from < 0 || from >= tracks.length) return list;
  const target = Math.max(0, Math.min(to, tracks.length - 1));
  const next = tracks.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  let current = currentIndex;
  if (currentIndex === from) current = target;
  else if (from < currentIndex && target >= currentIndex) current = currentIndex - 1;
  else if (from > currentIndex && target <= currentIndex) current = currentIndex + 1;
  return { tracks: next, currentIndex: current };
}

/**
 * Removes the tracks at `indexes`. When the current track goes, the one that followed it takes
 * over (or the new last one, if nothing followed), and `currentRemoved` tells the caller to load it.
 */
export function removeTracks(list: QueueList, indexes: Iterable<number>): QueueList & { currentRemoved: boolean } {
  const drop = new Set(indexes);
  const tracks = list.tracks.filter((_, i) => !drop.has(i));
  if (tracks.length === 0) return { tracks, currentIndex: -1, currentRemoved: list.currentIndex >= 0 };
  let before = 0;
  for (const i of drop) if (i < list.currentIndex) before += 1;
  const currentRemoved = drop.has(list.currentIndex);
  const shifted = list.currentIndex - before;
  return { tracks, currentIndex: Math.max(0, Math.min(shifted, tracks.length - 1)), currentRemoved };
}

/**
 * Moves the tracks at `indexes` to play right after the current one, in their existing order.
 * The current track itself is left where it is if it was among them.
 */
export function moveAfterCurrent(list: QueueList, indexes: Iterable<number>): QueueList {
  const picked = [...new Set(indexes)].filter((i) => i !== list.currentIndex && i >= 0 && i < list.tracks.length).sort((a, b) => a - b);
  if (picked.length === 0) return list;
  const moving = picked.map((i) => list.tracks[i]);
  const rest = removeTracks(list, picked);
  return insertTracks({ tracks: rest.tracks, currentIndex: rest.currentIndex }, rest.currentIndex + 1, moving);
}

/** Inserts `added` before position `at`. An empty queue's first track becomes current. */
export function insertTracks(list: QueueList, at: number, added: Track[]): QueueList {
  if (added.length === 0) return list;
  const pos = Math.max(0, Math.min(at, list.tracks.length));
  const tracks = [...list.tracks.slice(0, pos), ...added, ...list.tracks.slice(pos)];
  let current = list.currentIndex;
  if (current < 0) current = 0;
  else if (pos <= current) current += added.length;
  return { tracks, currentIndex: current };
}

/** Fisher-Yates over a copy. `random` is injectable so tests can pin the order. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Shuffles the queue the way Musicolet does: the current track moves to the top and keeps
 * playing, everything else is shuffled after it.
 */
export function shuffleQueue(list: QueueList, random: () => number = Math.random): QueueList {
  const { tracks, currentIndex } = list;
  if (tracks.length < 2) return list;
  if (currentIndex < 0) return { tracks: shuffled(tracks, random), currentIndex: -1 };
  const rest = tracks.filter((_, i) => i !== currentIndex);
  return { tracks: [tracks[currentIndex], ...shuffled(rest, random)], currentIndex: 0 };
}

function albumKey(t: Track): string {
  return `${t.album_artist ?? t.artist ?? ''}\u0000${t.album ?? t.folder}`;
}

/**
 * Shuffles whole albums, keeping each album's tracks together and in disc and track order. The
 * current track's album goes first so playback carries on where it is; tracks without an album
 * are grouped by folder, which is usually the same thing for a ripped library.
 */
export function shuffleByAlbum(list: QueueList, random: () => number = Math.random): QueueList {
  const { tracks, currentIndex } = list;
  if (tracks.length < 2) return list;
  const groups = new Map<string, { track: Track; at: number }[]>();
  tracks.forEach((track, at) => {
    const key = albumKey(track);
    const group = groups.get(key);
    if (group) group.push({ track, at });
    else groups.set(key, [{ track, at }]);
  });
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        (a.track.disc_no ?? 0) - (b.track.disc_no ?? 0) ||
        (a.track.track_no ?? 0) - (b.track.track_no ?? 0) ||
        a.at - b.at,
    );
  }
  const currentKey = currentIndex >= 0 ? albumKey(tracks[currentIndex]) : null;
  const order = shuffled([...groups.keys()].filter((k) => k !== currentKey), random);
  if (currentKey !== null) order.unshift(currentKey);
  const flat = order.flatMap((k) => groups.get(k)!);
  return {
    tracks: flat.map((e) => e.track),
    currentIndex: currentIndex < 0 ? -1 : flat.findIndex((e) => e.at === currentIndex),
  };
}

/** Drops repeated tracks, keeping the first copy of each, except that the current one stays. */
export function removeDuplicates(list: QueueList): QueueList & { removed: number } {
  const currentId = list.tracks[list.currentIndex]?.id;
  const seen = new Set<number>();
  const drop: number[] = [];
  list.tracks.forEach((t, i) => {
    if (i === list.currentIndex) return;
    if (seen.has(t.id) || (t.id === currentId && i !== list.currentIndex)) drop.push(i);
    else seen.add(t.id);
  });
  const { tracks, currentIndex } = removeTracks(list, drop);
  return { tracks, currentIndex, removed: drop.length };
}
