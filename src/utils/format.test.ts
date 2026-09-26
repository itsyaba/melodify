import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPart, formatTotalTime } from './format.ts';

test('long totals drop the minutes past ten hours', () => {
  assert.equal(formatTotalTime(0), '0 min');
  assert.equal(formatTotalTime(45 * 60_000), '45 min');
  assert.equal(formatTotalTime(60 * 60_000), '1 hr');
  assert.equal(formatTotalTime((3 * 60 + 12) * 60_000), '3 hr 12 min');
  assert.equal(formatTotalTime((74 * 60 + 40) * 60_000), '74 hr');
});

test('the small hours still belong to the night before', () => {
  // 26 September 2026 is a Saturday.
  assert.deepEqual(dayPart(new Date(2026, 8, 26, 9)), { day: 'Saturday', part: 'Morning' });
  assert.deepEqual(dayPart(new Date(2026, 8, 26, 12)), { day: 'Saturday', part: 'Afternoon' });
  assert.deepEqual(dayPart(new Date(2026, 8, 26, 18)), { day: 'Saturday', part: 'Evening' });
  assert.deepEqual(dayPart(new Date(2026, 8, 26, 23)), { day: 'Saturday', part: 'Night' });
  assert.deepEqual(dayPart(new Date(2026, 8, 27, 1)), { day: 'Saturday', part: 'Night' });
  assert.deepEqual(dayPart(new Date(2026, 8, 27, 5)), { day: 'Sunday', part: 'Morning' });
  assert.deepEqual(dayPart(new Date(2026, 8, 28, 2)), { day: 'Sunday', part: 'Night' });
});
