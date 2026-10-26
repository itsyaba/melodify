import type { PlayRow } from '@/db/recap';
import { daysInPeriod, type RecapPeriod } from './period';

/**
 * A recap, worked out from the plays inside a span. Pure, and the only place the numbers are
 * decided: the cards only draw what is here.
 */

/** One artist, album or genre in a ranking. */
export interface RecapEntry {
  name: string;
  plays: number;
  /** Time spent on it, from the songs' own lengths. */
  ms: number;
  art_key: string | null;
}

export interface RecapTrack extends RecapEntry {
  track_id: number;
  artist: string | null;
}

export interface Recap {
  period: RecapPeriod;
  plays: number;
  /** Rounded minutes, the way Spotify counts a year. */
  minutes: number;
  songs: number;
  artists: number;
  albums: number;
  topTracks: RecapTrack[];
  topArtists: RecapEntry[];
  topAlbums: RecapEntry[];
  topGenres: RecapEntry[];
  /** Plays by hour of the day, 0 to 23. */
  byHour: number[];
  peakHour: number;
  /** Days with at least one play, and how many the span holds. */
  activeDays: number;
  totalDays: number;
  /** The longest run of days in a row with a play. */
  streak: number;
  busiestDay: { at: number; plays: number } | null;
  /** Songs and artists heard for the first time ever inside the span. */
  discoveries: { songs: number; artists: number; covers: string[] };
  /** The top artist's share of every play, 0 to 1. */
  topArtistShare: number;
  /** The average release year of what was played, for "your taste sits in 2014". */
  averageYear: number | null;
  persona: { title: string; blurb: string };
  /** The same numbers for the span before, when there were any. */
  previous: { plays: number; minutes: number } | null;
}

const UNKNOWN = 'Unknown';

interface Tally {
  plays: number;
  ms: number;
  art_key: string | null;
  extra?: { track_id: number; artist: string | null };
}

function tally(map: Map<string, Tally>, key: string | null, row: PlayRow, extra?: Tally['extra']): void {
  const name = key?.trim() || '';
  if (!name) return;
  const at = map.get(name);
  if (at) {
    at.plays += 1;
    at.ms += row.duration_ms ?? 0;
    at.art_key ??= row.art_key;
    return;
  }
  map.set(name, { plays: 1, ms: row.duration_ms ?? 0, art_key: row.art_key, extra });
}

function rank(map: Map<string, Tally>, limit: number): RecapEntry[] {
  return [...map]
    .map(([name, t]) => ({ name, plays: t.plays, ms: t.ms, art_key: t.art_key }))
    .sort((a, b) => b.plays - a.plays || b.ms - a.ms || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** The day a moment falls on, local time, as "2026-10-26". */
function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** The longest run of days in a row that have a play, over the days that do. */
function longestStreak(days: Set<string>): number {
  const sorted = [...days]
    .map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    })
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let last: number | null = null;
  for (const at of sorted) {
    const next = new Date(at);
    const yesterday = last === null ? null : new Date(last);
    if (yesterday && new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1).getTime() === next.getTime()) {
      run += 1;
    } else {
      run = 1;
    }
    last = at;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Which kind of listener the span describes. The first rule that fits wins, so the most
 * surprising line is the one shown: devotion first, then hunting, then the clock.
 */
function persona(input: {
  share: number;
  artists: number;
  plays: number;
  topTrackPlays: number;
  night: number;
  morning: number;
  discovered: number;
}): { title: string; blurb: string } {
  const { share, artists, plays, topTrackPlays, night, morning, discovered } = input;
  if (plays > 0 && share >= 0.3) {
    return { title: 'The Devotee', blurb: `One artist took ${Math.round(share * 100)}% of everything you played.` };
  }
  if (topTrackPlays >= 15) {
    return { title: 'The Repeater', blurb: `You played one song ${topTrackPlays} times. No notes.` };
  }
  if (plays > 0 && night / plays >= 0.35) {
    return { title: 'The Night Owl', blurb: 'Most of your music happened after the rest of us went to bed.' };
  }
  if (plays > 0 && morning / plays >= 0.3) {
    return { title: 'The Early Bird', blurb: 'You get the music started before most people are up.' };
  }
  if (plays > 0 && discovered / plays >= 0.25) {
    return { title: 'The Explorer', blurb: 'A quarter of what you played, you had never played before.' };
  }
  if (plays > 0 && artists / plays >= 0.4) {
    return { title: 'The Wanderer', blurb: 'You rarely play the same artist twice in a row.' };
  }
  return { title: 'The Regular', blurb: 'A steady rotation, and you know exactly what you like.' };
}

/** Everything the cards show, from the plays inside the span and the ones in the span before. */
export function buildRecap(period: RecapPeriod, rows: PlayRow[], before: PlayRow[] = []): Recap {
  const tracks = new Map<string, Tally>();
  const artists = new Map<string, Tally>();
  const albums = new Map<string, Tally>();
  const genres = new Map<string, Tally>();
  const days = new Map<string, number>();
  const byHour = Array<number>(24).fill(0);
  const songIds = new Set<number>();
  const newSongs = new Set<number>();
  const newArtists = new Set<string>();
  const covers: string[] = [];
  let ms = 0;
  let years = 0;
  let yearCount = 0;
  let night = 0;
  let morning = 0;

  for (const row of rows) {
    ms += row.duration_ms ?? 0;
    songIds.add(row.track_id);
    tally(tracks, String(row.track_id), row, { track_id: row.track_id, artist: row.artist });
    tally(artists, row.artist, row);
    tally(albums, row.album, row);
    tally(genres, row.genre, row);
    const hour = new Date(row.played_at).getHours();
    byHour[hour] += 1;
    if (hour >= 22 || hour < 5) night += 1;
    if (hour >= 5 && hour < 10) morning += 1;
    const key = dayKey(row.played_at);
    days.set(key, (days.get(key) ?? 0) + 1);
    if (row.year) {
      years += row.year;
      yearCount += 1;
    }
    // Heard for the first time ever inside this span: the discovery cards.
    if (row.first_played_at >= period.from && row.first_played_at < period.to) {
      if (!newSongs.has(row.track_id) && row.art_key && covers.length < 6) covers.push(row.art_key);
      newSongs.add(row.track_id);
      if (row.artist) newArtists.add(row.artist.trim());
    }
  }

  // The track ranking is keyed by id, so put the titles back on it.
  const titles = new Map<number, PlayRow>();
  for (const row of rows) if (!titles.has(row.track_id)) titles.set(row.track_id, row);
  const topTracks: RecapTrack[] = rank(tracks, 5).map((entry) => {
    const row = titles.get(Number(entry.name));
    return { ...entry, name: row?.title ?? UNKNOWN, track_id: Number(entry.name), artist: row?.artist ?? null };
  });

  const topArtists = rank(artists, 5);
  const busiest = [...days].sort((a, b) => b[1] - a[1])[0];
  const share = rows.length ? (topArtists[0]?.plays ?? 0) / rows.length : 0;
  const peakHour = byHour.reduce((best, count, hour) => (count > byHour[best] ? hour : best), 0);
  const beforeMs = before.reduce((sum, row) => sum + (row.duration_ms ?? 0), 0);

  return {
    period,
    plays: rows.length,
    minutes: Math.round(ms / 60_000),
    songs: songIds.size,
    artists: artists.size,
    albums: albums.size,
    topTracks,
    topArtists,
    topAlbums: rank(albums, 3),
    topGenres: rank(genres, 3),
    byHour,
    peakHour,
    activeDays: days.size,
    totalDays: daysInPeriod(period),
    streak: longestStreak(new Set(days.keys())),
    busiestDay: busiest
      ? {
          at: (() => {
            const [y, m, d] = busiest[0].split('-').map(Number);
            return new Date(y, m - 1, d).getTime();
          })(),
          plays: busiest[1],
        }
      : null,
    discoveries: { songs: newSongs.size, artists: newArtists.size, covers },
    topArtistShare: share,
    averageYear: yearCount ? Math.round(years / yearCount) : null,
    persona: persona({
      share,
      artists: artists.size,
      plays: rows.length,
      topTrackPlays: topTracks[0]?.plays ?? 0,
      night,
      morning,
      discovered: newSongs.size,
    }),
    previous: before.length ? { plays: before.length, minutes: Math.round(beforeMs / 60_000) } : null,
  };
}

/** "18% more than September", or null when there is nothing to compare with. */
export function minutesChange(recap: Recap): { percent: number; up: boolean } | null {
  const before = recap.previous?.minutes ?? 0;
  if (!before || !recap.minutes) return null;
  const change = (recap.minutes - before) / before;
  if (Math.abs(change) < 0.05) return null;
  return { percent: Math.round(Math.abs(change) * 100), up: change > 0 };
}

/** "just after midnight", "in the afternoon": the peak hour in words. */
export function hourPhrase(hour: number): string {
  if (hour === 0) return 'just after midnight';
  if (hour < 5) return 'in the small hours';
  if (hour < 9) return 'first thing in the morning';
  if (hour < 12) return 'through the morning';
  if (hour < 14) return 'around lunch';
  if (hour < 18) return 'in the afternoon';
  if (hour < 22) return 'in the evening';
  return 'late at night';
}

/** "3 PM", for the clock card's label. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}
