import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NativeTrackTags } from '../../modules/melodify-audio/src/MelodifyAudio.types.ts';
import { mergeTags, type GuessedColumns } from './merge-tags.ts';

const guess: GuessedColumns = { title: 'Nude', artist: 'Radiohead', album: 'In Rainbows', track_no: 3, disc_no: null };

function tags(patch: Partial<NativeTrackTags> = {}): NativeTrackTags {
  return {
    uri: 'file:///Documents/Radiohead/In%20Rainbows/03%20-%20Nude.flac',
    title: null, artist: null, album: null, albumArtist: null, genre: null, composer: null,
    year: null, trackNo: null, discNo: null, durationMs: null, bitrate: null, sampleRate: null,
    artKey: null, error: null,
    ...patch,
  };
}

test('real tags replace the filename guesses', () => {
  const merged = mergeTags(guess, tags({ title: 'Nude (Live)', artist: 'Radiohead', album: 'Live', trackNo: 7, discNo: 2 }), null);
  assert.equal(merged.title, 'Nude (Live)');
  assert.equal(merged.album, 'Live');
  assert.equal(merged.track_no, 7);
  assert.equal(merged.disc_no, 2);
});

test('a field the file lacks keeps its guess', () => {
  const merged = mergeTags(guess, tags({ title: 'Nude' }), null);
  assert.equal(merged.artist, 'Radiohead');
  assert.equal(merged.album, 'In Rainbows');
  assert.equal(merged.track_no, 3);
});

test('fields with no guess come straight from the tags', () => {
  const merged = mergeTags(guess, tags({ albumArtist: 'Radiohead', genre: 'Rock', year: 2007, durationMs: 255_000, bitrate: 900_000, sampleRate: 44_100 }), null);
  assert.equal(merged.album_artist, 'Radiohead');
  assert.equal(merged.genre, 'Rock');
  assert.equal(merged.year, 2007);
  assert.equal(merged.duration_ms, 255_000);
  assert.equal(merged.sample_rate, 44_100);
});

test('embedded art beats folder art', () => {
  assert.equal(mergeTags(guess, tags({ artKey: '.artcache/ab12cd34.jpg' }), 'Radiohead/In Rainbows/cover.jpg').art_key, '.artcache/ab12cd34.jpg');
});

test('folder art fills in when the file has none', () => {
  assert.equal(mergeTags(guess, tags(), 'Radiohead/In Rainbows/cover.jpg').art_key, 'Radiohead/In Rainbows/cover.jpg');
});

test('a failed read keeps every guess', () => {
  const merged = mergeTags(guess, tags({ error: 'The operation could not be completed' }), null);
  assert.deepEqual(
    { title: merged.title, artist: merged.artist, album: merged.album, track_no: merged.track_no, disc_no: merged.disc_no },
    guess,
  );
  assert.equal(merged.duration_ms, null);
});
