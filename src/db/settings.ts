import type { SQLiteDatabase } from 'expo-sqlite';
import type { Prefs } from '@/prefs';
import type { RecentItem } from '@/search/recent';

/**
 * Key-value settings, stored as JSON in the `settings` table. Every key the app reads is listed
 * here with its type, so a typo is a compile error rather than a setting that never sticks.
 */
export interface Settings {
  /** Queue that drives the engine. */
  activeQueueId: number;
  /** Most recent first, deduplicated, capped at `RECENT_SEARCHES`. */
  recentSearches: string[];
  /**
   * What was opened from Search (a song, album, artist, playlist or folder), most recent first,
   * capped at `RECENT_SEARCHES`. Not in backups: it names rows by id, and it is only history.
   */
  recentItems: RecentItem[];
  /** Remembered UI choices (sort orders, the last library view), keyed by where they apply. */
  choices: Record<string, string>;
  /** Stored partial, so a preference added later takes its default. */
  prefs: Partial<Prefs>;
  /** When the last automatic backup was written, ms since epoch. */
  lastAutoBackupAt: number;
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
