import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessTags } from './parse-filename.ts';

test('artist/album/nn - title', () => {
  assert.deepEqual(guessTags('Radiohead/In Rainbows/03 - Nude.flac'), {
    title: 'Nude', artist: 'Radiohead', album: 'In Rainbows', track_no: 3, disc_no: null,
  });
});

test('disc-track prefix', () => {
  const g = guessTags('A/B/2-05 Song Name.mp3');
  assert.equal(g.disc_no, 2);
  assert.equal(g.track_no, 5);
  assert.equal(g.title, 'Song Name');
});

test('dot separator', () => {
  assert.equal(guessTags('A/B/07. Seven.m4a').title, 'Seven');
});

test('root file with artist - title', () => {
  assert.deepEqual(guessTags('Daft Punk - Digital Love.mp3'), {
    title: 'Digital Love', artist: 'Daft Punk', album: null, track_no: null, disc_no: null,
  });
});

test('single folder becomes album, no artist', () => {
  const g = guessTags('Mixtape/track.mp3');
  assert.equal(g.album, 'Mixtape');
  assert.equal(g.artist, null);
  assert.equal(g.title, 'track');
});

test('numeric-only title survives', () => {
  assert.equal(guessTags('X/Y/1999.mp3').title, '1999');
});

test('underscore-joined name yields track number and artist', () => {
  assert.deepEqual(guessTags('10_Aster_Aweke_-_Ewedihalehu.mp3'), {
    title: 'Ewedihalehu', artist: 'Aster Aweke', album: null, track_no: 10, disc_no: null,
  });
});

test('en dash separates artist like a hyphen', () => {
  const g = guessTags('3_Eyob_Mekonnen_–_Tetertche.mp3');
  assert.equal(g.artist, 'Eyob Mekonnen');
  assert.equal(g.title, 'Tetertche');
  assert.equal(g.track_no, 3);
});

test('em dash separates artist too', () => {
  assert.equal(guessTags('Rokia Traoré — Laidu.mp3').artist, 'Rokia Traoré');
});

test('underscores become spaces with no track number', () => {
  const g = guessTags('Samsung/Over_the_Horizon.m4a');
  assert.equal(g.title, 'Over the Horizon');
  assert.equal(g.album, 'Samsung');
  assert.equal(g.track_no, null);
});

test('only the first dash splits; later ones stay in the title', () => {
  const g = guessTags('Yohana - Berta - Official Video.mp3');
  assert.equal(g.artist, 'Yohana');
  assert.equal(g.title, 'Berta - Official Video');
});

test('folder-derived artist still wins over a dash in the filename', () => {
  const g = guessTags('Radiohead/In Rainbows/03 - Nude.flac');
  assert.equal(g.artist, 'Radiohead');
  assert.equal(g.title, 'Nude');
});
