import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLyrics, pickLyrics, primaryArtist, simplifyTitle, type LrclibRecord } from './online.ts';

function record(over: Partial<LrclibRecord>): LrclibRecord {
  return {
    trackName: 'Song',
    artistName: 'Artist',
    albumName: null,
    duration: 200,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...over,
  };
}

/** A fetch that answers from `routes` by path and records each URL asked for. */
function fakeFetch(routes: Record<string, unknown>) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    const path = new URL(url).pathname.replace('/api', '');
    const hit = typeof routes[path] === 'function' ? (routes[path] as (u: URL) => unknown)(new URL(url)) : routes[path];
    return hit === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(hit), { status: 200 });
  };
  return { fn, urls };
}

test('titles lose featuring credits, remaster notes and bracketed extras', () => {
  assert.equal(simplifyTitle('Song (feat. Someone) [2011 Remaster]'), 'Song');
  assert.equal(simplifyTitle('Song - Remastered 2009'), 'Song');
  assert.equal(simplifyTitle('Song - Radio Edit'), 'Song');
  assert.equal(simplifyTitle('Hyphen - Song'), 'Hyphen - Song');
});

test('the first artist is split off separators, but band names keep & and commas', () => {
  assert.equal(primaryArtist('A; B'), 'A');
  assert.equal(primaryArtist('A / B'), 'A');
  assert.equal(primaryArtist('A feat. B'), 'A');
  assert.equal(primaryArtist('A ft. B'), 'A');
  assert.equal(primaryArtist('Simon & Garfunkel'), 'Simon & Garfunkel');
  assert.equal(primaryArtist('Earth, Wind & Fire'), 'Earth, Wind & Fire');
});

test('synced lyrics of the same length win over plain ones and over other lengths', () => {
  const records = [
    record({ duration: 260, syncedLyrics: '[00:01.00]wrong cut' }),
    record({ duration: 201, plainLyrics: 'plain' }),
    record({ duration: 199, syncedLyrics: '[00:01.00]right' }),
  ];
  assert.deepEqual(pickLyrics(records, 200_000), { text: '[00:01.00]right', synced: true });
});

test('plain lyrics of another length are a last resort, and not for a song with no artist', () => {
  const records = [record({ duration: 260, syncedLyrics: '[00:01.00]x', plainLyrics: 'words' })];
  assert.deepEqual(pickLyrics(records, 200_000), { text: 'words', synced: false });
  assert.equal(pickLyrics(records, 200_000, true), null);
});

test('an instrumental of the right length beats lyrics from another recording', () => {
  const records = [record({ duration: 330, plainLyrics: 'some other song' }), record({ duration: 200, instrumental: true })];
  assert.equal(pickLyrics(records, 200_000), 'instrumental');
});

test('with no known length, any record fits', () => {
  assert.deepEqual(pickLyrics([record({ duration: 999, syncedLyrics: '[00:01.00]x' })], null), { text: '[00:01.00]x', synced: true });
});

test('the exact lookup sends title, artist and whole seconds, and its hit ends the search', async () => {
  const { fn, urls } = fakeFetch({ '/get': record({ syncedLyrics: '[00:01.00]hi' }) });
  const found = await findLyrics({ title: 'Song', artist: 'Artist', duration_ms: 200_400 }, fn);
  assert.deepEqual(found, { text: '[00:01.00]hi', synced: true });
  assert.deepEqual(urls, ['https://lrclib.net/api/get?track_name=Song&artist_name=Artist&duration=200']);
});

test('a miss falls back to search, then to search with the plain title and first artist', async () => {
  const { fn, urls } = fakeFetch({
    '/search': (u: URL) => (u.searchParams.get('track_name') === 'Song' ? [record({ plainLyrics: 'found' })] : []),
  });
  const found = await findLyrics({ title: 'Song (feat. B)', artist: 'A; B', duration_ms: 200_000 }, fn);
  assert.deepEqual(found, { text: 'found', synced: false });
  assert.equal(urls.length, 3);
  assert.match(urls[2], /track_name=Song&artist_name=A$/);
});

test('a song with no artist skips the exact lookup and searches by title', async () => {
  const { fn, urls } = fakeFetch({ '/search': [] });
  assert.equal(await findLyrics({ title: 'Song', artist: null, duration_ms: 200_000 }, fn), null);
  assert.deepEqual(urls, ['https://lrclib.net/api/search?track_name=Song']);
});

test('LRCLIB errors other than not found are thrown, for the caller to show', async () => {
  const fn = async () => new Response('busy', { status: 503 });
  await assert.rejects(findLyrics({ title: 'Song', artist: 'A', duration_ms: null }, fn), /503/);
});
