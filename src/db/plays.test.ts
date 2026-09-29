import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { listMostPlayed, summarizeMostPlayed } from './plays.ts';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const ago = (days: number) => NOW - days * DAY;

/**
 * Three songs: one played a lot two days ago, one played a lot two months ago, and one with an
 * all-time count from before plays had dates.
 */
function setup() {
  const db = openTestDb();
  const recent = insertTrack(db, 'recent.mp3', { title: 'Recent', art_key: 'R', play_count: 3 });
  const older = insertTrack(db, 'older.mp3', { title: 'Older', art_key: 'O', play_count: 5 });
  insertTrack(db, 'undated.mp3', { title: 'Undated', art_key: 'U', play_count: 40 });
  const play = (id: number, days: number) => db.raw.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(id, ago(days));
  [2, 2, 3].forEach((d) => play(recent, d));
  [60, 61, 62, 63, 64].forEach((d) => play(older, d));
  return { db, recent };
}

test('a dated span counts only the plays inside it', async () => {
  const { db } = setup();
  const week = await listMostPlayed(db, '1', 7, NOW);
  assert.deepEqual(week.tracks.map((t) => t.title), ['Recent']);
  assert.deepEqual(week.plays, [3]);
  const halfYear = await listMostPlayed(db, '1', 182, NOW);
  assert.deepEqual(halfYear.tracks.map((t) => t.title), ['Older', 'Recent']);
  assert.deepEqual(halfYear.plays, [5, 3]);
});

test('All time uses the running totals, undated plays included', async () => {
  const { db } = setup();
  const all = await listMostPlayed(db, '1', null, NOW);
  assert.deepEqual(all.tracks.map((t) => t.title), ['Undated', 'Older', 'Recent']);
  assert.deepEqual(all.plays, [40, 5, 3]);
});

test('rows come back as plain tracks', async () => {
  const { db } = setup();
  const { tracks } = await listMostPlayed(db, '1', 30, NOW);
  assert.equal('plays' in tracks[0], false);
});

test('each span counts its songs and stacks the most played covers', async () => {
  const { db } = setup();
  const summary = await summarizeMostPlayed(db, '1', NOW);
  assert.deepEqual({ ...summary.counts }, { week: 1, month: 1, '6months': 2, year: 2, all: 3 });
  assert.deepEqual(summary.covers.week, ['R']);
  assert.deepEqual(summary.covers['6months'], ['O', 'R']);
  assert.deepEqual(summary.covers.all, ['U', 'O', 'R']);
});

test('a deleted song takes its plays with it', async () => {
  const { db, recent } = setup();
  db.raw.prepare('DELETE FROM tracks WHERE id = ?').run(recent);
  const n = db.raw.prepare('SELECT COUNT(*) AS n FROM plays WHERE track_id = ?').get(recent) as { n: number };
  assert.equal(n.n, 0);
});
