import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeLine, formatStamp, parseLyrics } from './lrc.ts';

test('parses timestamps in every common spelling', () => {
  const { synced, lines } = parseLyrics('[00:01.5]a\n[00:02.25]b\n[00:03.125]c\n[00:04]d\n[01:05:50]e');
  assert.equal(synced, true);
  assert.deepEqual(lines.map((l) => l.timeMs), [1500, 2250, 3125, 4000, 65_500]);
});

test('a line with several timestamps appears at each, and the result is sorted', () => {
  const { lines } = parseLyrics('[00:10.00][00:30.00]chorus\n[00:20.00]verse');
  assert.deepEqual(lines.map((l) => [l.timeMs, l.text]), [[10_000, 'chorus'], [20_000, 'verse'], [30_000, 'chorus']]);
});

test('metadata tags are skipped and offset shifts lines earlier', () => {
  const { lines } = parseLyrics('[ar:Someone]\n[ti:Song]\n[offset:+500]\n[00:02.00]x');
  assert.deepEqual(lines, [{ timeMs: 1500, text: 'x' }]);
});

test('word timings from enhanced LRC are stripped', () => {
  const { lines } = parseLyrics('[00:01.00]<00:01.00>one <00:01.50>two');
  assert.equal(lines[0].text, 'one two');
});

test('text with no timestamps is unsynced, trimmed at the ends, blank lines kept inside', () => {
  const { synced, lines } = parseLyrics('\n\nFirst verse\n\nSecond verse\n\n');
  assert.equal(synced, false);
  assert.deepEqual(lines.map((l) => l.text), ['First verse', '', 'Second verse']);
});

test('handles a BOM and CRLF line endings', () => {
  const { lines } = parseLyrics('﻿[00:01.00]a\r\n[00:02.00]b\r\n');
  assert.deepEqual(lines.map((l) => l.text), ['a', 'b']);
});

test('active line follows the position', () => {
  const { lines } = parseLyrics('[00:01.00]a\n[00:05.00]b\n[00:09.00]c');
  assert.equal(activeLine(lines, 500), -1);
  assert.equal(activeLine(lines, 1000), 0);
  assert.equal(activeLine(lines, 7000), 1);
  assert.equal(activeLine(lines, 60_000), 2);
});

test('stamps format as mm:ss.xx and parse back to the same time', () => {
  assert.equal(formatStamp(0), '00:00.00');
  assert.equal(formatStamp(61_234), '01:01.23');
  assert.equal(formatStamp(605_999), '10:06.00');
  const parsed = parseLyrics(`[${formatStamp(83_450)}]Line`);
  assert.equal(parsed.lines[0].timeMs, 83_450);
});
