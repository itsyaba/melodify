import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/settings';

/**
 * Whether the welcome pages are up. They come up by themselves once, on the first launch, and
 * Settings opens them again. An install that already had songs when they were added has been set
 * up without them, so it is marked as done instead of being shown them.
 */

let open = false;
let db: SQLiteDatabase | null = null;
const subscribers = new Set<() => void>();

function publish(value: boolean) {
  open = value;
  subscribers.forEach((fn) => fn());
}

/** Whether a launch with this database should start on the welcome pages. Marks an old install done. */
export async function shouldOnboard(database: SQLiteDatabase, now = Date.now()): Promise<boolean> {
  if (await getSetting(database, 'onboardedAt')) return false;
  // Any row counts, hidden or excluded: someone put music here without the pages.
  const row = await database.getFirstAsync<{ any: number }>('SELECT EXISTS (SELECT 1 FROM tracks) AS any');
  if (!row?.any) return true;
  await setSetting(database, 'onboardedAt', now);
  return false;
}

/** Called once from the database's `onInit`, so the first frame already shows the pages or not. */
export async function loadOnboarding(database: SQLiteDatabase): Promise<void> {
  db = database;
  try {
    open = await shouldOnboard(database);
  } catch (err) {
    console.warn('[melodify] reading the onboarding state failed:', err);
  }
}

export function showOnboarding(): void {
  publish(true);
}

/** Closes the pages for good: finished, skipped, or left for a restore. */
export function finishOnboarding(): void {
  publish(false);
  const target = db;
  if (target) {
    void setSetting(target, 'onboardedAt', Date.now()).catch((err: unknown) =>
      console.warn('[melodify] saving the onboarding state failed:', err),
    );
  }
}

export function isOnboardingOpen(): boolean {
  return open;
}

/** Runs `fn` whenever the pages open or close. Returns the unsubscribe. */
export function subscribeOnboarding(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
