import { useSyncExternalStore } from 'react';
import { getPrefs } from '@/prefs';
import { engine } from './index';
import { setTrackEndHook } from './queue-store';

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

async function restoreVolume() {
  if (!faded) return;
  faded = false;
  await engine.setVolume(1).catch(() => undefined);
}

async function fire() {
  stopTicker();
  timer = { mode: 'off' };
  publish();
  await engine.pause().catch(() => undefined);
  await restoreVolume();
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
    void engine.setVolume(Math.max(0.03, left / FADE_MS)).catch(() => undefined);
  }
  publish();
}

export const sleepTimer = {
  minutes(minutes: number) {
    void restoreVolume();
    stopTicker();
    const totalMs = Math.round(minutes * 60_000);
    timer = { mode: 'minutes', endsAt: Date.now() + totalMs, totalMs };
    ticker = setInterval(tick, 1000);
    publish();
  },
  /** 1 is "at the end of this song". The current song counts as the first. */
  songs(count: number) {
    void restoreVolume();
    stopTicker();
    timer = { mode: 'songs', left: Math.max(1, Math.round(count)) };
    publish();
  },
  /** Adds time to a running minutes timer, or starts one. */
  extend(minutes: number) {
    if (timer.mode !== 'minutes') return sleepTimer.minutes(minutes);
    void restoreVolume();
    timer = { ...timer, endsAt: timer.endsAt + minutes * 60_000, totalMs: timer.totalMs + minutes * 60_000 };
    publish();
  },
  cancel() {
    stopTicker();
    timer = { mode: 'off' };
    void restoreVolume();
    publish();
  },
  get(): SleepTimer {
    return timer;
  },
};

// A song that ends by itself counts down the songs timer; at zero the queue moves on but paused,
// so pressing play later carries on with the next song rather than repeating this one.
setTrackEndHook(() => {
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
