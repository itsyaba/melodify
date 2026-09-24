import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SQLiteDatabase } from 'expo-sqlite';
import { loadQueue } from './queues.ts';

/** Just enough of SQLiteDatabase for `loadQueue`: the queue row, then its joined tracks. */
function fakeDb(head: { current_index: number; current_ms: number } | null, positions: number[]): SQLiteDatabase {
  const rows = positions.map((position) => ({ id: 100 + position, title: `Track ${position}`, queue_position: position }));
  return {
    getFirstAsync: async () => head,
    getAllAsync: async () => rows,
  } as unknown as SQLiteDatabase;
}

test('restores the saved track and position', async () => {
  const saved = await loadQueue(fakeDb({ current_index: 2, current_ms: 61_000 }, [0, 1, 2, 3]), 1);
  assert.equal(saved.currentIndex, 2);
  assert.equal(saved.tracks[2].id, 102);
  assert.equal(saved.startMs, 61_000);
});

test('strips the join column from the tracks', async () => {
  const saved = await loadQueue(fakeDb({ current_index: 0, current_ms: 0 }, [0]), 1);
  assert.equal('queue_position' in saved.tracks[0], false);
});

test('a deleted current track falls forward to the next survivor, from the start', async () => {
  // Position 2 was removed by a rescan; the list is now 0, 1, 3.
  const saved = await loadQueue(fakeDb({ current_index: 2, current_ms: 61_000 }, [0, 1, 3]), 1);
  assert.equal(saved.currentIndex, 2);
  assert.equal(saved.tracks[2].id, 103);
  assert.equal(saved.startMs, 0);
});

test('with nothing after the deleted track, falls back to the last one', async () => {
  const saved = await loadQueue(fakeDb({ current_index: 5, current_ms: 1000 }, [0, 1]), 1);
  assert.equal(saved.currentIndex, 1);
  assert.equal(saved.startMs, 0);
});

test('an empty queue restores as empty', async () => {
  assert.deepEqual(await loadQueue(fakeDb({ current_index: 0, current_ms: 0 }, []), 1), {
    tracks: [], currentIndex: -1, startMs: 0,
  });
});
