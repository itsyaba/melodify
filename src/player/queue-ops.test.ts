import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '@/db/types';
import {
  cycleRepeat,
  insertTracks,
  moveAfterCurrent,
  moveTrack,
  nextIndex,
  previousIndex,
  removeDuplicates,
  removeTracks,
  shuffleByAlbum,
  shuffleQueue,
  shuffled,
} from './queue-ops.ts';

function t(id: number, extra: Partial<Track> = {}): Track {
  return { id, title: `T${id}`, folder: '', ...extra } as Track;
}
const ids = (tracks: Track[]) => tracks.map((x) => x.id);
/** Deterministic stand-in for Math.random. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test('next: advances, stops at the end with repeat off, wraps with all', () => {
  assert.equal(nextIndex(3, 0, 'off', false), 1);
  assert.equal(nextIndex(3, 2, 'off', false), -1);
  assert.equal(nextIndex(3, 2, 'all', false), 0);
  assert.equal(nextIndex(0, -1, 'all', false), -1);
});

test('next: repeat one replays on a natural end but moves on when pressed', () => {
  assert.equal(nextIndex(3, 1, 'one', false), 1);
  assert.equal(nextIndex(3, 1, 'one', true), 2);
  assert.equal(nextIndex(3, 2, 'one', true), 0);
});

test('previous: only repeat all wraps backwards', () => {
  assert.equal(previousIndex(3, 2, 'off'), 1);
  assert.equal(previousIndex(3, 0, 'off'), 0);
  assert.equal(previousIndex(3, 0, 'all'), 2);
  assert.equal(previousIndex(3, 0, 'one'), 0);
});

test('repeat cycles off, all, one', () => {
  assert.equal(cycleRepeat('off'), 'all');
  assert.equal(cycleRepeat('all'), 'one');
  assert.equal(cycleRepeat('one'), 'off');
});

test('move keeps the current track current', () => {
  const list = { tracks: [t(1), t(2), t(3), t(4)], currentIndex: 2 };
  // The current track itself.
  assert.deepEqual(moveTrack(list, 2, 0).currentIndex, 0);
  // Something from above it to below it.
  const down = moveTrack(list, 0, 3);
  assert.deepEqual(ids(down.tracks), [2, 3, 4, 1]);
  assert.equal(down.tracks[down.currentIndex].id, 3);
  // Something from below it to above it.
  const up = moveTrack(list, 3, 0);
  assert.deepEqual(ids(up.tracks), [4, 1, 2, 3]);
  assert.equal(up.tracks[up.currentIndex].id, 3);
  // Unrelated moves on one side of it.
  assert.equal(moveTrack(list, 0, 1).currentIndex, 2);
});

test('move clamps the target and ignores a bad source', () => {
  const list = { tracks: [t(1), t(2)], currentIndex: 0 };
  assert.deepEqual(ids(moveTrack(list, 0, 99).tracks), [2, 1]);
  assert.equal(moveTrack(list, 5, 0), list);
});

test('removing tracks before the current one shifts it', () => {
  const r = removeTracks({ tracks: [t(1), t(2), t(3), t(4)], currentIndex: 2 }, [0, 1]);
  assert.deepEqual(ids(r.tracks), [3, 4]);
  assert.equal(r.currentIndex, 0);
  assert.equal(r.currentRemoved, false);
});

test('removing the current track hands over to the one after it, or the new last one', () => {
  const mid = removeTracks({ tracks: [t(1), t(2), t(3)], currentIndex: 1 }, [1]);
  assert.equal(mid.tracks[mid.currentIndex].id, 3);
  assert.equal(mid.currentRemoved, true);
  const last = removeTracks({ tracks: [t(1), t(2), t(3)], currentIndex: 2 }, [2]);
  assert.equal(last.tracks[last.currentIndex].id, 2);
  const all = removeTracks({ tracks: [t(1)], currentIndex: 0 }, [0]);
  assert.deepEqual(all, { tracks: [], currentIndex: -1, currentRemoved: true });
});

test('insert shifts the current index only when it lands at or before it', () => {
  const list = { tracks: [t(1), t(2), t(3)], currentIndex: 1 };
  const next = insertTracks(list, 2, [t(9)]);
  assert.deepEqual(ids(next.tracks), [1, 2, 9, 3]);
  assert.equal(next.currentIndex, 1);
  const front = insertTracks(list, 0, [t(8), t(9)]);
  assert.equal(front.tracks[front.currentIndex].id, 2);
  const empty = insertTracks({ tracks: [], currentIndex: -1 }, 0, [t(5)]);
  assert.equal(empty.currentIndex, 0);
});

test('shuffled keeps every item', () => {
  const out = shuffled([1, 2, 3, 4, 5, 6], seeded(7));
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5, 6]);
});

test('shuffle puts the current track first and keeps the rest', () => {
  const list = { tracks: [t(1), t(2), t(3), t(4), t(5)], currentIndex: 3 };
  const s = shuffleQueue(list, seeded(3));
  assert.equal(s.currentIndex, 0);
  assert.equal(s.tracks[0].id, 4);
  assert.deepEqual(ids(s.tracks).sort(), [1, 2, 3, 4, 5]);
});

test('shuffle by album keeps albums whole and in track order, current album first', () => {
  const a = (id: number, no: number) => t(id, { album: 'A', artist: 'X', track_no: no });
  const b = (id: number, no: number) => t(id, { album: 'B', artist: 'X', track_no: no });
  const c = (id: number, no: number) => t(id, { album: 'C', artist: 'Y', track_no: no });
  const list = { tracks: [a(1, 2), b(2, 1), a(3, 1), c(4, 1), b(5, 2), c(6, 2)], currentIndex: 1 };
  const s = shuffleByAlbum(list, seeded(11));
  assert.deepEqual(ids(s.tracks.slice(0, 2)), [2, 5]);
  assert.equal(s.tracks[s.currentIndex].id, 2);
  const rest = ids(s.tracks.slice(2));
  assert.ok(
    JSON.stringify(rest) === JSON.stringify([3, 1, 4, 6]) || JSON.stringify(rest) === JSON.stringify([4, 6, 3, 1]),
    `albums split up: ${rest}`,
  );
});

test('duplicates go, but the playing copy stays', () => {
  const list = { tracks: [t(1), t(2), t(1), t(3), t(2)], currentIndex: 2 };
  const r = removeDuplicates(list);
  assert.deepEqual(ids(r.tracks), [2, 1, 3]);
  assert.equal(r.tracks[r.currentIndex].id, 1);
  assert.equal(r.removed, 2);
});

test('move after current keeps the picked order and skips the current track', () => {
  const list = { tracks: [t(1), t(2), t(3), t(4), t(5)], currentIndex: 1 };
  const r = moveAfterCurrent(list, [4, 0, 1]);
  assert.deepEqual(ids(r.tracks), [2, 1, 5, 3, 4]);
  assert.equal(r.tracks[r.currentIndex].id, 2);
  assert.equal(moveAfterCurrent(list, [1]), list);
});
