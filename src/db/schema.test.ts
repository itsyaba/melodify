import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { migrations } from './schema.ts';

test('v5 removes the videos earlier scans added, and everything that pointed at them', () => {
  const db = openTestDb({ migrate: false });
  // Up to v4, then as a real migration runs: without foreign keys.
  migrations.slice(0, 4).forEach((sql) => db.raw.exec(sql));
  db.raw.exec('PRAGMA foreign_keys = OFF');

  const song = insertTrack(db, 'Music/song.m4a');
  const video = insertTrack(db, 'Camera/clip.mp4');
  const shouting = insertTrack(db, 'Camera/CLIP2.MP4', { ext: 'MP4' });
  const run = (sql: string, ...args: (string | number)[]) => db.raw.prepare(sql).run(...args);
  run('INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, ?, 0, 0)', 'Mix');
  [song, video, shouting].forEach((id, i) => {
    run('INSERT INTO queue_tracks (queue_id, track_id, position) VALUES (1, ?, ?)', id, i);
    run('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, ?, ?)', id, i);
    run('INSERT INTO bookmarks (track_id, position_ms, created_at) VALUES (?, 0, 0)', id);
    run('INSERT INTO plays (track_id, played_at) VALUES (?, 0)', id);
  });

  db.raw.exec(migrations[4]);

  const ids = (sql: string) => (db.raw.prepare(sql).all() as { id: number }[]).map((r) => r.id);
  assert.deepEqual(ids('SELECT id FROM tracks'), [song]);
  for (const table of ['queue_tracks', 'playlist_tracks', 'bookmarks', 'plays']) {
    assert.deepEqual(ids(`SELECT track_id AS id FROM ${table}`), [song], table);
  }
});
