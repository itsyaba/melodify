import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fileNameForPlaylist,
  formatM3u,
  normalizePath,
  parseM3u,
  PathIndex,
  playlistNameFromFile,
  relativePath,
  resolveEntry,
} from './m3u.ts';

test('parses extended M3U, keeping the EXTINF title and length with the entry after it', () => {
  const text = '\uFEFF#EXTM3U\r\n#EXTINF:215,Band - Song\r\n../Band/Song.mp3\r\n\r\n# comment\r\nOther.flac\r\n';
  assert.deepEqual(parseM3u(text), [
    { location: '../Band/Song.mp3', title: 'Band - Song', durationS: 215 },
    { location: 'Other.flac' },
  ]);
});

test('EXTINF attributes and an unknown length are tolerated', () => {
  const [entry] = parseM3u('#EXTINF:-1 tvg-id="x",Title\nsong.mp3');
  assert.equal(entry.title, 'Title');
  assert.equal(entry.durationS, undefined);
});

test('relative paths climb out of the playlist folder and back down', () => {
  assert.equal(relativePath('Melodify/Playlists', 'Artist/Album/01.flac'), '../../Artist/Album/01.flac');
  assert.equal(relativePath('', 'Artist/01.flac'), 'Artist/01.flac');
  assert.equal(relativePath('Artist', 'Artist/01.flac'), '01.flac');
  assert.equal(relativePath('Artist/Album', 'Artist/Other/02.flac'), '../Other/02.flac');
});

test('normalizePath resolves dots and never climbs above the top', () => {
  assert.equal(normalizePath('Melodify/Playlists/../../A/./b.mp3'), 'A/b.mp3');
  assert.equal(normalizePath('../../x.mp3'), 'x.mp3');
});

test('an exported playlist reads back to the same paths', () => {
  const tracks = [
    { path: 'Band/Album/01 Song.flac', title: 'Song', artist: 'Band', durationMs: 215_400 },
    { path: 'Loose.mp3', title: 'Loose', artist: null, durationMs: null },
  ];
  const text = formatM3u(tracks, 'Melodify/Playlists');
  assert.match(text, /^#EXTM3U\n#EXTINF:215,Band - Song\n\.\.\/\.\.\/Band\/Album\/01 Song\.flac\n/);
  const index = new PathIndex(tracks.map((t) => t.path));
  const back = parseM3u(text).map((e) => resolveEntry(e, 'Melodify/Playlists', index));
  assert.deepEqual(back, tracks.map((t) => t.path));
});

test('absolute paths, Windows paths and file URLs find the library song by their tail', () => {
  const index = new PathIndex(['Artist/Album/01 Song.flac', 'Other/01 Song.flac']);
  const at = (location: string) => resolveEntry({ location }, 'Melodify/Playlists', index);
  assert.equal(at('/home/me/Music/Artist/Album/01 Song.flac'), 'Artist/Album/01 Song.flac');
  assert.equal(at('C:\\Users\\me\\Music\\Artist\\Album\\01 Song.flac'), 'Artist/Album/01 Song.flac');
  assert.equal(at('file:///Users/me/Music/Artist/Album/01%20Song.flac'), 'Artist/Album/01 Song.flac');
});

test('a tie on the tail matches nothing, and streams are skipped', () => {
  const index = new PathIndex(['A/01 Song.flac', 'B/01 Song.flac']);
  assert.equal(resolveEntry({ location: '/x/01 Song.flac' }, '', index), null);
  assert.equal(resolveEntry({ location: 'http://radio.example/stream' }, '', index), null);
});

test('relative entries match case-insensitively, then fall back to the tail', () => {
  const index = new PathIndex(['Band/Song.MP3', 'Deep/Band/Other.mp3']);
  assert.equal(resolveEntry({ location: 'band/song.mp3' }, '', index), 'Band/Song.MP3');
  assert.equal(resolveEntry({ location: '../Music/Band/Other.mp3' }, 'Lists', index), 'Deep/Band/Other.mp3');
});

test('file names round-trip with playlist names, safely', () => {
  assert.equal(playlistNameFromFile('Road trip.m3u8'), 'Road trip');
  assert.equal(playlistNameFromFile('Old.M3U'), 'Old');
  assert.equal(fileNameForPlaylist('AC/DC: best?'), 'AC_DC_ best_.m3u8');
  assert.equal(fileNameForPlaylist('...'), 'Playlist.m3u8');
});
