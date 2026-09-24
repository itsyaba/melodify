import { useSyncExternalStore } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_MIN_DURATION_MS } from '@/constants';
import { getSetting, setSetting } from '@/db/settings';

/** User preferences, stored together as one JSON object under the `prefs` settings key. */
export interface Prefs {
  /** Skip back / forward buttons and the lock screen's skip commands, in seconds. */
  skipSeconds: number;
  /** Tracks at least this long remember where they were left. 0 turns it off. */
  resumeMinMs: number;
  /** Fade the volume down over the sleep timer's last half minute. */
  sleepFade: boolean;
  /** Songs shorter than this stay out of the library lists. 0 shows everything. */
  minDurationMs: number;
}

export const DEFAULT_PREFS: Prefs = {
  skipSeconds: 10,
  resumeMinMs: 10 * 60_000,
  sleepFade: true,
  minDurationMs: DEFAULT_MIN_DURATION_MS,
};

let prefs: Prefs = DEFAULT_PREFS;
const subscribers = new Set<() => void>();
let db: SQLiteDatabase | null = null;

/** Called once from the database's `onInit`, before the first screen reads anything. */
export async function loadPrefs(database: SQLiteDatabase): Promise<void> {
  db = database;
  try {
    const stored = await getSetting(database, 'prefs');
    prefs = { ...DEFAULT_PREFS, ...(stored ?? {}) };
  } catch (err) {
    console.warn('[melodify] loading preferences failed:', err);
  }
}

export function getPrefs(): Prefs {
  return prefs;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs = { ...prefs, [key]: value };
  subscribers.forEach((fn) => fn());
  const target = db;
  if (target) {
    void setSetting(target, 'prefs', prefs).catch((err: unknown) => console.warn('[melodify] saving preferences failed:', err));
  }
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
