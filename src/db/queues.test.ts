import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { loadQueue, saveQueuePosition, saveQueueTracks } from './queues.ts';

/** Queue 1 (seeded by the schema) holding four tracks, saved at `index` and `ms`. */
async function setup(index: number, ms: number) {
  const db = openTestDb();
  const ids = [0, 1, 2, 3].map((n) => insertTrack(db, `Album/0${n} Track.mp3`, { title: `Track ${n}` }));
  await saveQueueTracks(db, 1, ids);
  await saveQueuePosition(db, 1, index, ms);
  return { db, ids };
}

test('restores the saved track and position', async () => {
  const { db, ids } = await setup(2, 61_000);
  const saved = await loadQueue(db, 1);
  assert.equal(saved.currentIndex, 2);
  assert.equal(saved.tracks[2].id, ids[2]);
  assert.equal(saved.startMs, 61_000);
});

test('rows come back as plain tracks, in queue order', async () => {
  const { db, ids } = await setup(0, 0);
  const saved = await loadQueue(db, 1);
  assert.deepEqual(saved.tracks.map((t) => t.id), ids);
  assert.equal('position' in saved.tracks[0], false);
});

test('a deleted current track falls forward to the next survivor, from the start', async () => {
  const { db, ids } = await setup(2, 61_000);
  // A rescan removed the current file; the queue is now positions 0, 1, 3.
  db.raw.prepare('DELETE FROM tracks WHERE id = ?').run(ids[2]);
  const saved = await loadQueue(db, 1);
  assert.equal(saved.currentIndex, 2);
  assert.equal(saved.tracks[2].id, ids[3]);
  assert.equal(saved.startMs, 0);
});

test('with nothing after the deleted track, falls back to the last one', async () => {
  const { db, ids } = await setup(3, 1000);
  db.raw.prepare('DELETE FROM tracks WHERE id = ?').run(ids[3]);
  const saved = await loadQueue(db, 1);
  assert.equal(saved.currentIndex, 2);
  assert.equal(saved.startMs, 0);
});

test('an empty queue restores as empty', async () => {
  const db = openTestDb();
  assert.deepEqual(await loadQueue(db, 1), { tracks: [], currentIndex: -1, startMs: 0 });
});
