import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLyrics, lookups, pickLyrics, primaryArtist, rankRecords, searchLyrics, simplifyTitle, type LrclibRecord } from './online.ts';

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
  assert.equal(simplifyTitle('Song ft. Someone'), 'Song');
  assert.equal(simplifyTitle('Song feat. Someone'), 'Song');
  assert.equal(simplifyTitle('Hyphen - Song'), 'Hyphen - Song');
});

test('the first artist is split off every kind of separator', () => {
  for (const name of ['A; B', 'A / B', 'A, B', 'A & B', 'A x B', 'A and B', 'A feat. B', 'A ft. B', 'A featuring B', 'A with B']) {
    assert.equal(primaryArtist(name), 'A', name);
  }
  assert.equal(primaryArtist('Axel'), 'Axel');
});

test('lookups go from the exact match to looser searches, and a band name is tried whole first', () => {
  const list = lookups({ title: 'Song (feat. C)', artist: 'Simon & Garfunkel', duration_ms: 200_000 });
  assert.deepEqual(
    list.map((l) => [l.path, l.params, l.strict]),
    [
      ['/get', { track_name: 'Song (feat. C)', artist_name: 'Simon & Garfunkel', duration: '200' }, false],
      ['/search', { track_name: 'Song (feat. C)', artist_name: 'Simon & Garfunkel' }, false],
      ['/search', { track_name: 'Song', artist_name: 'Simon' }, false],
      ['/search', { track_name: 'Song' }, true],
    ],
  );
});

test('an "Artist - Title" title is searched as free text, whatever the artist tag says', () => {
  const list = lookups({ title: 'Queen - Bohemian Rhapsody (Official Video)', artist: 'Music', duration_ms: 359_000 });
  assert.deepEqual(list.at(-1), { path: '/search', params: { q: 'Queen Bohemian Rhapsody' }, strict: false });
});

test('the title alone is only tried when the length is known, to hold results to it', () => {
  assert.deepEqual(lookups({ title: 'Song', artist: null, duration_ms: null }), []);
  assert.equal(lookups({ title: 'Song', artist: 'A', duration_ms: null }).some((l) => !l.params.artist_name), false);
});

test('control characters in tags are dropped before they reach the URL', () => {
  const [first] = lookups({ title: 'Song\u0000', artist: 'A\u0000\u0000', duration_ms: null });
  assert.deepEqual(first.params, { track_name: 'Song', artist_name: 'A', duration: undefined });
});

test('synced lyrics of the same length win over plain ones and over other lengths', () => {
  const records = [
    record({ duration: 260, syncedLyrics: '[00:01.00]wrong cut' }),
    record({ duration: 201, plainLyrics: 'plain' }),
    record({ duration: 199, syncedLyrics: '[00:01.00]right' }),
  ];
  assert.deepEqual(pickLyrics(records, 200_000), { text: '[00:01.00]right', synced: true });
});

test('plain lyrics of another length are a last resort, but not in a strict lookup', () => {
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

test('the title-only search turns down lyrics of another length', async () => {
  const { fn } = fakeFetch({ '/search': (u: URL) => (u.searchParams.get('artist_name') ? [] : [record({ duration: 300, plainLyrics: 'x' })]) });
  assert.equal(await findLyrics({ title: 'Song', artist: 'Wrong Folder', duration_ms: 200_000 }, fn), null);
});

test('a song with no artist skips the exact lookup and searches by title', async () => {
  const { fn, urls } = fakeFetch({ '/search': [] });
  assert.equal(await findLyrics({ title: 'Song', artist: null, duration_ms: 200_000 }, fn), null);
  assert.deepEqual(urls, ['https://lrclib.net/api/search?track_name=Song']);
});

test('a busy LRCLIB is asked once more before moving on', async () => {
  let calls = 0;
  const busyOnce = async () => {
    calls += 1;
    return calls === 1 ? new Response('busy', { status: 503 }) : new Response(JSON.stringify(record({ plainLyrics: 'found' })), { status: 200 });
  };
  assert.deepEqual(await findLyrics({ title: 'Song', artist: 'A', duration_ms: null }, busyOnce), { text: 'found', synced: false });
  assert.equal(calls, 2);
});

test('an error from LRCLIB passes to the next lookup, and is thrown only if none finds anything', async () => {
  let calls = 0;
  const broken = async (url: string) => {
    calls += 1;
    if (url.includes('/get')) return new Response('oops', { status: 500 });
    return new Response(JSON.stringify([record({ plainLyrics: 'found' })]), { status: 200 });
  };
  assert.deepEqual(await findLyrics({ title: 'Song', artist: 'A', duration_ms: null }, broken), { text: 'found', synced: false });
  assert.equal(calls, 2);
  const down = async () => new Response('oops', { status: 500 });
  await assert.rejects(findLyrics({ title: 'Song', artist: 'A', duration_ms: null }, down), /500/);
});

test('no connection stops the lookups at once', async () => {
  let calls = 0;
  const offline = async () => {
    calls += 1;
    throw new TypeError('Network request failed');
  };
  await assert.rejects(findLyrics({ title: 'Song', artist: 'A', duration_ms: 200_000 }, offline), /Network request failed/);
  assert.equal(calls, 1);
});

test('choices keep only records with lyrics, same length and synced first, copies once', () => {
  const ranked = rankRecords(
    [
      record({ trackName: 'far', duration: 400, syncedLyrics: '[00:01.00]x' }),
      record({ trackName: 'none', duration: 200 }),
      record({ trackName: 'plain', duration: 200, plainLyrics: 'x' }),
      record({ trackName: 'synced', duration: 201, syncedLyrics: '[00:01.00]x' }),
      record({ trackName: 'Synced', duration: 201, syncedLyrics: '[00:01.00]y' }),
    ],
    200_000,
  );
  assert.deepEqual(ranked.map((r) => r.trackName), ['synced', 'plain', 'far']);
});

test('a typed search goes to LRCLIB as free text', async () => {
  const { fn, urls } = fakeFetch({ '/search': [record({ plainLyrics: 'x' })] });
  assert.equal((await searchLyrics('  queen  bohemian ', null, fn)).length, 1);
  assert.deepEqual(urls, ['https://lrclib.net/api/search?q=queen%20bohemian']);
});
