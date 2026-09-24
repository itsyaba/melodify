import type { SQLiteDatabase } from 'expo-sqlite';
import type { Track } from './types';

/** Seeded by migration v1. Phase 1 plays from this one queue; Phase 2's queue tabs add the rest. */
export const DEFAULT_QUEUE_ID = 1;

export interface SavedQueue {
  tracks: Track[];
  /** Index into `tracks` of the track that was current, or -1 for an empty queue. */
  currentIndex: number;
  /** Where to start it. 0 when the saved track is gone and the one after it stands in. */
  startMs: number;
}

export async function loadQueue(db: SQLiteDatabase, queueId: number): Promise<SavedQueue> {
  const head = await db.getFirstAsync<{ current_index: number; current_ms: number }>(
    'SELECT current_index, current_ms FROM queues WHERE id = ?',
    queueId,
  );
  const rows = await db.getAllAsync<Track & { queue_position: number }>(
    `SELECT t.*, q.position AS queue_position
     FROM queue_tracks q JOIN tracks t ON t.id = q.track_id
     WHERE q.queue_id = ?
     ORDER BY q.position`,
    queueId,
  );
  if (!head || rows.length === 0) return { tracks: [], currentIndex: -1, startMs: 0 };

  // Positions are written contiguous, but a rescan that removed a file removes its queue rows
  // too. The saved index is a position, so it is looked up as one, falling forward to the next
  // track that survived (or back to the last, if none after it did).
  const at = rows.findIndex((r) => r.queue_position >= head.current_index);
  const currentIndex = at === -1 ? rows.length - 1 : at;
  const exact = rows[currentIndex].queue_position === head.current_index;
  const tracks = rows.map(({ queue_position: _, ...track }) => track);
  return { tracks, currentIndex, startMs: exact ? head.current_ms : 0 };
}

/**
 * Replaces the queue's track list. The ids go in as one JSON array, so a 10k-track queue is one
 * statement rather than 10k round trips. Positions are the in-memory indexes, which is what makes
 * `current_index` line up with them; ids whose track has since been deleted are skipped, leaving
 * a gap rather than failing the whole write on the foreign key.
 */
export async function saveQueueTracks(db: SQLiteDatabase, queueId: number, trackIds: number[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM queue_tracks WHERE queue_id = ?', queueId);
    await db.runAsync(
      `INSERT INTO queue_tracks (queue_id, track_id, position)
       SELECT ?, j.value, j.key FROM json_each(?) j JOIN tracks t ON t.id = j.value`,
      queueId,
      JSON.stringify(trackIds),
    );
  });
}

export async function saveQueuePosition(
  db: SQLiteDatabase,
  queueId: number,
  currentIndex: number,
  currentMs: number,
): Promise<void> {
  await db.runAsync(
    'UPDATE queues SET current_index = ?, current_ms = ? WHERE id = ?',
    currentIndex,
    Math.round(currentMs),
    queueId,
  );
}
