import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeLoop, latestB, loopSeek, MIN_LOOP_MS, startLoop } from './ab-loop.ts';

test('latestB keeps clear of the end, and of a crossfade', () => {
  assert.equal(latestB(200_000, 0), 199_000);
  assert.equal(latestB(200_000, 6000), 193_500);
  assert.equal(latestB(500, 0), 0);
});

test('startLoop sets A and no B', () => {
  assert.deepEqual(startLoop(7, 32_400.6), { trackId: 7, aMs: 32_401, bMs: null });
  assert.equal(startLoop(7, -5).aMs, 0);
});

test('closeLoop sets B after A', () => {
  const loop = startLoop(1, 10_000);
  assert.deepEqual(closeLoop(loop, 70_000, 200_000, 0), { trackId: 1, aMs: 10_000, bMs: 70_000 });
});

test('closeLoop refuses a stretch that is too short or backwards', () => {
  const loop = startLoop(1, 10_000);
  assert.equal(closeLoop(loop, 10_000 + MIN_LOOP_MS - 1, 200_000, 0), null);
  assert.equal(closeLoop(loop, 5000, 200_000, 0), null);
  assert.notEqual(closeLoop(loop, 10_000 + MIN_LOOP_MS, 200_000, 0), null);
});

test('closeLoop pulls B back from the end of the song', () => {
  const loop = startLoop(1, 10_000);
  assert.equal(closeLoop(loop, 199_900, 200_000, 0)?.bMs, 199_000);
  assert.equal(closeLoop(loop, 199_900, 200_000, 8000)?.bMs, 191_500);
  // A too near the end leaves no room for B at all.
  assert.equal(closeLoop(startLoop(1, 198_500), 199_900, 200_000, 0), null);
});

test('closeLoop trusts the position while the duration is unknown', () => {
  assert.equal(closeLoop(startLoop(1, 0), 5000, 0, 0)?.bMs, 5000);
});

test('loopSeek jumps back to A once B is reached, on the same song only', () => {
  const loop = { trackId: 3, aMs: 10_000, bMs: 20_000 };
  assert.equal(loopSeek(loop, 3, 19_999), null);
  assert.equal(loopSeek(loop, 3, 20_000), 10_000);
  assert.equal(loopSeek(loop, 3, 45_000), 10_000);
  assert.equal(loopSeek(loop, 4, 20_000), null);
  assert.equal(loopSeek({ ...loop, bMs: null }, 3, 20_000), null);
  assert.equal(loopSeek(null, 3, 20_000), null);
});
