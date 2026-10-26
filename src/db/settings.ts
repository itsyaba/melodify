import type { SQLiteDatabase } from 'expo-sqlite';
import type { MusicoletMeta } from '@/backup/musicolet';
import type { Prefs } from '@/prefs';

/**
 * Key-value settings, stored as JSON in the `settings` table. Every key the app reads is listed
 * here with its type, so a typo is a compile error rather than a setting that never sticks.
 */
export interface Settings {
  /** Queue that drives the engine. */
  activeQueueId: number;
  /** Most recent first, deduplicated, capped at `RECENT_SEARCHES`. */
  recentSearches: string[];
  /** Remembered UI choices (sort orders, the last library view), keyed by where they apply. */
  choices: Record<string, string>;
  /** Stored partial, so a preference added later takes its default. */
  prefs: Partial<Prefs>;
  /** When the last automatic backup was written, ms since epoch. */
  lastAutoBackupAt: number;
  /** From the last Musicolet backup restored, to write the same back (see src/backup/musicolet.ts). */
  musicolet: MusicoletMeta;
  /** When the welcome pages were finished or skipped, ms since epoch. */
  onboardedAt: number;
  /** Recap spans already shown ("2026-10", "2026"), so each arrives unasked only once. */
  recapsSeen: string[];
}

export const RECENT_SEARCHES = 12;

export async function getSetting<K extends keyof Settings>(
  db: SQLiteDatabase,
  key: K,
): Promise<Settings[K] | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Settings[K];
  } catch {
    return null;
  }
}

export async function setSetting<K extends keyof Settings>(db: SQLiteDatabase, key: K, value: Settings[K]): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}
