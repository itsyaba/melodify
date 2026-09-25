import { useSyncExternalStore } from 'react';
import { getPrefs } from '@/prefs';
import { closeLoop, loopSeek, startLoop, type AbLoop } from './ab-loop';
import { engine } from './index';
import { queueSnapshot } from './queue-store';

export type { AbLoop } from './ab-loop';

/**
 * Musicolet's A–B repeat. It watches the position events, which arrive about four times a
 * second, so the jump back to A lands within a quarter second of B. The loop belongs to one song
 * and ends when another one starts.
 */

/** After a jump to A, position events still in flight may report a spot past B; ignore them. */
const SEEK_SETTLE_MS = 800;

let loop: AbLoop | null = null;
let seekedAt = 0;
const subscribers = new Set<() => void>();

function publish(next: AbLoop | null) {
  loop = next;
  subscribers.forEach((fn) => fn());
}

function currentTrackId(): number | undefined {
  const s = queueSnapshot();
  return s.tracks[s.currentIndex]?.id;
}

export type MarkResult = 'a' | 'b' | 'off' | 'too-short';

export const abRepeat = {
  /**
   * The one-button version: the first press sets A, the second sets B and starts looping, the
   * third turns it off. A B too close to A is refused and A stays.
   */
  mark(trackId: number, positionMs: number, durationMs: number): MarkResult {
    if (loop && loop.trackId === trackId && loop.bMs === null) {
      const closed = closeLoop(loop, positionMs, durationMs, getPrefs().crossfadeMs);
      if (!closed) return 'too-short';
      publish(closed);
      return 'b';
    }
    if (loop && loop.trackId === trackId) {
      publish(null);
      return 'off';
    }
    publish(startLoop(trackId, positionMs));
    return 'a';
  },
  /** Moves A, keeping B when it is still far enough after it. */
  setA(trackId: number, positionMs: number, durationMs: number) {
    const start = startLoop(trackId, positionMs);
    const keptB = loop?.trackId === trackId && loop.bMs !== null ? closeLoop(start, loop.bMs, durationMs, getPrefs().crossfadeMs) : null;
    publish(keptB ?? start);
  },
  /** False when there is no A on this song, or B would be too close to it. */
  setB(trackId: number, positionMs: number, durationMs: number): boolean {
    if (!loop || loop.trackId !== trackId) return false;
    const closed = closeLoop(loop, positionMs, durationMs, getPrefs().crossfadeMs);
    if (closed) publish(closed);
    return closed !== null;
  },
  clear() {
    if (loop) publish(null);
  },
  get(): AbLoop | null {
    return loop;
  },
};

engine.on('position', (p) => {
  if (!loop) return;
  const trackId = currentTrackId();
  if (trackId !== loop.trackId) {
    publish(null);
    return;
  }
  const to = loopSeek(loop, trackId, p.positionMs);
  if (to === null || Date.now() - seekedAt < SEEK_SETTLE_MS) return;
  seekedAt = Date.now();
  void engine.seek(to).catch(() => undefined);
});

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

const getLoop = () => loop;

/** The loop on `trackId`, or null when there is none on that song. */
export function useAbLoop(trackId: number | undefined): AbLoop | null {
  const current = useSyncExternalStore(subscribe, getLoop, getLoop);
  return current && current.trackId === trackId ? current : null;
}
