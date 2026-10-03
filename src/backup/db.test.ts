import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { collectBackupSource, listLibraryForMatching, writeRestore } from './db.ts';
import { buildBackup, parseBackup } from './format.ts';
import { matchTracks } from './match.ts';
import { getSetting, setSetting } from '../db/settings.ts';

type Db = ReturnType<typeof openTestDb>;

/** A small library with some of everything a backup carries. */
function seed(db: Db) {
  const a = insertTrack(db, 'Band/Album/01 One.flac', { title: 'One', artist: 'Band', album: 'Album', duration_ms: 200_000, favorite: 1, play_count: 7, last_played_at: 5000, added_at: 100 });
  const b = insertTrack(db, 'Band/Album/02 Two.flac', { title: 'Two', artist: 'Band', album: 'Album', duration_ms: 210_000, hidden: 1 });
  const c = insertTrack(db, 'Podcasts/Episode.mp3', { title: 'Episode', duration_ms: 3_600_000, resume_ms: 1_200_000 });
  db.raw.exec(`
    INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, 'Mix', 10, 20);
    INSERT INTO playlist_tracks VALUES (1, ${c}, 0), (1, ${a}, 1), (1, ${a}, 2);
    INSERT INTO queues (id, name, position, current_index, current_ms, repeat, created_at) VALUES (2, 'Second', 1, 1, 42000, 'all', 0);
    INSERT INTO queue_tracks VALUES (1, ${a}, 0), (2, ${b}, 0), (2, ${c}, 1);
    INSERT INTO bookmarks (track_id, position_ms, label, created_at) VALUES (${c}, 60000, 'Intro over', 30);
    INSERT INTO excluded_folders VALUES ('Podcasts/Old');
    INSERT INTO settings VALUES ('activeQueueId', '2'), ('prefs', '{"skipSeconds":30}'), ('recentSearches', '["band"]');
  `);
  return { a, b, c };
}

async function backupOf(db: Db) {
  // Through JSON and back, as a real restore reads it from a file.
  return parseBackup(JSON.stringify(buildBackup(await collectBackupSource(db), 'manual', 1234)));
}

test('a Melodify restore preserves the backed-up Most played period', async () => {
  const db = openTestDb();
  seed(db);
  await setSetting(db, 'choices', { 'played.period': 'week' });
  const backup = await backupOf(db);
  await setSetting(db, 'choices', { 'played.period': 'all' });
  const match = matchTracks(backup.tracks, await listLibraryForMatching(db));
  await writeRestore(db, backup, match.ids, match.rules);
  assert.deepEqual(await getSetting(db, 'choices'), { 'played.period': 'week' });
});

test('a backup restores onto a library that moved one folder down', async () => {
  const before = openTestDb();
  seed(before);
  const backup = await backupOf(before);

  const after = openTestDb();
  // The same files, copied back under "Music/", scanned fresh: new ids, no user data.
  const one = insertTrack(after, 'Music/Band/Album/01 One.flac', { title: 'One', artist: 'Band', album: 'Album', duration_ms: 200_000 });
  const two = insertTrack(after, 'Music/Band/Album/02 Two.flac', { title: 'Two', artist: 'Band', album: 'Album', duration_ms: 210_000 });
  const ep = insertTrack(after, 'Music/Podcasts/Episode.mp3', { title: 'Episode', duration_ms: 3_600_000 });
  const match = matchTracks(backup.tracks, await listLibraryForMatching(after));
  assert.equal(match.missing, 0);
  const counts = await writeRestore(after, backup, match.ids, match.rules);
  assert.deepEqual(counts, { songs: 3, playlists: 1, playlistSongsMissing: 0, queues: 2, bookmarks: 1 });

  const row = (id: number) => after.raw.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Record<string, unknown>;
  assert.equal(row(one).favorite, 1);
  assert.equal(row(one).play_count, 7);
  assert.equal(row(one).last_played_at, 5000);
  assert.equal(row(one).added_at, 100);
  assert.equal(row(two).hidden, 1);
  assert.equal(row(ep).resume_ms, 1_200_000);

  const playlist = after.raw.prepare('SELECT track_id FROM playlist_tracks ORDER BY position').all().map((r) => r.track_id);
  assert.deepEqual(playlist, [ep, one, one]);

  const queues = after.raw.prepare('SELECT id, name, current_index, current_ms, repeat FROM queues ORDER BY position').all();
  assert.deepEqual(queues.map((q) => ({ ...q })), [
    { id: 1, name: 'Queue 1', current_index: 0, current_ms: 0, repeat: 'off' },
    { id: 2, name: 'Second', current_index: 1, current_ms: 42000, repeat: 'all' },
  ]);
  const active = after.raw.prepare("SELECT value FROM settings WHERE key = 'activeQueueId'").get() as { value: string };
  assert.equal(active.value, '2');

  const bookmark = after.raw.prepare('SELECT track_id, position_ms, label FROM bookmarks').get() as Record<string, unknown>;
  assert.deepEqual({ ...bookmark }, { track_id: ep, position_ms: 60000, label: 'Intro over' });

  const excluded = after.raw.prepare('SELECT folder FROM excluded_folders').all().map((r) => r.folder);
  assert.deepEqual(excluded, ['Music/Podcasts/Old']);
  const prefs = after.raw.prepare("SELECT value FROM settings WHERE key = 'prefs'").get() as { value: string };
  assert.deepEqual(JSON.parse(prefs.value), { skipSeconds: 30 });
});

test('songs that are gone drop out of playlists and queues, and a queue keeps a sensible current song', async () => {
  const before = openTestDb();
  seed(before);
  const backup = await backupOf(before);

  const after = openTestDb();
  const ep = insertTrack(after, 'Podcasts/Episode.mp3', { title: 'Episode', duration_ms: 3_600_000 });
  const match = matchTracks(backup.tracks, await listLibraryForMatching(after));
  assert.equal(match.exact, 1);
  const counts = await writeRestore(after, backup, match.ids, match.rules);
  assert.equal(counts.playlistSongsMissing, 2);

  // Queue "Second" was on its second song (the episode) at 42 s; it still is, since that survived.
  const second = after.raw.prepare("SELECT current_index, current_ms FROM queues WHERE name = 'Second'").get() as Record<string, number>;
  assert.deepEqual({ ...second }, { current_index: 0, current_ms: 42000 });
  const rows = after.raw.prepare('SELECT track_id FROM queue_tracks WHERE queue_id = 2').all().map((r) => r.track_id);
  assert.deepEqual(rows, [ep]);
});

test('restoring replaces what was there, and leaves songs the backup does not know alone', async () => {
  const before = openTestDb();
  seed(before);
  const backup = await backupOf(before);

  const after = openTestDb();
  const one = insertTrack(after, 'Band/Album/01 One.flac', { title: 'One', play_count: 99 });
  const extra = insertTrack(after, 'New/Song.mp3', { title: 'Song', play_count: 3, favorite: 1 });
  after.raw.exec(`
    INSERT INTO playlists (id, name, created_at, updated_at) VALUES (9, 'Made since', 0, 0);
    INSERT INTO playlist_tracks VALUES (9, ${extra}, 0);
  `);
  const match = matchTracks(backup.tracks, await listLibraryForMatching(after));
  await writeRestore(after, backup, match.ids, match.rules);

  const names = after.raw.prepare('SELECT name FROM playlists').all().map((r) => r.name);
  assert.deepEqual(names, ['Mix']);
  const row = (id: number) => after.raw.prepare('SELECT play_count, favorite FROM tracks WHERE id = ?').get(id) as Record<string, number>;
  assert.deepEqual({ ...row(one) }, { play_count: 7, favorite: 1 });
  assert.deepEqual({ ...row(extra) }, { play_count: 3, favorite: 1 });
});

test('a backup with no queues still leaves the default queue', async () => {
  const after = openTestDb();
  const backup = parseBackup(JSON.stringify({ app: 'melodify', format: 1, createdAt: 1, tracks: [] }));
  await writeRestore(after, backup, [], []);
  const queues = after.raw.prepare('SELECT id FROM queues').all().map((r) => r.id);
  assert.deepEqual(queues, [1]);
});
