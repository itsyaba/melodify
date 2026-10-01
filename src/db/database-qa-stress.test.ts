import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, insertTrack } from '../test-utils/node-sqlite.ts';
import { migrations } from './schema.ts';

test('DB-QA-01: Schema Migrations & PRAGMA user_version integrity', async () => {
  const db = openTestDb();

  // 1. Verify PRAGMA user_version matches total migrations count
  const versionRow = db.raw.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(versionRow.user_version, migrations.length, `Expected user_version to be ${migrations.length}`);

  // 2. Verify columns added in Migration v2 (ReplayGain) exist
  const trackCols = db.raw.prepare('PRAGMA table_info(tracks)').all() as { name: string }[];
  const colNames = trackCols.map((c) => c.name);
  assert.ok(colNames.includes('rg_track_gain'), 'v2 migration column rg_track_gain missing');
  assert.ok(colNames.includes('rg_album_gain'), 'v2 migration column rg_album_gain missing');
  assert.ok(colNames.includes('tag_version'), 'v2 migration column tag_version missing');

  // 3. Verify Musicolet backup tables added in Migration v3 exist
  const masterTables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const tableNames = masterTables.map((t) => t.name);
  assert.ok(tableNames.includes('musicolet_songs'), 'v3 table musicolet_songs missing');
  assert.ok(tableNames.includes('musicolet_files'), 'v3 table musicolet_files missing');

  console.log(`\n  ✅ Schema Check: Successfully applied all ${migrations.length} versioned migrations (user_version = ${versionRow.user_version})`);
});

test('DB-QA-02: Foreign Key Cascade Deletion (Zero Ghost Tracks)', async () => {
  const db = openTestDb();

  // 1. Insert a track
  const trackId = insertTrack(db, 'Rock/Queen/Bohemian Rhapsody.flac', {
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    duration_ms: 354_000,
  });

  // 2. Add track to a playlist
  const playlistInsert = db.raw.prepare("INSERT INTO playlists (name, created_at, updated_at) VALUES ('Favorites', 1000, 1000)").run();
  const playlistId = Number(playlistInsert.lastInsertRowid);
  db.raw.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, 0)').run(playlistId, trackId);

  // 3. Add track to queue 1
  db.raw.prepare('INSERT INTO queue_tracks (queue_id, track_id, position) VALUES (1, ?, 0)').run(trackId);

  // 4. Add a bookmark to this track (e.g. timestamp 2m30s)
  db.raw.prepare("INSERT INTO bookmarks (track_id, position_ms, label, created_at) VALUES (?, 150000, 'Guitar Solo', 1000)").run(trackId);

  // Verify everything exists before deletion
  assert.equal(db.raw.prepare('SELECT COUNT(*) as n FROM playlist_tracks WHERE track_id = ?').get(trackId)?.n, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) as n FROM queue_tracks WHERE track_id = ?').get(trackId)?.n, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) as n FROM bookmarks WHERE track_id = ?').get(trackId)?.n, 1);

  // 5. THE TEST: Delete the track from the primary tracks table
  db.raw.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);

  // 6. ASSERTION: Foreign keys MUST automatically cascade-delete all references!
  const orphanPlaylists = db.raw.prepare('SELECT COUNT(*) as n FROM playlist_tracks WHERE track_id = ?').get(trackId)?.n;
  const orphanQueues = db.raw.prepare('SELECT COUNT(*) as n FROM queue_tracks WHERE track_id = ?').get(trackId)?.n;
  const orphanBookmarks = db.raw.prepare('SELECT COUNT(*) as n FROM bookmarks WHERE track_id = ?').get(trackId)?.n;

  assert.equal(orphanPlaylists, 0, 'Orphaned playlist track left behind! Cascade delete failed.');
  assert.equal(orphanQueues, 0, 'Orphaned queue track left behind! Cascade delete failed.');
  assert.equal(orphanBookmarks, 0, 'Orphaned bookmark left behind! Cascade delete failed.');

  console.log('  ✅ Cascade Integrity: Deleted track cleanly removed from playlists, queues, and bookmarks (0 orphans).');
});

test('DB-QA-03: High-Scale Stress & Latency Test (1,000 Tracks)', async () => {
  const db = openTestDb();

  // 1. Bulk insert 1,000 tracks inside a transaction
  const insertStart = performance.now();
  db.raw.exec('BEGIN TRANSACTION');
  const insertStmt = db.raw.prepare(`
    INSERT INTO tracks (
      path, folder, filename, ext, size, mtime, title, artist, album, duration_ms, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const totalTracks = 1000;
  for (let i = 1; i <= totalTracks; i++) {
    const artist = `Artist ${(i % 25) + 1}`;
    const album = `Album ${(i % 50) + 1}`;
    const title = `Song Title ${i.toString().padStart(4, '0')}`;
    const path = `${artist}/${album}/${title}.mp3`;
    insertStmt.run(path, `${artist}/${album}`, `${title}.mp3`, 'mp3', 4_000_000, Date.now(), title, artist, album, 210_000, Date.now());
  }
  db.raw.exec('COMMIT');
  const insertDuration = (performance.now() - insertStart).toFixed(2);

  // Verify total count
  const countRow = db.raw.prepare('SELECT COUNT(*) as total FROM tracks').get() as { total: number };
  assert.equal(countRow.total, totalTracks);

  // 2. Query benchmark: Sort 1,000 tracks alphabetically by Title with case-insensitivity
  const queryStart = performance.now();
  const sortedTracks = db.raw.prepare('SELECT id, title, artist, album FROM tracks ORDER BY title COLLATE NOCASE ASC').all();
  const queryDuration = (performance.now() - queryStart).toFixed(2);

  assert.equal(sortedTracks.length, totalTracks);
  // QA Performance Target: Full table scan & sort should be well under 50ms
  assert.ok(Number(queryDuration) < 50, `Query too slow: ${queryDuration}ms`);

  console.log(`  ⚡ Stress Benchmark:`);
  console.log(`     - Bulk Insert 1,000 Songs: ${insertDuration} ms`);
  console.log(`     - Query & Alphabetical Sort: ${queryDuration} ms (Target: < 50ms)`);
});
