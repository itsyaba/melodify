import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '@/db/types';
import { commonFields, fieldsOf, propertiesFor, validate } from './fields.ts';

const track = (patch: Partial<Track>) =>
  ({ title: 'T', artist: null, album: null, album_artist: null, genre: null, composer: null, year: null, track_no: null, disc_no: null, ...patch }) as Track;

test('only the fields given are written, trimmed, and empty means clear', () => {
  assert.deepEqual(propertiesFor({ title: ' Song ', genre: '', artist: undefined }), { TITLE: 'Song', GENRE: '' });
  assert.deepEqual(propertiesFor({ albumArtist: 'Various', year: '2011', track: '3/12' }), {
    ALBUMARTIST: 'Various', DATE: '2011', TRACKNUMBER: '3/12',
  });
});

test('a row turns into editor text', () => {
  assert.deepEqual(fieldsOf(track({ title: 'A', year: 2011, track_no: 3, artist: 'B' })), {
    title: 'A', artist: 'B', album: '', albumArtist: '', genre: '', composer: '', year: '2011', track: '3', disc: '',
  });
});

test('several songs show what they agree on, and null where they differ', () => {
  const common = commonFields([
    track({ title: 'One', album: 'X', artist: 'Band', track_no: 1 }),
    track({ title: 'Two', album: 'X', artist: 'Band', track_no: 2 }),
  ]);
  assert.equal(common.album, 'X');
  assert.equal(common.artist, 'Band');
  assert.equal(common.title, null);
  assert.equal(common.track, null);
  assert.equal(common.genre, '');
});

test('years and numbers are checked', () => {
  assert.equal(validate({ year: '2011', track: '3/12', disc: '1' }), null);
  assert.equal(validate({ year: '' }), null);
  assert.match(validate({ year: '11' }) ?? '', /year/);
  assert.match(validate({ track: 'three' }) ?? '', /track/);
});
