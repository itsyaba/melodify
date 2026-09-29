import type { SQLiteDatabase } from 'expo-sqlite';
import type { Track } from './types';

const DAY_MS = 86_400_000;

/**
 * The spans Most played can cover. The dated ones count the plays table; All time is the tracks'
 * own play_count, which also holds plays from before the table and from a Musicolet restore.
 */
export const PLAY_PERIODS = [
  { key: 'week', days: 7, label: 'Last week' },
  { key: 'month', days: 30, label: 'Last month' },
  { key: '6months', days: 182, label: 'Last 6 months' },
  { key: 'year', days: 365, label: 'Last year' },
  { key: 'all', days: null, label: 'All time' },
] as const;

export type PlayPeriod = (typeof PLAY_PERIODS)[number]['key'];

export interface MostPlayed {
  /** Most played first; ties go to the one played last. */
  tracks: Track[];
  /** Plays inside the span, by position in `tracks`. */
  plays: number[];
}

/**
 * The songs played inside the span, most played first. `where` picks the visible ones, over
 * `tracks`. Rows come back as plain tracks, the count beside them, so they can go into a queue.
 */
export async function listMostPlayed(db: SQLiteDatabase, where: string, days: number | null, now = Date.now()): Promise<MostPlayed> {
  const rows =
    days === null
      ? await db.getAllAsync<Track & { plays: number }>(
          `SELECT *, play_count AS plays FROM tracks WHERE ${where} AND play_count > 0
           ORDER BY play_count DESC, last_played_at DESC`,
        )
      : await db.getAllAsync<Track & { plays: number }>(
          `SELECT tracks.*, p.plays FROM tracks
           JOIN (SELECT track_id, COUNT(*) AS plays, MAX(played_at) AS last FROM plays
                 WHERE played_at >= ? GROUP BY track_id) p ON p.track_id = tracks.id
           WHERE ${where}
           ORDER BY p.plays DESC, p.last DESC`,
          now - days * DAY_MS,
        );
  const plays = rows.map((r) => r.plays);
  const tracks = rows.map(({ plays: _plays, ...track }) => track as Track);
  return { tracks, plays };
}

export interface PlaySummary {
  /** Songs played at least once inside each span. */
  counts: Record<PlayPeriod, number>;
  /** The covers of the most played songs in each, each cover once. */
  covers: Record<PlayPeriod, string[]>;
}

/** A count and a few covers per span, for the cards that pick one. */
export async function summarizeMostPlayed(db: SQLiteDatabase, where: string, now = Date.now(), limit = 3): Promise<PlaySummary> {
  const rows = await Promise.all(
    PLAY_PERIODS.map(async (p) => {
      const inSpan =
        p.days === null
          ? `SELECT id, art_key, play_count AS plays, last_played_at AS last FROM tracks WHERE ${where} AND play_count > 0`
          : `SELECT tracks.id, tracks.art_key, p.plays, p.last FROM tracks
             JOIN (SELECT track_id, COUNT(*) AS plays, MAX(played_at) AS last FROM plays
                   WHERE played_at >= $cutoff GROUP BY track_id) p ON p.track_id = tracks.id
             WHERE ${where}`;
      const params: Record<string, number> = p.days === null ? {} : { $cutoff: now - p.days * DAY_MS };
      const [count, covers] = await Promise.all([
        db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM (${inSpan})`, params),
        db.getAllAsync<{ art_key: string }>(
          `SELECT art_key FROM (${inSpan}) WHERE art_key IS NOT NULL
           GROUP BY art_key ORDER BY MAX(plays) DESC, MAX(last) DESC LIMIT $limit`,
          { ...params, $limit: limit },
        ),
      ]);
      return { count: count?.n ?? 0, covers: covers.map((c) => c.art_key) };
    }),
  );
  return {
    counts: Object.fromEntries(PLAY_PERIODS.map((p, i) => [p.key, rows[i].count])) as Record<PlayPeriod, number>,
    covers: Object.fromEntries(PLAY_PERIODS.map((p, i) => [p.key, rows[i].covers])) as Record<PlayPeriod, string[]>,
  };
}
