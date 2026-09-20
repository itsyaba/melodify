import { useSyncExternalStore } from 'react';
import { Paths } from 'expo-file-system';
import type { Track } from '@/db/types';
import { artUri } from '@/components/artwork';
import { engine, type PlaybackState } from './index';

/**
 * Single in-memory queue driving the engine. Phase 2 turns this into multiple
 * persisted queues (tables `queues` / `queue_tracks`); the hook API stays the same.
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

async function loadIndex(index: number, autoplay = true) {
  const track = state.tracks[index];
  if (!track) return;
  set({ currentIndex: index, positionMs: 0, durationMs: track.duration_ms ?? 0 });
  await engine.load(
    trackUri(track),
    { title: track.title, artist: track.artist, album: track.album, durationMs: track.duration_ms, artUri: artUri(track.art_key) },
    { autoplay, startMs: track.resume_ms ?? 0 },
  );
  const next = state.tracks[index + 1];
  if (next) void engine.preload(trackUri(next));
}

export const queue = {
  /** Replace the queue with `tracks` and start at `index`. */
  async replace(tracks: Track[], index: number) {
    set({ tracks });
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
  },
  playNext(tracks: Track[]) {
    const at = state.currentIndex + 1;
    set({ tracks: [...state.tracks.slice(0, at), ...tracks, ...state.tracks.slice(at)] });
  },
};

engine.on('state', (s) => set({ state: s }));
engine.on('position', (p) => set({ positionMs: p.positionMs, durationMs: p.durationMs }));
engine.on('ended', () => void queue.next());
engine.on('remote', (cmd) => {
  switch (cmd.type) {
    case 'play': return void engine.play();
    case 'pause': return void engine.pause();
    case 'toggle': return void queue.toggle();
    case 'next': return void queue.next();
    case 'previous': return void queue.previous();
    case 'seek': return void engine.seek(cmd.positionMs);
    case 'skipForward': return void engine.seek(state.positionMs + cmd.intervalMs);
    case 'skipBackward': return void engine.seek(Math.max(0, state.positionMs - cmd.intervalMs));
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
