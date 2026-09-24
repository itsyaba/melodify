import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BackupTrack } from './format.ts';
import { applyRule, matchTracks, remapFolder, ruleBetween, type LibraryTrack } from './match.ts';

let nextId = 1;
function lib(path: string, extra: Partial<LibraryTrack> = {}): LibraryTrack {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return { id: nextId++, path, title: name, artist: null, album: null, duration_ms: null, ...extra };
}
function bak(path: string, extra: Partial<BackupTrack> = {}): BackupTrack {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return { path, title: name, ...extra };
}

test('rules swap a folder prefix, and only on a folder boundary', () => {
  assert.equal(applyRule('Music/A/1.mp3', { from: 'Music', to: '' }), 'A/1.mp3');
  assert.equal(applyRule('A/1.mp3', { from: '', to: 'Music' }), 'Music/A/1.mp3');
  assert.equal(applyRule('Musical/1.mp3', { from: 'Music', to: 'X' }), null);
  assert.equal(applyRule('Old/B/2.mp3', { from: 'Old/', to: '/New' }), 'New/B/2.mp3');
});

test('ruleBetween drops the shared trailing folders', () => {
  assert.deepEqual(ruleBetween('Music/Artist/Album', 'Artist/Album'), { from: 'Music', to: '' });
  assert.deepEqual(ruleBetween('Old/Album', 'New/Album'), { from: 'Old', to: 'New' });
  assert.deepEqual(ruleBetween('A', 'B'), { from: 'A', to: 'B' });
});

test('the same library matches entirely by path', () => {
  const library = [lib('A/1.mp3'), lib('A/2.mp3')];
  const r = matchTracks([bak('A/2.mp3'), bak('A/1.mp3')], library);
  assert.deepEqual(r.ids, [library[1].id, library[0].id]);
  assert.equal(r.exact, 2);
  assert.equal(r.missing, 0);
});

test('a library copied back one folder up is found folder by folder, and the move is reported', () => {
  const library = [lib('Artist/Album/01 One.flac'), lib('Artist/Album/02 Two.flac'), lib('Other/x.mp3')];
  const r = matchTracks([bak('Music/Artist/Album/01 One.flac'), bak('Music/Artist/Album/02 Two.flac')], library);
  assert.deepEqual(r.ids, [library[0].id, library[1].id]);
  assert.equal(r.remapped, 2);
  assert.deepEqual(r.rules, [{ from: 'Music', to: '', songs: 2 }]);
});

test('file names match without regard to case when a folder moved', () => {
  const library = [lib('New/01 ONE.mp3'), lib('New/02 two.mp3')];
  const r = matchTracks([bak('Old/01 One.mp3'), bak('Old/02 Two.mp3')], library);
  assert.equal(r.remapped, 2);
});

test('one shared common file name is not enough to call a folder moved', () => {
  const library = [lib('Somewhere/01 Intro.mp3')];
  const r = matchTracks([bak('Gone/01 Intro.mp3', { artist: 'X' }), bak('Gone/02 Song.mp3')], library);
  assert.equal(r.remapped, 0);
  assert.equal(r.missing, 2);
});

test('a folder of one song may move on its own', () => {
  const library = [lib('Singles/Song.mp3')];
  const r = matchTracks([bak('Old Singles/Song.mp3')], library);
  assert.equal(r.remapped, 1);
});

test('lengths that disagree keep a same-named file from matching', () => {
  const library = [lib('B/1.mp3', { duration_ms: 100_000 }), lib('B/2.mp3', { duration_ms: 200_000 })];
  const r = matchTracks([bak('A/1.mp3', { durationMs: 100_500 }), bak('A/2.mp3', { durationMs: 90_000 })], library);
  assert.deepEqual(r.ids, [library[0].id, null]);
});

test('tags find a renamed file when exactly one song fits', () => {
  const library = [lib('Renamed/track.mp3', { title: 'Song', artist: 'Band', duration_ms: 180_000 })];
  const r = matchTracks([bak('Old/Song.mp3', { title: 'Song', artist: 'band', durationMs: 181_000 })], library);
  assert.equal(r.byTags, 1);
  assert.equal(r.ids[0], library[0].id);
});

test('tags alone need an artist or album, and an ambiguous fit matches nothing', () => {
  const bare = matchTracks([bak('Old/Intro.mp3', { title: 'Intro' })], [lib('X/y.mp3', { title: 'Intro' })]);
  assert.equal(bare.byTags, 0);
  const twice = matchTracks(
    [bak('Old/a.mp3', { title: 'Song', artist: 'Band' })],
    [lib('X/1.mp3', { title: 'Song', artist: 'Band' }), lib('Y/2.mp3', { title: 'Song', artist: 'Band' })],
  );
  assert.equal(twice.byTags, 0);
});

test('matching is one to one', () => {
  const library = [lib('A/1.mp3')];
  const r = matchTracks([bak('A/1.mp3'), bak('Old/A/1.mp3')], library);
  assert.deepEqual(r.ids, [library[0].id, null]);
});

test('user rules come before the path as it was', () => {
  const library = [lib('Keep/1.mp3'), lib('Moved/1.mp3')];
  const r = matchTracks([bak('Keep/1.mp3')], library, [{ from: 'Keep', to: 'Moved' }]);
  assert.deepEqual(r.ids, [library[1].id]);
  assert.equal(r.remapped, 1);
});

test('missing songs are counted per folder, most first', () => {
  const r = matchTracks([bak('A/1.mp3'), bak('B/1.mp3'), bak('B/2.mp3')], []);
  assert.deepEqual(r.missingFolders, [{ folder: 'B', count: 2 }, { folder: 'A', count: 1 }]);
});

test('excluded folders follow the first rule that covers them', () => {
  assert.equal(remapFolder('Music/Podcasts', [{ from: 'Music', to: '' }]), 'Podcasts');
  assert.equal(remapFolder('Other', [{ from: 'Music', to: '' }]), 'Other');
});
