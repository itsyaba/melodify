import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  createQueue,
  DEFAULT_QUEUE_ID,
  deleteQueue,
  listQueueHeads,
  loadQueue,
  MAX_QUEUES,
  renameQueue,
  saveQueueOrder,
  saveQueuePosition,
  saveQueueTracks,
  setQueueRepeat,
} from '@/db/queues';
import { serial } from '@/db/serial';
import { getSetting, setSetting } from '@/db/settings';
import { recordPlay, recordSkip, setFavorite, setResumeMs } from '@/db/tracks';
import type { Track } from '@/db/types';
import { getPrefs, subscribePrefs } from '@/prefs';
import { libraryEvents } from '@/utils/events';
import { artUri } from '@/components/artwork';
import { replayGainDb } from './gain';
import { engine, type NowPlayingMeta, type PlaybackState } from './index';
import * as ops from './queue-ops';
import type { QueueList, RepeatMode } from './queue-ops';

export type { RepeatMode } from './queue-ops';

/**
 * Musicolet-style multiple queues. Each queue keeps its own list, current track and position;
 * exactly one of them, the active queue, drives the engine. Everything is held in memory and
 * mirrored to `queues` / `queue_tracks` so it survives a restart.
 */
export interface QueueInfo {
  id: number;
  name: string;
  tracks: Track[];
  currentIndex: number;
  /**
   * Where this queue's current track was left. Kept current for inactive queues only; the
   * active queue's live position is `positionMs` on the store.
   */
  savedMs: number;
  repeat: RepeatMode;
}

interface StoreState {
  queues: QueueInfo[];
  activeId: number;
  // The active queue, flattened for the screens that only care about what is playing.
  tracks: Track[];
  currentIndex: number;
  repeat: RepeatMode;
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  /** What `undo` would revert, for the button's label. Null when there is nothing to undo. */
  undoLabel: string | null;
}

interface UndoEntry extends QueueList {
  queueId: number;
  label: string;
  positionMs: number;
}

const EMPTY_QUEUE: QueueInfo = {
  id: DEFAULT_QUEUE_ID, name: 'Queue 1', tracks: [], currentIndex: -1, savedMs: 0, repeat: 'off',
};
const UNDO_LIMIT = 30;

let state: StoreState = flatten({
  queues: [EMPTY_QUEUE], activeId: DEFAULT_QUEUE_ID, state: 'idle', positionMs: 0, durationMs: 0, undoLabel: null,
});
const subscribers = new Set<() => void>();
const undoStack: UndoEntry[] = [];

function flatten(s: Omit<StoreState, 'tracks' | 'currentIndex' | 'repeat'>): StoreState {
  const active = s.queues.find((q) => q.id === s.activeId) ?? s.queues[0] ?? EMPTY_QUEUE;
  return { ...s, tracks: active.tracks, currentIndex: active.currentIndex, repeat: active.repeat };
}

function set(patch: Partial<Omit<StoreState, 'tracks' | 'currentIndex' | 'repeat'>>) {
  state = flatten({ ...state, ...patch });
  subscribers.forEach((fn) => fn());
}

function active(): QueueInfo {
  return state.queues.find((q) => q.id === state.activeId) ?? state.queues[0] ?? EMPTY_QUEUE;
}

function getQueue(id: number): QueueInfo | undefined {
  return state.queues.find((q) => q.id === id);
}

function updateQueue(id: number, patch: Partial<QueueInfo>) {
  set({ queues: state.queues.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
}

function trackUri(track: Track): string {
  return Paths.join(Paths.document, track.path);
}

function nowPlayingMeta(track: Track): NowPlayingMeta {
  return { title: track.title, artist: track.artist, album: track.album, durationMs: track.duration_ms, artUri: artUri(track.art_key) };
}

function gainOf(track: Track): number {
  const p = getPrefs();
  return replayGainDb(track, p.replayGain, p.replayGainPreampDb);
}

// Persistence. Set by `restoreQueue`, which runs before any screen can touch the queue.
let db: SQLiteDatabase | null = null;
/** Position last written, so the 4 Hz position tick only writes every few seconds. */
let savedMs = 0;
const SAVE_EVERY_MS = 5000;
/** Whether the current load has been counted as a play yet. */
let counted = false;
/**
 * Latest resume position per track id, newer than the `resume_ms` on the in-memory rows. Kept
 * here rather than patched into the rows: that would give the playing track a new identity every
 * few seconds and re-render everything that watches it.
 */
const resumeCache = new Map<number, number | null>();
/** Near the end, a long track counts as finished and starts over next time. */
const RESUME_END_SLACK_MS = 15_000;

/** A play is counted at half the track or four minutes in, whichever comes first. */
function playThreshold(durationMs: number): number {
  if (durationMs <= 0) return 30_000;
  return Math.min(durationMs / 2, 4 * 60_000);
}

/** Tracks long enough to remember their own position, per the resume preference. */
function remembersPosition(track: Track | undefined, durationMs = track?.duration_ms ?? 0): boolean {
  const min = getPrefs().resumeMinMs;
  return !!track && min > 0 && durationMs >= min;
}

/**
 * Loads in flight. A position tick from the outgoing track can still arrive during one, and it
 * must not be recorded as the incoming track's position. A count rather than a flag, since a
 * quick second tap starts a load before the first has finished.
 */
let loading = 0;
/**
 * Bumped by every load and part of every arming key, so an `advanced` the engine sent before a
 * load (a tap on another song right at a track boundary) is recognised as stale when it arrives.
 */
let loadGeneration = 0;

/**
 * Writes go through the shared serial chain: two overlapping transactions on one connection
 * fail outright, and a position save must not land before the track list it indexes into.
 */
function persist(op: (db: SQLiteDatabase) => Promise<void>): void {
  const target = db;
  if (!target) return;
  void serial(() => op(target)).catch((err: unknown) => console.warn('[melodify] saving the queue failed:', err));
}

function saveTracks(queueId: number): void {
  const ids = getQueue(queueId)?.tracks.map((t) => t.id) ?? [];
  persist((d) => saveQueueTracks(d, queueId, ids));
}

/**
 * Where the current track should pick up again. A queue that ran out comes back at the start of
 * its last track, not parked at the very end of it.
 */
function resumeMs(): number {
  return state.state === 'ended' || state.state === 'idle' ? 0 : state.positionMs;
}

/**
 * Saves the active queue's position. Callers that know it pass it: the fallback reads the
 * playback state, which lags behind during a load.
 */
function savePosition(ms = resumeMs()): void {
  const q = active();
  if (q.currentIndex < 0) return;
  savedMs = ms;
  persist((d) => saveQueuePosition(d, q.id, q.currentIndex, ms));
  const track = q.tracks[q.currentIndex];
  const duration = state.durationMs || track?.duration_ms || 0;
  if (track && remembersPosition(track, duration)) {
    const resume = ms <= 0 || ms >= duration - RESUME_END_SLACK_MS ? null : Math.round(ms);
    const known = resumeCache.has(track.id) ? resumeCache.get(track.id) : track.resume_ms;
    if (resume !== known) {
      resumeCache.set(track.id, resume);
      persist((d) => setResumeMs(d, track.id, resume));
    }
  }
}

function saveInactivePosition(q: QueueInfo): void {
  persist((d) => saveQueuePosition(d, q.id, Math.max(0, q.currentIndex), q.savedMs));
}

/** Where a track would start when loaded: its remembered position if it keeps one, else 0. */
function startOf(track: Track): number {
  const remembered = resumeCache.has(track.id) ? resumeCache.get(track.id) : track.resume_ms;
  return remembersPosition(track) ? remembered ?? 0 : 0;
}

/**
 * Tells the engine what follows the current track if it ends by itself, so it can move on with no
 * gap (or crossfade). Called after anything that can change that: a load, a queue edit, a repeat
 * change. Nothing is armed when the queue ends there, when the sleep timer stops after this song,
 * or when the next song should pick up where it was left, which only a load can do; the end is
 * then reported as `ended` and handled below as before. The key names the queue, index and track,
 * so `advanced` can find the track even if the queue changed in between.
 */
function armNext(): void {
  const q = active();
  const i = ops.nextIndex(q.tracks.length, q.currentIndex, q.repeat, false);
  const next = q.tracks[i];
  if (!next || q.currentIndex < 0 || trackEndHook?.wouldPause() || startOf(next) > 0) {
    run(engine.setNext(null));
    if (next && i !== q.currentIndex) run(engine.preload(trackUri(next)));
    return;
  }
  const key = `${loadGeneration}:${q.id}:${i}:${next.id}`;
  run(engine.setNext({ uri: trackUri(next), meta: nowPlayingMeta(next), gainDb: gainOf(next), key }));
}

/** For outside changes that affect what may be armed: the sleep timer, ReplayGain settings. */
export function refreshNext(): void {
  armNext();
}

async function loadIndex(index: number, opts: { autoplay?: boolean; startMs?: number } = {}) {
  const q = active();
  const track = q.tracks[index];
  if (!track) return;
  const startMs = opts.startMs ?? startOf(track);
  counted = false;
  loadGeneration += 1;
  updateQueue(q.id, { currentIndex: index });
  set({ positionMs: startMs, durationMs: track.duration_ms ?? 0 });
  savePosition(startMs);
  loading += 1;
  try {
    await engine.load(trackUri(track), nowPlayingMeta(track), {
      autoplay: opts.autoplay ?? true,
      startMs,
      gainDb: gainOf(track),
    });
  } finally {
    loading -= 1;
  }
  armNext();
}

function pushUndo(entry: UndoEntry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  set({ undoLabel: entry.label });
}

function isPlaying(): boolean {
  return state.state === 'playing' || state.state === 'loading';
}

/**
 * Applies an edit to one queue and records the old list for undo. The engine only hears about it
 * when the edit touched the active queue's current track: removed it, or gave an empty queue one.
 */
async function edit(
  queueId: number,
  label: string,
  change: (list: QueueList) => QueueList & { currentRemoved?: boolean },
): Promise<void> {
  const q = getQueue(queueId);
  if (!q) return;
  const before: QueueList = { tracks: q.tracks, currentIndex: q.currentIndex };
  const after = change(before);
  if (after.tracks === before.tracks && after.currentIndex === before.currentIndex) return;
  const isActive = queueId === state.activeId;
  pushUndo({ queueId, label, ...before, positionMs: isActive ? resumeMs() : q.savedMs });

  const reload = after.currentRemoved === true || (before.currentIndex < 0 && after.currentIndex >= 0);
  updateQueue(queueId, {
    tracks: after.tracks,
    currentIndex: after.currentIndex,
    savedMs: reload ? 0 : q.savedMs,
  });
  saveTracks(queueId);

  if (!isActive) {
    saveInactivePosition(getQueue(queueId)!);
    return;
  }
  if (after.tracks.length === 0) {
    await engine.stop();
    set({ positionMs: 0, durationMs: 0 });
  } else if (reload) {
    // Removing the playing track carries on with the next one; filling an empty queue only cues it.
    await loadIndex(after.currentIndex, { autoplay: after.currentRemoved === true && isPlaying() });
  } else {
    savePosition();
    armNext();
  }
}

/** Leaves the active queue where it is and makes `queueId` active. The engine is not touched. */
function activate(queueId: number) {
  const old = active();
  const oldMs = resumeMs();
  updateQueue(old.id, { savedMs: oldMs });
  savePosition(oldMs);
  set({ activeId: queueId });
  persist((d) => setSetting(d, 'activeQueueId', queueId));
}

function songs(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}

/** "Queue 3" for the lowest number not already taken by a queue with a default-style name. */
function nextQueueName(): string {
  const taken = new Set(state.queues.map((q) => q.name));
  let n = 1;
  while (taken.has(`Queue ${n}`)) n += 1;
  return `Queue ${n}`;
}

/**
 * Applies a change to every in-memory copy of these tracks, in every queue: a favorite toggled,
 * a resume position saved. The rows themselves are the caller's to update.
 */
export function patchTracks(ids: number[], patch: Partial<Track>): void {
  const wanted = new Set(ids);
  let touched = false;
  const queues = state.queues.map((q) => {
    if (!q.tracks.some((t) => wanted.has(t.id))) return q;
    touched = true;
    return { ...q, tracks: q.tracks.map((t) => (wanted.has(t.id) ? { ...t, ...patch } : t)) };
  });
  if (touched) set({ queues });
}

export const queue = {
  /** Replace the active queue with `tracks` and start at `index`. Undoable. */
  async replace(tracks: Track[], index: number) {
    const q = active();
    if (q.tracks.length > 0) {
      pushUndo({ queueId: q.id, label: 'Replace queue', tracks: q.tracks, currentIndex: q.currentIndex, positionMs: resumeMs() });
    }
    updateQueue(q.id, { tracks, currentIndex: Math.min(index, tracks.length - 1) });
    saveTracks(q.id);
    await loadIndex(index);
  },
  /** Plays `tracks` in a random order, replacing the active queue. */
  async playShuffled(tracks: Track[]) {
    if (tracks.length === 0) return;
    await queue.replace(ops.shuffled(tracks), 0);
  },
  async playAt(index: number) {
    await loadIndex(index);
  },
  /** Plays `index` of any queue, making that queue the active one first. */
  async playQueueAt(queueId: number, index: number) {
    if (queueId !== state.activeId) {
      if (!getQueue(queueId)) return;
      activate(queueId);
    }
    await loadIndex(index);
  },
  /** `manual` is false only for a track that ended by itself, which is when repeat-one applies. */
  async next(manual = true) {
    const q = active();
    // Passed over before it counted as a play: a skip, for the statistics.
    const leaving = q.tracks[q.currentIndex];
    if (manual && leaving && !counted && state.positionMs > 0) persist((d) => recordSkip(d, leaving.id));
    const i = ops.nextIndex(q.tracks.length, q.currentIndex, q.repeat, manual);
    if (i < 0) await engine.stop();
    else await loadIndex(i);
  },
  async previous() {
    const q = active();
    const i = ops.previousIndex(q.tracks.length, q.currentIndex, q.repeat);
    if (state.positionMs > 3000 || i === q.currentIndex || i < 0) await engine.seek(0);
    else await loadIndex(i);
  },
  async toggle() {
    if (state.state === 'playing') await engine.pause();
    else if (state.state === 'idle' || state.state === 'ended') {
      // Stopped at the end of the queue: start the current track over rather than do nothing.
      const q = active();
      if (q.currentIndex >= 0) await loadIndex(q.currentIndex, { startMs: 0 });
    } else await engine.play();
  },
  seek: (ms: number) => engine.seek(ms),

  // Editing. Every one takes an optional queue id and defaults to the active queue.
  append(tracks: Track[], queueId = state.activeId) {
    return edit(queueId, `Add ${songs(tracks.length)}`, (l) => ops.insertTracks(l, l.tracks.length, tracks));
  },
  playNext(tracks: Track[], queueId = state.activeId) {
    return edit(queueId, `Play ${songs(tracks.length)} next`, (l) => ops.insertTracks(l, l.currentIndex + 1, tracks));
  },
  remove(indexes: number[], queueId = state.activeId) {
    return edit(queueId, `Remove ${songs(indexes.length)}`, (l) => ops.removeTracks(l, indexes));
  },
  move(from: number, to: number, queueId = state.activeId) {
    return edit(queueId, 'Move song', (l) => ops.moveTrack(l, from, to));
  },
  /** Moves tracks already in the queue to play after the current one. */
  moveNext(indexes: number[], queueId = state.activeId) {
    return edit(queueId, `Move ${songs(indexes.length)}`, (l) => ops.moveAfterCurrent(l, indexes));
  },
  clear(queueId = state.activeId) {
    return edit(queueId, 'Clear queue', (l) =>
      l.tracks.length === 0 ? l : { tracks: [], currentIndex: -1, currentRemoved: true },
    );
  },
  shuffle(queueId = state.activeId) {
    return edit(queueId, 'Shuffle', (l) => ops.shuffleQueue(l));
  },
  shuffleByAlbum(queueId = state.activeId) {
    return edit(queueId, 'Shuffle by album', (l) => ops.shuffleByAlbum(l));
  },
  removeDuplicates(queueId = state.activeId) {
    return edit(queueId, 'Remove duplicates', (l) => {
      const r = ops.removeDuplicates(l);
      return r.removed === 0 ? l : r;
    });
  },
  /**
   * Drops tracks from every queue, as when their files are deleted. Not undoable: the rows are
   * gone, so there would be nothing to put back.
   */
  async forgetTracks(ids: number[]) {
    const gone = new Set(ids);
    for (let i = undoStack.length - 1; i >= 0; i -= 1) {
      if (undoStack[i].tracks.some((t) => gone.has(t.id))) undoStack.splice(i, 1);
    }
    set({ undoLabel: undoStack[undoStack.length - 1]?.label ?? null });
    for (const q of state.queues) {
      const indexes = q.tracks.flatMap((t, i) => (gone.has(t.id) ? [i] : []));
      if (indexes.length === 0) continue;
      await edit(q.id, 'Remove', (l) => ops.removeTracks(l, indexes));
      undoStack.pop();
    }
    set({ undoLabel: undoStack[undoStack.length - 1]?.label ?? null });
  },
  /**
   * Plays `track` from `ms`, as a bookmark does: a seek if it is already the current track,
   * otherwise it goes in right after the current one and starts there.
   */
  async jumpTo(track: Track, ms: number) {
    const q = active();
    if (q.tracks[q.currentIndex]?.id === track.id) {
      await engine.seek(ms);
      if (!isPlaying()) await engine.play();
      return;
    }
    const at = q.currentIndex + 1;
    await edit(q.id, 'Play bookmark', (l) => ops.insertTracks(l, at, [track]));
    await loadIndex(Math.max(0, active().tracks.indexOf(track)), { startMs: ms });
  },
  /** Hearts or un-hearts a track, wherever it is. The lock screen's like command lands here. */
  async setFavorite(track: Track, favorite: boolean) {
    patchTracks([track.id], { favorite: favorite ? 1 : 0 });
    const target = db;
    if (target) {
      await serial(() => setFavorite(target, track.id, favorite));
      libraryEvents.emit('changed', undefined);
    }
  },
  /** Reverts the most recent edit, on whichever queue it was made. */
  async undo() {
    const entry = undoStack.pop();
    set({ undoLabel: undoStack[undoStack.length - 1]?.label ?? null });
    if (!entry) return;
    const q = getQueue(entry.queueId);
    if (!q) return;
    const playingId = q.tracks[q.currentIndex]?.id;
    updateQueue(q.id, { tracks: entry.tracks, currentIndex: entry.currentIndex, savedMs: entry.positionMs });
    saveTracks(q.id);
    if (q.id !== state.activeId) {
      saveInactivePosition(getQueue(q.id)!);
      return;
    }
    const restoredId = entry.tracks[entry.currentIndex]?.id;
    if (restoredId === undefined) {
      await engine.stop();
      set({ positionMs: 0, durationMs: 0 });
    } else if (restoredId !== playingId || state.state === 'idle') {
      await loadIndex(entry.currentIndex, { autoplay: isPlaying(), startMs: entry.positionMs });
    } else {
      savePosition();
      armNext();
    }
  },

  setRepeat(repeat: RepeatMode, queueId = state.activeId) {
    if (!getQueue(queueId)) return;
    updateQueue(queueId, { repeat });
    persist((d) => setQueueRepeat(d, queueId, repeat));
    if (queueId === state.activeId) armNext();
  },
  cycleRepeat(queueId = state.activeId) {
    const q = getQueue(queueId);
    if (q) queue.setRepeat(ops.cycleRepeat(q.repeat), queueId);
  },

  // Queue tabs.
  /** Makes another queue the active one, picking up where it was left and keeping play/pause. */
  async switchTo(queueId: number) {
    if (queueId === state.activeId) return;
    const target = getQueue(queueId);
    if (!target) return;
    const wasPlaying = isPlaying();
    activate(queueId);
    if (target.currentIndex < 0) {
      await engine.stop();
      set({ positionMs: 0, durationMs: 0 });
      return;
    }
    await loadIndex(target.currentIndex, { autoplay: wasPlaying, startMs: target.savedMs });
  },
  /** Returns the new queue's id, or null at the limit. */
  async createQueue(opts: { name?: string; tracks?: Track[] } = {}): Promise<number | null> {
    const target = db;
    if (!target || state.queues.length >= MAX_QUEUES) return null;
    const name = opts.name?.trim() || nextQueueName();
    const tracks = opts.tracks ?? [];
    const id = await serial(() => createQueue(target, name, state.queues.length));
    set({
      queues: [...state.queues, { id, name, tracks, currentIndex: tracks.length ? 0 : -1, savedMs: 0, repeat: 'off' }],
    });
    if (tracks.length) {
      saveTracks(id);
      saveInactivePosition(getQueue(id)!);
    }
    return id;
  },
  /** The last queue cannot go; deleting it clears it instead. */
  async deleteQueue(queueId: number) {
    if (state.queues.length <= 1) return queue.clear(queueId);
    const at = state.queues.findIndex((q) => q.id === queueId);
    if (at < 0) return;
    if (queueId === state.activeId) {
      const others = state.queues.filter((q) => q.id !== queueId);
      await queue.switchTo(others[Math.min(at, others.length - 1)].id);
    }
    const remaining = state.queues.filter((q) => q.id !== queueId);
    for (let i = undoStack.length - 1; i >= 0; i -= 1) if (undoStack[i].queueId === queueId) undoStack.splice(i, 1);
    set({ queues: remaining, undoLabel: undoStack[undoStack.length - 1]?.label ?? null });
    persist((d) => deleteQueue(d, queueId));
    persist((d) => saveQueueOrder(d, remaining.map((q) => q.id)));
  },
  renameQueue(queueId: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateQueue(queueId, { name: trimmed });
    persist((d) => renameQueue(d, queueId, trimmed));
  },
  /** Moves a tab one place left (-1) or right (+1). */
  moveQueue(queueId: number, by: -1 | 1) {
    const from = state.queues.findIndex((q) => q.id === queueId);
    const to = from + by;
    if (from < 0 || to < 0 || to >= state.queues.length) return;
    const queues = state.queues.slice();
    [queues[from], queues[to]] = [queues[to], queues[from]];
    set({ queues });
    persist((d) => saveQueueOrder(d, queues.map((q) => q.id)));
  },
};

/**
 * Puts back every queue and the active one's position from the last run, paused. Called once
 * from the database's `onInit`, so it has finished before the first screen renders. Never
 * throws: a failure here should cost the saved queues, not the launch.
 */
export async function restoreQueue(database: SQLiteDatabase): Promise<void> {
  db = database;
  try {
    const heads = await listQueueHeads(database);
    const queues: QueueInfo[] = [];
    let activeStartMs = 0;
    const activeSetting = await getSetting(database, 'activeQueueId');
    const activeId = heads.some((h) => h.id === activeSetting) ? activeSetting! : (heads[0]?.id ?? DEFAULT_QUEUE_ID);
    for (const head of heads) {
      const saved = await loadQueue(database, head.id);
      queues.push({
        id: head.id,
        name: head.name,
        tracks: saved.tracks,
        currentIndex: saved.currentIndex,
        savedMs: saved.startMs,
        repeat: head.repeat,
      });
      if (head.id === activeId) activeStartMs = saved.startMs;
    }
    if (queues.length === 0) return;
    set({ queues, activeId });
    const current = active();
    if (current.currentIndex >= 0) await loadIndex(current.currentIndex, { autoplay: false, startMs: activeStartMs });
  } catch (err) {
    console.warn('[melodify] restoring the queue failed:', err);
  }
}

/**
 * Runs `write` with the engine's hold on these songs' files let go. A tag write can move the audio
 * inside a file, which an open reader would then read from the wrong place, so the playing song
 * is stopped and loaded again afterwards, where it was and playing if it was, and whatever was
 * armed to follow is armed again from the new file.
 */
export async function withTracksReleased<T>(ids: number[], write: () => Promise<T>): Promise<T> {
  const wanted = new Set(ids);
  const q = active();
  const current = q.tracks[q.currentIndex];
  const holdsCurrent = current !== undefined && wanted.has(current.id);
  const wasPlaying = isPlaying();
  const at = resumeMs();
  await engine.setNext(null).catch(() => undefined);
  if (holdsCurrent) await engine.stop().catch(() => undefined);
  try {
    return await write();
  } finally {
    if (holdsCurrent) await loadIndex(active().currentIndex, { autoplay: wasPlaying, startMs: at }).catch(() => undefined);
    else armNext();
  }
}

/** After the playing song's row changed (a tag edit): the lock screen shows the new tags. */
export function refreshNowPlaying(): void {
  const q = active();
  const current = q.tracks[q.currentIndex];
  if (current) engine.updateNowPlaying(nowPlayingMeta(current));
}

/**
 * Before a restore rewrites the queue tables: stops playback and stops saving, so no position
 * save from the old queues lands on top of the restored ones. `reloadQueues` turns saving back on.
 */
export async function detachQueues(): Promise<void> {
  db = null;
  await engine.stop().catch(() => undefined);
}

/**
 * Throws away every queue in memory and loads them again from the database, stopped and cued
 * paused, as at launch. For after a restore has replaced the tables underneath the store; the
 * undo history refers to the old queues, so it goes too.
 */
export async function reloadQueues(database: SQLiteDatabase): Promise<void> {
  await engine.stop().catch(() => undefined);
  undoStack.length = 0;
  resumeCache.clear();
  savedMs = 0;
  set({
    queues: [EMPTY_QUEUE], activeId: DEFAULT_QUEUE_ID, state: 'idle', positionMs: 0, durationMs: 0, undoLabel: null,
  });
  await restoreQueue(database);
}

/**
 * Engine calls made from an event handler have no caller to await them, so a rejection would
 * surface as an unhandled one with no UI attached. Track ends and lock screen commands both
 * arrive that way.
 */
function run(op: Promise<unknown>): void {
  void op.catch((err: unknown) => {
    console.warn('[melodify] engine call failed:', err);
  });
}

engine.on('state', (s) => {
  set({ state: s });
  if (loading === 0 && (s === 'paused' || s === 'ended' || s === 'idle')) savePosition();
});
engine.on('position', (p) => {
  if (loading > 0) return;
  set({ positionMs: p.positionMs, durationMs: p.durationMs });
  if (!counted && state.state === 'playing' && p.positionMs >= playThreshold(p.durationMs)) {
    counted = true;
    // Only the row: the in-memory copy's count is not shown anywhere that reads it.
    const track = state.tracks[state.currentIndex];
    if (track) {
      const at = Date.now();
      persist((d) => recordPlay(d, track.id, at));
    }
  }
  // Also catches a seek, which moves the position by more than this in one tick.
  if (Math.abs(p.positionMs - savedMs) >= SAVE_EVERY_MS) savePosition(p.positionMs);
});
// Leaving the app is the last reliable moment before it may be killed without warning.
AppState.addEventListener('change', (next) => {
  if (next !== 'active') savePosition();
});
/**
 * Consulted when a track ends by itself, before the queue moves on. The sleep timer uses it to
 * stop after a number of songs; 'pause' still advances, but leaves the next track paused.
 * `wouldPause` asks ahead, without counting, so the last song is not run into the next.
 */
interface TrackEndHook {
  onEnd(): 'continue' | 'pause';
  wouldPause(): boolean;
}
let trackEndHook: TrackEndHook | null = null;

export function setTrackEndHook(hook: TrackEndHook | null): void {
  trackEndHook = hook;
}

async function onTrackEnded() {
  if (trackEndHook?.onEnd() !== 'pause') return queue.next(false);
  const q = active();
  const i = ops.nextIndex(q.tracks.length, q.currentIndex, q.repeat, true);
  if (i < 0) await engine.stop();
  else await loadIndex(i, { autoplay: false });
}

engine.on('ended', () => run(onTrackEnded()));

/**
 * Pulled headphones pause playback (the engine does that itself); with the preference on, the
 * same song carries on when headphones connect again. Only after an unplug: plugging in never
 * starts music that was paused on purpose.
 */
let pausedByUnplug = false;
engine.on('routeChange', ({ reason, wasPlaying }) => {
  if (reason === 'unplugged') {
    // Only an unplug that stopped running music. A build that cannot say is taken as not.
    pausedByUnplug = wasPlaying === true;
  } else if (reason === 'connected' && pausedByUnplug) {
    pausedByUnplug = false;
    if (getPrefs().resumeOnConnect && state.state === 'paused') run(engine.play());
  }
});
engine.on('state', (s) => {
  if (s === 'playing') pausedByUnplug = false;
});

/**
 * The engine moved on to the armed track by itself. The queue catches up: the key says which
 * track it was armed as; if the queue changed since and that index no longer holds it, the same
 * track after the old current one stands in, and failing that the queue moves on normally.
 */
function onAdvanced(key: string) {
  const [generation, queueId, index, trackId] = key.split(':').map(Number);
  // Sent before a load that has since replaced what was playing: the load decides.
  if (loading > 0 || generation !== loadGeneration) return;
  const q = active();
  let at = queueId === q.id && q.tracks[index]?.id === trackId ? index : -1;
  if (at < 0) at = q.tracks.findIndex((t, i) => i > q.currentIndex && t.id === trackId);
  if (at < 0) at = q.tracks.findIndex((t) => t.id === trackId);
  // Nothing is armed when the sleep timer would stop at this end, but an arming can lose the
  // race with the timer being set; then it stops here, just after the change.
  const stopHere = trackEndHook?.onEnd() === 'pause';
  if (at < 0) {
    run(stopHere ? engine.pause() : queue.next(false));
    return;
  }
  const track = q.tracks[at];
  counted = false;
  updateQueue(q.id, { currentIndex: at });
  set({ positionMs: 0, durationMs: track.duration_ms ?? 0 });
  savePosition(0);
  if (stopHere) run(engine.pause());
  armNext();
}

engine.on('advanced', ({ key }) => onAdvanced(key));

// The armed track carries its gain and depends on whether it resumes mid-way, so settings that
// change either arm it again. Before the queue is restored there is nothing to arm.
let armedWith = '';
subscribePrefs(() => {
  const p = getPrefs();
  const next = `${p.replayGain}:${p.replayGainPreampDb}:${p.resumeMinMs}`;
  if (next === armedWith) return;
  armedWith = next;
  if (db) armNext();
});
engine.on('remote', (cmd) => {
  switch (cmd.type) {
    case 'play': return run(engine.play());
    case 'pause': return run(engine.pause());
    case 'toggle': return run(queue.toggle());
    case 'next': return run(queue.next());
    case 'previous': return run(queue.previous());
    case 'seek': return run(engine.seek(cmd.positionMs));
    case 'skipForward': return run(engine.seek(state.positionMs + cmd.intervalMs));
    case 'skipBackward': return run(engine.seek(Math.max(0, state.positionMs - cmd.intervalMs)));
    case 'like': {
      const track = state.tracks[state.currentIndex];
      return track ? run(queue.setFavorite(track, !track.favorite)) : undefined;
    }
  }
});

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

const getState = () => state;

export function useQueue() {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return { ...snapshot, ...queue };
}

/** Read the store outside React, e.g. from an action sheet handler. */
export function queueSnapshot(): StoreState {
  return state;
}

/**
 * The playing track on its own. Its identity only changes when the track does, so anything that
 * does not care about position can subscribe without re-rendering four times a second.
 */
export function useCurrentTrack(): Track | null {
  const get = () => state.tracks[state.currentIndex] ?? null;
  return useSyncExternalStore(subscribe, get, get);
}

/** What undo would revert, without the position ticks. */
export function useUndoLabel(): string | null {
  const get = () => state.undoLabel;
  return useSyncExternalStore(subscribe, get, get);
}

/** The queue list without the position ticks, for the queue tabs. */
export function useQueues(): { queues: QueueInfo[]; activeId: number } {
  const get = () => state.queues;
  const queues = useSyncExternalStore(subscribe, get, get);
  const activeId = useSyncExternalStore(subscribe, () => state.activeId, () => state.activeId);
  return { queues, activeId };
}
