import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTotalTime } from './format.ts';

test('long totals drop the minutes past ten hours', () => {
  assert.equal(formatTotalTime(0), '0 min');
  assert.equal(formatTotalTime(45 * 60_000), '45 min');
  assert.equal(formatTotalTime(60 * 60_000), '1 hr');
  assert.equal(formatTotalTime((3 * 60 + 12) * 60_000), '3 hr 12 min');
  assert.equal(formatTotalTime((74 * 60 + 40) * 60_000), '74 hr');
});
