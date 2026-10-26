import type { SQLiteDatabase } from 'expo-sqlite';
import { countPlaysBetween } from '@/db/recap';
import { getSetting, setSetting } from '@/db/settings';
import { dueRecap, type RecapPeriod } from './period';

/**
 * Whether a recap is up, and which span it covers. It opens by itself once a month (and once a
 * year, in December), and Settings › Your recap opens any span on demand. A span is marked as
 * seen when its recap is closed, so it only ever arrives unasked once.
 */

/** A span with fewer plays than this has nothing to say, so it is never offered by itself. */
export const MIN_PLAYS = 20;

let current: RecapPeriod | null = null;
let db: SQLiteDatabase | null = null;
const subscribers = new Set<() => void>();

function publish(period: RecapPeriod | null) {
  current = period;
  subscribers.forEach((fn) => fn());
}

export function openRecap(period: RecapPeriod): void {
  publish(period);
}

/** Closes the recap and remembers that this span has been shown. */
export function closeRecap(): void {
  const period = current;
  publish(null);
  if (period && db) void markSeen(db, period);
}

export function currentRecap(): RecapPeriod | null {
  return current;
}

export function subscribeRecap(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

async function seenKeys(database: SQLiteDatabase): Promise<string[]> {
  return (await getSetting(database, 'recapsSeen')) ?? [];
}

async function markSeen(database: SQLiteDatabase, period: RecapPeriod): Promise<void> {
  try {
    const seen = await seenKeys(database);
    if (seen.includes(period.key)) return;
    // The last two years of months, and the years themselves, are more than enough history.
    await setSetting(database, 'recapsSeen', [...seen, period.key].slice(-30));
  } catch (err) {
    console.warn('[melodify] saving the recap state failed:', err);
  }
}

/**
 * At launch: opens the recap that is due, unless this span has been seen or holds too little to
 * be worth it. Called after the preferences and the welcome pages, so a first launch wins.
 */
export async function loadRecap(database: SQLiteDatabase, onboarding: boolean, now = new Date()): Promise<void> {
  db = database;
  if (onboarding) return;
  try {
    const period = dueRecap(now);
    if (!period) return;
    const seen = await seenKeys(database);
    if (seen.includes(period.key)) return;
    if ((await countPlaysBetween(database, period.from, period.to)) < MIN_PLAYS) return;
    publish(period);
  } catch (err) {
    console.warn('[melodify] reading the recap state failed:', err);
  }
}
