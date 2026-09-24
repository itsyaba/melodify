import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackupError, buildBackup, parseBackup, summarize, type BackupSource } from './format.ts';

function source(): BackupSource {
  const track = (id: number, path: string, extra: Partial<BackupSource['tracks'][number]> = {}) => ({
    id, path, title: path, artist: null, album: null, duration_ms: null, favorite: 0, hidden: 0,
    play_count: 0, skip_count: 0, last_played_at: null, resume_ms: null, added_at: 0, ...extra,
  });
  return {
    tracks: [track(10, 'a.mp3', { favorite: 1, play_count: 2 }), track(11, 'b.mp3'), track(12, 'c.mp3')],
    playlists: [{ id: 1, name: 'P', created_at: 1, updated_at: 2 }],
    playlistTracks: [{ playlist_id: 1, track_id: 12 }, { playlist_id: 1, track_id: 10 }, { playlist_id: 1, track_id: 999 }],
    queues: [{ id: 1, name: 'Q', current_index: 3, current_ms: 500, repeat: 'one' }],
    // Position 3 (the current one) is gone; the next survivor is the current song.
    queueTracks: [{ queue_id: 1, track_id: 10, position: 0 }, { queue_id: 1, track_id: 11, position: 4 }],
    activeQueueId: 1,
    bookmarks: [{ track_id: 11, position_ms: 9, label: null, created_at: 3 }],
    excludedFolders: ['X'],
    settings: { recentSearches: ['q'] },
  };
}

test('tracks are written once and referred to by index, defaults left out', () => {
  const b = buildBackup(source(), 'manual', 99);
  assert.deepEqual(b.tracks[0], { path: 'a.mp3', title: 'a.mp3', favorite: true, playCount: 2 });
  assert.deepEqual(b.tracks[1], { path: 'b.mp3', title: 'b.mp3' });
  assert.deepEqual(b.playlists[0].tracks, [2, 0]);
  assert.deepEqual(b.bookmarks, [{ track: 1, positionMs: 9, label: null, createdAt: 3 }]);
  assert.equal(b.createdAt, 99);
});

test('a queue whose saved position has a gap points at the next song that is there', () => {
  const q = buildBackup(source(), 'manual').queues[0];
  assert.deepEqual(q, { name: 'Q', currentIndex: 1, currentMs: 500, repeat: 'one', tracks: [0, 1] });
});

test('parse is the inverse of build', () => {
  const b = buildBackup(source(), 'auto', 5);
  assert.deepEqual(parseBackup(JSON.stringify(b)), b);
});

test('files that are not backups, or are from a newer version, are refused with a reason', () => {
  assert.throws(() => parseBackup('not json'), BackupError);
  assert.throws(() => parseBackup('{"app":"other","format":1}'), /not a Melodify backup/);
  assert.throws(() => parseBackup('{"app":"melodify","format":99,"tracks":[]}'), /newer version/);
});

test('malformed entries are dropped and later indexes shift to match', () => {
  const b = parseBackup(JSON.stringify({
    app: 'melodify', format: 1,
    tracks: [{ path: 'a' }, { nope: true }, { path: 'c', playCount: -3 }],
    playlists: [{ name: 'P', tracks: [2, 1, 7, 'x'] }, { tracks: [0] }],
    queues: [{ tracks: [0, 2], currentIndex: 9, repeat: 'sideways' }],
    bookmarks: [{ track: 2, positionMs: 5 }, { track: 1, positionMs: 5 }],
    activeQueue: 4,
  }));
  assert.deepEqual(b.tracks.map((t) => t.path), ['a', 'c']);
  assert.equal(b.tracks[1].playCount, 0);
  assert.deepEqual(b.playlists, [{ name: 'P', createdAt: 0, updatedAt: 0, tracks: [1] }]);
  assert.deepEqual(b.queues[0], { name: 'Queue 1', currentIndex: 1, currentMs: 0, repeat: 'off', tracks: [0, 1] });
  assert.deepEqual(b.bookmarks.map((x) => x.track), [1]);
  assert.equal(b.activeQueue, 0);
});

test('summary counts what a restore would bring back', () => {
  assert.deepEqual(summarize(buildBackup(source(), 'manual')), {
    songs: 3, favorites: 1, played: 1, playlists: 1, queues: 1, bookmarks: 1,
  });
});
