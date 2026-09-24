import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_QUEUE_ID, loadQueue, saveQueuePosition, saveQueueTracks } from '@/db/queues';
import type { Track } from '@/db/types';
import { artUri } from '@/components/artwork';
import { engine, type PlaybackState } from './index';

/**
 * Single queue driving the engine, held in memory and mirrored to `queues` / `queue_tracks` so it
 * survives a restart. Phase 2 turns this into multiple queues; the hook API stays the same.
 */
interface QueueState {
  tracks: Track[];
  currentIndex: number;
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
}

let state: QueueState = { tracks: [], currentIndex: -1, state: 'idle', positionMs: 0, durationMs: 0 };
const subscribers = new Set<() => void>();

function set(patch: Partial<QueueState>) {
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn());
}

function trackUri(track: Track): string {
  return Paths.join(Paths.document, track.path);
}

// Persistence. Set by `restoreQueue`, which runs before any screen can touch the queue.
let db: SQLiteDatabase | null = null;
let writes: Promise<void> = Promise.resolve();
/** Position last written, so the 4 Hz position tick only writes every few seconds. */
let savedMs = 0;
const SAVE_EVERY_MS = 5000;

/**
 * Writes run one at a time, in order. Two overlapping transactions on one connection would fail
 * outright, and a position save must not land before the track list it indexes into.
 */
function persist(op: (db: SQLiteDatabase) => Promise<void>): void {
  const target = db;
  if (!target) return;
  writes = writes
    .then(() => op(target))
    .catch((err: unknown) => console.warn('[melodify] saving the queue failed:', err));
}

function saveTracks(): void {
  const ids = state.tracks.map((t) => t.id);
  persist((d) => saveQueueTracks(d, DEFAULT_QUEUE_ID, ids));
}

/**
 * Where the current track should pick up again. A queue that ran out comes back at the start of
 * its last track, not parked at the very end of it.
 */
function resumeMs(): number {
  return state.state === 'ended' || state.state === 'idle' ? 0 : state.positionMs;
}

/**
 * Callers that know the position pass it. The fallback reads the playback state, which lags
 * behind during a load: while restoring, the engine still reads idle when the first tick lands.
 */
function savePosition(ms = resumeMs()): void {
  if (state.currentIndex < 0) return;
  const index = state.currentIndex;
  savedMs = ms;
  persist((d) => saveQueuePosition(d, DEFAULT_QUEUE_ID, index, ms));
}

async function loadIndex(index: number, opts: { autoplay?: boolean; startMs?: number } = {}) {
  const track = state.tracks[index];
  if (!track) return;
  const startMs = opts.startMs ?? track.resume_ms ?? 0;
  set({ currentIndex: index, positionMs: startMs, durationMs: track.duration_ms ?? 0 });
  savePosition(startMs);
  await engine.load(
    trackUri(track),
    { title: track.title, artist: track.artist, album: track.album, durationMs: track.duration_ms, artUri: artUri(track.art_key) },
    { autoplay: opts.autoplay ?? true, startMs },
  );
  const next = state.tracks[index + 1];
  if (next) void engine.preload(trackUri(next));
}

export const queue = {
  /** Replace the queue with `tracks` and start at `index`. */
  async replace(tracks: Track[], index: number) {
    set({ tracks });
    saveTracks();
    await loadIndex(index);
  },
  async playAt(index: number) {
    await loadIndex(index);
  },
  async next() {
    if (state.currentIndex + 1 < state.tracks.length) await loadIndex(state.currentIndex + 1);
    else await engine.stop();
  },
  async previous() {
    if (state.positionMs > 3000 || state.currentIndex === 0) await engine.seek(0);
    else await loadIndex(state.currentIndex - 1);
  },
  async toggle() {
    if (state.state === 'playing') await engine.pause();
    else await engine.play();
  },
  seek: (ms: number) => engine.seek(ms),
  append(tracks: Track[]) {
    set({ tracks: [...state.tracks, ...tracks] });
    saveTracks();
  },
  playNext(tracks: Track[]) {
    const at = state.currentIndex + 1;
    set({ tracks: [...state.tracks.slice(0, at), ...tracks, ...state.tracks.slice(at)] });
    saveTracks();
  },
};

/**
 * Puts back the queue and position from the last run, paused. Called once from the database's
 * `onInit`, so it has finished before the first screen renders. Never throws: a failure here
 * should cost the saved queue, not the launch.
 */
export async function restoreQueue(database: SQLiteDatabase): Promise<void> {
  db = database;
  try {
    const saved = await loadQueue(database, DEFAULT_QUEUE_ID);
    if (saved.currentIndex < 0) return;
    set({ tracks: saved.tracks });
    await loadIndex(saved.currentIndex, { autoplay: false, startMs: saved.startMs });
  } catch (err) {
    console.warn('[melodify] restoring the queue failed:', err);
  }
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
  if (s === 'paused' || s === 'ended' || s === 'idle') savePosition();
});
engine.on('position', (p) => {
  set({ positionMs: p.positionMs, durationMs: p.durationMs });
  // Also catches a seek, which moves the position by more than this in one tick.
  if (Math.abs(p.positionMs - savedMs) >= SAVE_EVERY_MS) savePosition(p.positionMs);
});
// Leaving the app is the last reliable moment before it may be killed without warning.
AppState.addEventListener('change', (next) => {
  if (next !== 'active') savePosition();
});
engine.on('ended', () => run(queue.next()));
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
    case 'like': return; // Phase 3: toggle favorite
  }
});

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function useQueue() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  return { ...snapshot, ...queue };
}

/**
 * The playing track on its own. Its identity only changes when the track does, so anything that
 * does not care about position can subscribe without re-rendering four times a second.
 */
export function useCurrentTrack(): Track | null {
  const get = () => state.tracks[state.currentIndex] ?? null;
  return useSyncExternalStore(subscribe, get, get);
}
