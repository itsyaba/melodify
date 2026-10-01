import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { addBookmark, listBookmarks, renameBookmark, deleteBookmark } from './bookmarks.ts';

test('addBookmark stores track position and label', async () => {
  const db = openTestDb();
  const trackId = insertTrack(db, 'Podcasts/Episode01.mp3', { title: 'Episode 1' });
  const bmId = await addBookmark(db, trackId, 45_250, 'Key Insight');

  assert.ok(bmId > 0);
  const bookmarks = await listBookmarks(db);
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].id, bmId);
  assert.equal(bookmarks[0].track_id, trackId);
  assert.equal(bookmarks[0].position_ms, 45_250);
  assert.equal(bookmarks[0].label, 'Key Insight');
  assert.equal(bookmarks[0].track.title, 'Episode 1');
});

test('listBookmarks filters by trackId and sorts by position_ms', async () => {
  const db = openTestDb();
  const track1 = insertTrack(db, 'Audiobooks/Book1.mp3', { title: 'Book 1' });
  const track2 = insertTrack(db, 'Audiobooks/Book2.mp3', { title: 'Book 2' });

  await addBookmark(db, track1, 120_000, 'Chapter 2');
  await addBookmark(db, track1, 30_000, 'Chapter 1');
  await addBookmark(db, track2, 50_000, 'Intro');

  // Filter track 1 -> ordered by position_ms ascending
  const bmsTrack1 = await listBookmarks(db, track1);
  assert.equal(bmsTrack1.length, 2);
  assert.equal(bmsTrack1[0].position_ms, 30_000);
  assert.equal(bmsTrack1[1].position_ms, 120_000);

  // Global list -> 3 total
  const allBms = await listBookmarks(db);
  assert.equal(allBms.length, 3);
});

test('renameBookmark updates the label', async () => {
  const db = openTestDb();
  const trackId = insertTrack(db, 'Lectures/L1.mp3', { title: 'Lecture 1' });
  const bmId = await addBookmark(db, trackId, 10_000, 'Old Label');

  await renameBookmark(db, bmId, 'New Label');
  const bookmarks = await listBookmarks(db);
  assert.equal(bookmarks[0].label, 'New Label');
});

test('deleteBookmark removes the bookmark', async () => {
  const db = openTestDb();
  const trackId = insertTrack(db, 'Lectures/L2.mp3', { title: 'Lecture 2' });
  const bmId = await addBookmark(db, trackId, 10_000, 'To Delete');

  await deleteBookmark(db, bmId);
  const bookmarks = await listBookmarks(db);
  assert.equal(bookmarks.length, 0);
});

test('deleting a track cascades and removes its bookmarks', async () => {
  const db = openTestDb();
  const trackId = insertTrack(db, 'Music/Song.mp3', { title: 'Song' });
  await addBookmark(db, trackId, 60_000, 'Solo');

  db.raw.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
  const bookmarks = await listBookmarks(db);
  assert.equal(bookmarks.length, 0);
});
