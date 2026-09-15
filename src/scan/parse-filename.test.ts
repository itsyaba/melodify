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
