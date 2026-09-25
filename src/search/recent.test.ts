import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentKey, resolveRecents, suggestQueries, withRecent, type RecentItem } from './recent.ts';
import type { SearchItem } from './rank.ts';
import type { Track } from '@/db/types';

const song: SearchItem = { kind: 'track', track: { id: 7, title: 'Halo' } as Track };
const artist: SearchItem = { kind: 'artist', artist: { name: 'Adele', track_count: 1, album_count: 1, art_key: null, duration_ms: null } };

test('withRecent moves an item to the front, once, and caps the list', () => {
  const a: RecentItem = { kind: 'artist', name: 'Adele' };
  const t: RecentItem = { kind: 'track', id: 7 };
  const f: RecentItem = { kind: 'folder', path: 'x' };
  assert.deepEqual(withRecent([t, a], a, 12), [a, t]);
  assert.deepEqual(withRecent([t, a], f, 2), [f, t]);
});

test('an album is told apart by its album artist', () => {
  const one = recentKey({ kind: 'album', album: 'Greatest Hits', albumArtist: 'Queen' });
  const two = recentKey({ kind: 'album', album: 'Greatest Hits', albumArtist: null });
  assert.notEqual(one, two);
});

test('resolveRecents keeps the remembered order and drops what is gone', () => {
  const recents: RecentItem[] = [{ kind: 'artist', name: 'Adele' }, { kind: 'playlist', id: 3 }, { kind: 'track', id: 7 }];
  assert.deepEqual(resolveRecents(recents, [song, artist]), [artist, song]);
});

test('suggestQueries offers earlier searches containing the text, not the text itself', () => {
  const past = ['fun we are young', 'Beyoncé halo', 'young folks', 'we are'];
  assert.deepEqual(suggestQueries(past, 'we are'), ['fun we are young']);
  assert.deepEqual(suggestQueries(past, 'BEYONCE'), ['Beyoncé halo']);
  assert.deepEqual(suggestQueries(past, ' '), []);
});
