import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSearch, scoreMatch, searchItems, type SearchItem, type SearchLibrary } from './rank.ts';
import type { Track } from '@/db/types';

function track(id: number, title: string, artist: string | null = null, album: string | null = null): Track {
  return { id, title, artist, album, album_artist: null, filename: `${title}.mp3` } as Track;
}

const library: SearchLibrary = {
  tracks: [
    track(1, 'We Are Young', 'fun.', 'Some Nights'),
    track(2, 'Some Nights', 'fun.', 'Some Nights'),
    track(3, 'Young Folks', 'Peter Bjorn and John'),
    track(4, 'Halo', 'Beyoncé', 'I Am... Sasha Fierce'),
  ],
  albums: [{ album: 'Some Nights', album_artist: 'fun.', year: 2012, track_count: 2, art_key: null, first_track_id: 2, added_at: 0 }],
  artists: [{ name: 'fun.', track_count: 2, album_count: 1, art_key: null, duration_ms: null }],
  playlists: [],
  folders: [{ path: 'Music/Young', name: 'Young', track_count: 1 } as SearchLibrary['folders'][number]],
};
const items = searchItems(library, true);

const label = (i: SearchItem) => {
  switch (i.kind) {
    case 'track': return `song ${i.track.title}`;
    case 'album': return `album ${i.album.album}`;
    case 'artist': return `artist ${i.artist.name}`;
    case 'playlist': return `playlist ${i.playlist.name}`;
    case 'folder': return `folder ${i.folder.name}`;
  }
};

test('scoreMatch orders exact, prefix, word start, anywhere, all words, elsewhere', () => {
  assert.equal(scoreMatch('help', 'help', 'help', ['help']), 0);
  assert.equal(scoreMatch('help me', 'help me', 'help', ['help']), 1);
  assert.equal(scoreMatch('i need help', 'i need help', 'help', ['help']), 2);
  assert.equal(scoreMatch('helpless', 'helpless', 'less', ['less']), 3);
  assert.equal(scoreMatch('young we are', 'young we are', 'we young', ['we', 'young']), 4);
  assert.equal(scoreMatch('we are young', 'we are young\nfun.', 'fun young', ['fun', 'young']), 5);
  assert.equal(scoreMatch('we are young', 'we are young', 'old', ['old']), null);
});

test('words can match across a song and its artist', () => {
  assert.deepEqual(rankSearch(items, 'fun we are young').map(label), ['song We Are Young']);
});

test('the best match comes first, and ties read artist, album, song', () => {
  assert.deepEqual(rankSearch(items, 'some nights').map(label), ['album Some Nights', 'song Some Nights', 'song We Are Young']);
  assert.deepEqual(rankSearch(items, 'young').map(label), ['folder Young', 'song Young Folks', 'song We Are Young']);
});

test('accents and case are ignored, and an empty query finds nothing', () => {
  assert.deepEqual(rankSearch(items, 'BEYONCE').map(label), ['song Halo']);
  assert.deepEqual(rankSearch(items, '   '), []);
});

test('folders are left out while the Folders tab is off', () => {
  assert.ok(!searchItems(library, false).some((i) => i.kind === 'folder'));
});
