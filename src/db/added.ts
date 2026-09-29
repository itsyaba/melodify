import type { SQLiteDatabase } from 'expo-sqlite';
import type { Track } from './types';

/**
 * When a song arrived, for Recently added: its file's modified date, or the scan that found it
 * when that is earlier. The first scan of a library finds every song at once, so the scan's date
 * alone would put the whole library in "the last 7 days"; the file's date says when it came onto
 * the phone. A file with no date (0) uses the scan's.
 */
export const ADDED_DATE = '(CASE WHEN mtime > 0 AND mtime < added_at THEN mtime ELSE added_at END)';

/** Newest first, then by path so songs added together keep a steady order. */
export const ADDED_ORDER = `${ADDED_DATE} DESC, path`;

const DAY_MS = 86_400_000;

/** The spans Recently added can show: the last so many days, or every song. */
export const ADDED_PERIODS = [
  { key: '7', days: 7, label: '7 days' },
  { key: '30', days: 30, label: '30 days' },
  { key: '60', days: 60, label: '60 days' },
  { key: 'all', days: null, label: 'All time' },
] as const;

export type AddedPeriod = (typeof ADDED_PERIODS)[number]['key'];

/** The earliest arrival date inside a span; every song is inside All time. */
export function addedCutoff(days: number | null, now: number): number {
  return days === null ? Number.MIN_SAFE_INTEGER : now - days * DAY_MS;
}

/** Songs that arrived inside the span, newest first. `where` picks the visible ones. */
export function listAddedSince(db: SQLiteDatabase, where: string, days: number | null, now = Date.now()): Promise<Track[]> {
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE ${where} AND ${ADDED_DATE} >= ? ORDER BY ${ADDED_ORDER}`,
    addedCutoff(days, now),
  );
}

/** How many songs each span holds, in one pass, for the cards that pick one. */
export async function countAddedPeriods(db: SQLiteDatabase, where: string, now = Date.now()): Promise<Record<AddedPeriod, number>> {
  const columns = ADDED_PERIODS.map((p, i) => `COALESCE(SUM(d >= $c${i}), 0) AS "${p.key}"`).join(', ');
  const params = Object.fromEntries(ADDED_PERIODS.map((p, i) => [`$c${i}`, addedCutoff(p.days, now)]));
  const row = await db.getFirstAsync<Record<AddedPeriod, number>>(
    `SELECT ${columns} FROM (SELECT ${ADDED_DATE} AS d FROM tracks WHERE ${where})`,
    params,
  );
  // Spread: a row can come back without a prototype.
  return { '7': 0, '30': 0, '60': 0, all: 0, ...row };
}

/**
 * Up to `limit` covers per span, from the songs that arrived last, each cover once (an album's
 * songs share one), for the stack on each card.
 */
export async function addedPeriodCovers(
  db: SQLiteDatabase,
  where: string,
  now = Date.now(),
  limit = 3,
): Promise<Record<AddedPeriod, string[]>> {
  const rows = await Promise.all(
    ADDED_PERIODS.map((p) =>
      db.getAllAsync<{ art_key: string }>(
        `SELECT art_key FROM tracks WHERE ${where} AND art_key IS NOT NULL AND ${ADDED_DATE} >= ?
         GROUP BY art_key ORDER BY MAX(${ADDED_DATE}) DESC, MIN(path) LIMIT ?`,
        addedCutoff(p.days, now),
        limit,
      ),
    ),
  );
  return Object.fromEntries(ADDED_PERIODS.map((p, i) => [p.key, rows[i].map((r) => r.art_key)])) as Record<AddedPeriod, string[]>;
}
