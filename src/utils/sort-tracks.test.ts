import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../db/types.ts';
import { sortOrder } from './sort-tracks.ts';

const song = (title: string, more: Partial<Track> = {}): Track =>
  ({
    title,
    path: `${title}.mp3`,
    artist: null,
    album: null,
    year: null,
    disc_no: null,
    track_no: null,
    duration_ms: null,
    play_count: 0,
    last_played_at: null,
    mtime: 0,
    added_at: 0,
    ...more,
  }) as Track;

const titles = (tracks: Track[], sort: Parameters<typeof sortOrder>[1]) => sortOrder(tracks, sort).map((i) => tracks[i].title);

test("the list's own order is kept as it came", () => {
  const list = [song('b'), song('a')];
  assert.deepEqual(sortOrder(list, 'default'), [0, 1]);
});

test('titles sort A to Z, ignoring case and reading numbers as numbers', () => {
  assert.deepEqual(titles([song('beta'), song('Track 10'), song('Alpha'), song('Track 9')], 'title'), ['Alpha', 'beta', 'Track 9', 'Track 10']);
});

test('an album sorts by disc, then track number; songs without one go last', () => {
  const list = [
    song('c', { album: 'X', disc_no: 2, track_no: 1 }),
    song('none'),
    song('b', { album: 'X', disc_no: 1, track_no: 2 }),
    song('a', { album: 'X', disc_no: 1, track_no: 1 }),
  ];
  assert.deepEqual(titles(list, 'album'), ['a', 'b', 'c', 'none']);
});

test('newest, longest and most played come first, never-played last', () => {
  const list = [song('old', { last_played_at: 1, play_count: 3 }), song('never'), song('new', { last_played_at: 5, play_count: 3 })];
  assert.deepEqual(titles(list, 'played'), ['new', 'old', 'never']);
  // Equal counts fall back to the title.
  assert.deepEqual(titles(list, 'plays'), ['new', 'old', 'never']);
  assert.deepEqual(titles([song('short', { duration_ms: 1 }), song('long', { duration_ms: 9 })], 'duration'), ['long', 'short']);
});

test('recently added dates a song by its file when that is before the scan', () => {
  const list = [song('scanned', { added_at: 50 }), song('old file', { added_at: 100, mtime: 10 }), song('new file', { added_at: 60, mtime: 70 })];
  assert.deepEqual(titles(list, 'added'), ['new file', 'scanned', 'old file']);
});
