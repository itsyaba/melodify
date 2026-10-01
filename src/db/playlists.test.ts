import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import {
  createPlaylist,
  listPlaylists,
  getPlaylist,
  listPlaylistTracks,
  renamePlaylist,
  deletePlaylist,
  addToPlaylist,
  setPlaylistTracks,
} from './playlists.ts';

test('createPlaylist creates a playlist with tracks and lists it', async () => {
  const db = openTestDb();
  const id1 = insertTrack(db, 'Rock/01 Track.mp3', { title: 'Track 1', duration_ms: 180_000 });
  const id2 = insertTrack(db, 'Rock/02 Track.mp3', { title: 'Track 2', duration_ms: 220_000 });

  const playlistId = await createPlaylist(db, 'Rock Favorites', [id1, id2]);
  assert.ok(playlistId > 0);

  const playlist = await getPlaylist(db, playlistId);
  assert.equal(playlist?.id, playlistId);
  assert.equal(playlist?.name, 'Rock Favorites');

  const list = await listPlaylists(db, 'name');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, playlistId);
  assert.equal(list[0].name, 'Rock Favorites');
  assert.equal(list[0].track_count, 2);
  assert.equal(list[0].duration_ms, 400_000);

  const tracks = await listPlaylistTracks(db, playlistId);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].id, id1);
  assert.equal(tracks[1].id, id2);
});

test('addToPlaylist appends new tracks to the end', async () => {
  const db = openTestDb();
  const id1 = insertTrack(db, 'Pop/01.mp3', { title: 'Pop 1' });
  const id2 = insertTrack(db, 'Pop/02.mp3', { title: 'Pop 2' });
  const id3 = insertTrack(db, 'Pop/03.mp3', { title: 'Pop 3' });

  const playlistId = await createPlaylist(db, 'Pop Mix', [id1]);
  await addToPlaylist(db, playlistId, [id2, id3]);

  const tracks = await listPlaylistTracks(db, playlistId);
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks.map((t) => t.id), [id1, id2, id3]);
});

test('setPlaylistTracks replaces and reorders tracks', async () => {
  const db = openTestDb();
  const id1 = insertTrack(db, 'Jazz/01.mp3', { title: 'Jazz 1' });
  const id2 = insertTrack(db, 'Jazz/02.mp3', { title: 'Jazz 2' });
  const id3 = insertTrack(db, 'Jazz/03.mp3', { title: 'Jazz 3' });

  const playlistId = await createPlaylist(db, 'Jazz Night', [id1, id2, id3]);

  // Reorder to 3, 1 (dropping 2)
  await setPlaylistTracks(db, playlistId, [id3, id1]);

  const tracks = await listPlaylistTracks(db, playlistId);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((t) => t.id), [id3, id1]);
});

test('renamePlaylist changes name and deletePlaylist cleans up', async () => {
  const db = openTestDb();
  const id1 = insertTrack(db, 'LoFi/01.mp3', { title: 'LoFi 1' });
  const playlistId = await createPlaylist(db, 'Study', [id1]);

  await renamePlaylist(db, playlistId, 'Study Deep Work');
  const renamed = await getPlaylist(db, playlistId);
  assert.equal(renamed?.name, 'Study Deep Work');

  await deletePlaylist(db, playlistId);
  const deleted = await getPlaylist(db, playlistId);
  assert.equal(deleted, null);

  const tracksAfterDelete = await listPlaylistTracks(db, playlistId);
  assert.equal(tracksAfterDelete.length, 0);
});
