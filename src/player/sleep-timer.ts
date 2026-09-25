import { useSyncExternalStore } from 'react';
import { getPrefs } from '@/prefs';
import { engine } from './index';
import { refreshNext, setTrackEndHook } from './queue-store';
import { setFadeLevel } from './sound';

/**
 * Stops playback later: after some minutes, at the end of the current song, or after a number
 * of songs. The minutes version fades the volume down over its last half minute when the
 * preference is on. JS timers keep running in the background here because the app is playing
 * audio; once it pauses, iOS may suspend the app, but by then there is nothing left to stop.
 */
export type SleepTimer =
  | { mode: 'off' }
  | { mode: 'minutes'; endsAt: number; totalMs: number }
  | { mode: 'songs'; left: number };

const FADE_MS = 30_000;

let timer: SleepTimer = { mode: 'off' };
let ticker: ReturnType<typeof setInterval> | null = null;
let now = Date.now();
let faded = false;
const subscribers = new Set<() => void>();

function publish() {
  now = Date.now();
  subscribers.forEach((fn) => fn());
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function restoreVolume() {
  if (!faded) return;
  faded = false;
  setFadeLevel(1);
}

async function fire() {
  stopTicker();
  timer = { mode: 'off' };
  publish();
  await engine.pause().catch(() => undefined);
  restoreVolume();
}

function tick() {
  if (timer.mode !== 'minutes') return;
  const left = timer.endsAt - Date.now();
  if (left <= 0) {
    void fire();
    return;
  }
  if (getPrefs().sleepFade && left < FADE_MS) {
    faded = true;
    setFadeLevel(Math.max(0.03, left / FADE_MS));
  }
  publish();
}

export const sleepTimer = {
  minutes(minutes: number) {
    restoreVolume();
    stopTicker();
    const totalMs = Math.round(minutes * 60_000);
    timer = { mode: 'minutes', endsAt: Date.now() + totalMs, totalMs };
    ticker = setInterval(tick, 1000);
    publish();
  },
  /** 1 is "at the end of this song". The current song counts as the first. */
  songs(count: number) {
    restoreVolume();
    stopTicker();
    timer = { mode: 'songs', left: Math.max(1, Math.round(count)) };
    publish();
    // The last song must end for real rather than run into the next without a gap.
    refreshNext();
  },
  /** Adds time to a running minutes timer, or starts one. */
  extend(minutes: number) {
    if (timer.mode !== 'minutes') return sleepTimer.minutes(minutes);
    restoreVolume();
    timer = { ...timer, endsAt: timer.endsAt + minutes * 60_000, totalMs: timer.totalMs + minutes * 60_000 };
    publish();
  },
  cancel() {
    const wasSongs = timer.mode === 'songs';
    stopTicker();
    timer = { mode: 'off' };
    restoreVolume();
    publish();
    if (wasSongs) refreshNext();
  },
  get(): SleepTimer {
    return timer;
  },
};

// A song that ends by itself counts down the songs timer; at zero the queue moves on but paused,
// so pressing play later carries on with the next song rather than repeating this one. Before the
// last song the queue asks, and arms nothing, so that one really ends.
setTrackEndHook({
  wouldPause: () => timer.mode === 'songs' && timer.left <= 1,
  onEnd: () => {
    if (timer.mode !== 'songs') return 'continue';
    const left = timer.left - 1;
    if (left > 0) {
      timer = { mode: 'songs', left };
      publish();
      return 'continue';
    }
    timer = { mode: 'off' };
    publish();
    return 'pause';
  },
});

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** The timer and, for the minutes version, what is left of it (updated once a second). */
export function useSleepTimer(): { timer: SleepTimer; remainingMs: number } {
  const t = useSyncExternalStore(subscribe, () => timer, () => timer);
  const at = useSyncExternalStore(subscribe, () => now, () => now);
  return { timer: t, remainingMs: t.mode === 'minutes' ? Math.max(0, t.endsAt - at) : 0 };
}
