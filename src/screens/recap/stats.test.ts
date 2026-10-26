import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlayRow } from '@/db/recap';
import { monthPeriod } from './period';
import { buildRecap, hourLabel, hourPhrase, minutesChange } from './stats';

const PERIOD = monthPeriod(new Date(2026, 9, 1));

function play(day: number, hour: number, song: Partial<PlayRow> = {}): PlayRow {
  const played_at = new Date(2026, 9, day, hour).getTime();
  return {
    played_at,
    track_id: 1,
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    album_artist: 'Artist',
    genre: 'Pop',
    art_key: 'art/1.jpg',
    duration_ms: 180_000,
    year: 2014,
    first_played_at: played_at,
    ...song,
  };
}

test('counts plays, minutes and what was played', () => {
  const rows = [
    play(1, 9),
    play(1, 10, { track_id: 2, title: 'Other', album: 'Second' }),
    play(2, 11, { track_id: 3, title: 'Third', artist: 'Someone else', album: 'Third album', genre: 'Rock' }),
  ];
  const recap = buildRecap(PERIOD, rows);
  assert.equal(recap.plays, 3);
  assert.equal(recap.minutes, 9);
  assert.equal(recap.songs, 3);
  assert.equal(recap.artists, 2);
  assert.equal(recap.albums, 3);
  assert.equal(recap.topArtists[0].name, 'Artist');
  assert.equal(recap.topArtists[0].plays, 2);
  assert.equal(recap.topGenres[0].name, 'Pop');
  assert.equal(recap.averageYear, 2014);
  assert.equal(recap.totalDays, 31);
});

test('ranks songs by plays and keeps their titles', () => {
  const rows = [
    play(1, 9, { track_id: 7, title: 'Hit' }),
    play(1, 10, { track_id: 7, title: 'Hit' }),
    play(2, 10, { track_id: 8, title: 'Deep cut', artist: 'Another' }),
  ];
  const recap = buildRecap(PERIOD, rows);
  assert.equal(recap.topTracks[0].name, 'Hit');
  assert.equal(recap.topTracks[0].plays, 2);
  assert.equal(recap.topTracks[0].track_id, 7);
  assert.equal(recap.topTracks[1].name, 'Deep cut');
});

test('days, streaks and the busiest day', () => {
  const rows = [play(1, 9), play(2, 9), play(3, 9), play(3, 10), play(3, 11), play(9, 9)];
  const recap = buildRecap(PERIOD, rows);
  assert.equal(recap.activeDays, 4);
  assert.equal(recap.streak, 3);
  assert.equal(recap.busiestDay?.plays, 3);
  assert.equal(new Date(recap.busiestDay!.at).getDate(), 3);
});

test('the clock finds the hour with the most plays', () => {
  const rows = [play(1, 23), play(2, 23), play(3, 8)];
  const recap = buildRecap(PERIOD, rows);
  assert.equal(recap.peakHour, 23);
  assert.equal(recap.byHour[23], 2);
  assert.equal(hourLabel(23), '11 PM');
  assert.equal(hourLabel(0), '12 AM');
  assert.equal(hourPhrase(23), 'late at night');
});

test('a discovery is a song first played inside the span', () => {
  const old = new Date(2026, 0, 1).getTime();
  const rows = [
    play(2, 9, { track_id: 1, first_played_at: old }),
    play(3, 9, { track_id: 2, title: 'New', artist: 'Newcomer' }),
  ];
  const recap = buildRecap(PERIOD, rows);
  assert.equal(recap.discoveries.songs, 1);
  assert.equal(recap.discoveries.artists, 1);
});

test('the persona follows the strongest signal', () => {
  const devoted = buildRecap(PERIOD, [play(1, 12), play(2, 12), play(3, 12, { track_id: 2, title: 'Two' })]);
  assert.equal(devoted.persona.title, 'The Devotee');
  assert.equal(Math.round(devoted.topArtistShare * 100), 100);

  const night = Array.from({ length: 10 }, (_, i) =>
    play(i + 1, 23, { track_id: i + 1, artist: `Artist ${i}`, title: `Song ${i}`, first_played_at: new Date(2020, 0, 1).getTime() }),
  );
  assert.equal(buildRecap(PERIOD, night).persona.title, 'The Night Owl');
});

test('minutes are compared with the span before, and small changes are left alone', () => {
  const rows = [play(1, 9), play(2, 9)];
  const before = [play(1, 9)];
  assert.deepEqual(minutesChange(buildRecap(PERIOD, rows, before)), { percent: 100, up: true });
  assert.equal(minutesChange(buildRecap(PERIOD, rows, rows)), null);
  assert.equal(minutesChange(buildRecap(PERIOD, rows)), null);
});
