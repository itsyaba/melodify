import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIn, foldForFind } from './find.ts';

const songs = [
  { title: 'Help!', artist: 'The Beatles', album: 'Help!' },
  { title: 'Halo', artist: 'Beyoncé', album: 'I Am... Sasha Fierce' },
  { title: 'Hello', artist: 'Adele', album: '25' },
  { title: 'Untitled', artist: null, album: null },
];
const fields = (s: (typeof songs)[number]) => [s.title, s.artist, s.album];

test('foldForFind lowercases and strips accents', () => {
  assert.equal(foldForFind('Beyoncé SIGUR RÓS'), 'beyonce sigur ros');
});

test('an empty or blank query returns the list itself', () => {
  assert.equal(findIn(songs, '', fields), songs);
  assert.equal(findIn(songs, '   ', fields), songs);
});

test('every word has to match, in any field', () => {
  assert.deepEqual(findIn(songs, 'beatles help', fields).map((s) => s.title), ['Help!']);
  assert.deepEqual(findIn(songs, 'h', fields).map((s) => s.title), ['Help!', 'Halo', 'Hello']);
  assert.deepEqual(findIn(songs, 'adele halo', fields), []);
});

test('matching ignores case and accents, and skips missing fields', () => {
  assert.deepEqual(findIn(songs, 'BEYONCE', fields).map((s) => s.title), ['Halo']);
  assert.deepEqual(findIn(songs, '25', fields).map((s) => s.title), ['Hello']);
  assert.deepEqual(findIn(songs, 'null', fields), []);
});

test('numbers are found as text', () => {
  const years = [{ name: 1999 }, { name: 2004 }];
  assert.deepEqual(findIn(years, '200', (y) => [y.name]), [{ name: 2004 }]);
});
