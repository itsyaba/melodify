import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayGainDb } from './gain.ts';

const tags = (patch: Partial<Record<'rg_track_gain' | 'rg_album_gain' | 'rg_track_peak' | 'rg_album_peak', number | null>> = {}) => ({
  rg_track_gain: null, rg_album_gain: null, rg_track_peak: null, rg_album_peak: null, ...patch,
});

test('off, or no tags, leaves the track alone', () => {
  assert.equal(replayGainDb(tags({ rg_track_gain: -7 }), 'off'), 0);
  assert.equal(replayGainDb(tags(), 'track', 3), 0);
});

test('track and album modes each fall back to the other value', () => {
  const both = tags({ rg_track_gain: -7, rg_album_gain: -5 });
  assert.equal(replayGainDb(both, 'track'), -7);
  assert.equal(replayGainDb(both, 'album'), -5);
  assert.equal(replayGainDb(tags({ rg_track_gain: -7 }), 'album'), -7);
  assert.equal(replayGainDb(tags({ rg_album_gain: -5 }), 'track'), -5);
});

test('the pre-amp is added, and a peak keeps the result from clipping', () => {
  assert.equal(replayGainDb(tags({ rg_track_gain: -7 }), 'track', 2), -5);
  // A peak of 0.8 is about -1.94 dBFS, so the track can come up that far and no further.
  const capped = replayGainDb(tags({ rg_track_gain: 5, rg_track_peak: 0.8 }), 'track');
  assert.ok(Math.abs(capped - 1.938) < 0.001, String(capped));
});

test('a raise is capped at the engine headroom', () => {
  assert.equal(replayGainDb(tags({ rg_track_gain: 10 }), 'track'), 6);
  assert.equal(replayGainDb(tags({ rg_track_gain: -40 }), 'track'), -24);
});
