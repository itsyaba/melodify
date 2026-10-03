import type { TrackSort } from '../db/tracks';
import type { Track } from '../db/types';

/** The orders a list of songs can be put in; the Songs tab sorts in SQL, the rest with `sortOrder`. */
export const SONG_SORTS: readonly { key: TrackSort; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'added', label: 'Recently added' },
  { key: 'played', label: 'Recently played' },
  { key: 'plays', label: 'Most played' },
  { key: 'year', label: 'Year' },
  { key: 'duration', label: 'Duration' },
  { key: 'filename', label: 'File path' },
];

/** A list's own order (a playlist's, an album's track numbers), or one of the song sorts. */
export type ListSort = 'default' | TrackSort;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

type Compare = (a: Track, b: Track) => number;

/** Text A to Z, songs without it last. */
const text = (get: (t: Track) => string | null): Compare => (a, b) => {
  const x = get(a);
  const y = get(b);
  if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
  return collator.compare(x, y);
};
/** Biggest first, songs without it last. */
const newest = (get: (t: Track) => number | null): Compare => (a, b) => {
  const x = get(a);
  const y = get(b);
  if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0);
  return y - x;
};
const ascending = (get: (t: Track) => number | null): Compare => (a, b) => (get(a) ?? 0) - (get(b) ?? 0);
const then = (...all: Compare[]): Compare => (a, b) => {
  for (const c of all) {
    const d = c(a, b);
    if (d !== 0) return d;
  }
  return 0;
};

const albumOrder = then(text((t) => t.album), ascending((t) => t.disc_no), ascending((t) => t.track_no));
/** As Recently added dates a song: by its file, or the scan that found it if earlier. */
const addedAt = (t: Track) => (t.mtime > 0 && t.mtime < t.added_at ? t.mtime : t.added_at);

const compares: Record<TrackSort, Compare> = {
  title: text((t) => t.title),
  artist: then(text((t) => t.artist), albumOrder),
  album: albumOrder,
  added: then(newest(addedAt), text((t) => t.path)),
  played: newest((t) => t.last_played_at),
  plays: then(newest((t) => t.play_count), text((t) => t.title)),
  year: then(newest((t) => t.year), albumOrder),
  duration: newest((t) => t.duration_ms),
  filename: text((t) => t.path),
};

/**
 * The positions of `tracks` in `sort`'s order, so a screen can reorder what it keeps beside each
 * song (a play count) along with them. Ties keep the list's own order.
 */
export function sortOrder(tracks: readonly Track[], sort: ListSort): number[] {
  const order = tracks.map((_, i) => i);
  if (sort === 'default') return order;
  const compare = compares[sort];
  return order.sort((i, j) => compare(tracks[i], tracks[j]));
}
