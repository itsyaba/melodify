import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { addedPeriodCovers, countAddedPeriods, listAddedSince } from './added.ts';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

/** Songs found by one scan today, whose files came onto the phone on different days. */
function setup() {
  const db = openTestDb();
  const ago = (days: number) => NOW - days * DAY;
  insertTrack(db, 'a.mp3', { title: 'Two days', mtime: ago(2), added_at: NOW });
  insertTrack(db, 'b.mp3', { title: 'Twenty days', mtime: ago(20), added_at: NOW });
  insertTrack(db, 'c.mp3', { title: 'Forty days', mtime: ago(40), added_at: NOW });
  insertTrack(db, 'd.mp3', { title: 'A year', mtime: ago(365), added_at: NOW });
  // No file date: the scan's stands in.
  insertTrack(db, 'e.mp3', { title: 'Undated', mtime: 0, added_at: ago(1) });
  // A file dated after the scan that found it (its clock was ahead): the scan's date wins.
  insertTrack(db, 'f.mp3', { title: 'Future file', mtime: NOW + DAY, added_at: ago(90) });
  return db;
}

test('a span holds the songs whose files arrived inside it, newest first', async () => {
  const db = setup();
  const week = await listAddedSince(db, '1', 7, NOW);
  assert.deepEqual(week.map((t) => t.title), ['Undated', 'Two days']);
  const month = await listAddedSince(db, '1', 30, NOW);
  assert.deepEqual(month.map((t) => t.title), ['Undated', 'Two days', 'Twenty days']);
});

test('All time holds every song', async () => {
  const db = setup();
  const all = await listAddedSince(db, '1', null, NOW);
  assert.equal(all.length, 6);
  assert.equal(all.at(-1)?.title, 'A year');
});

test('the counts match the lists', async () => {
  const db = setup();
  assert.deepEqual(await countAddedPeriods(db, '1', NOW), { '7': 2, '30': 3, '60': 4, all: 6 });
});

test('an empty library counts zero everywhere', async () => {
  const db = openTestDb();
  assert.deepEqual(await countAddedPeriods(db, '1', NOW), { '7': 0, '30': 0, '60': 0, all: 0 });
});

test('each span stacks its newest covers, each cover once', async () => {
  const db = openTestDb();
  const ago = (days: number) => NOW - days * DAY;
  insertTrack(db, 'a1.mp3', { mtime: ago(1), added_at: NOW, art_key: 'A' });
  insertTrack(db, 'a2.mp3', { mtime: ago(1), added_at: NOW, art_key: 'A' });
  insertTrack(db, 'b.mp3', { mtime: ago(3), added_at: NOW, art_key: 'B' });
  insertTrack(db, 'c.mp3', { mtime: ago(20), added_at: NOW, art_key: 'C' });
  insertTrack(db, 'd.mp3', { mtime: ago(100), added_at: NOW, art_key: 'D' });
  insertTrack(db, 'none.mp3', { mtime: ago(2), added_at: NOW });
  const covers = await addedPeriodCovers(db, '1', NOW);
  assert.deepEqual({ ...covers }, { '7': ['A', 'B'], '30': ['A', 'B', 'C'], '60': ['A', 'B', 'C'], all: ['A', 'B', 'C'] });
});
