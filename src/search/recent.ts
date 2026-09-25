import type { SearchItem } from './rank';
import { foldForFind } from '@/utils/find';

/** What Search remembers of an opened result: enough to find it again in the library. */
export type RecentItem =
  | { kind: 'track'; id: number }
  | { kind: 'album'; album: string; albumArtist: string | null }
  | { kind: 'artist'; name: string }
  | { kind: 'playlist'; id: number }
  | { kind: 'folder'; path: string };

export function recentOf(item: SearchItem): RecentItem {
  switch (item.kind) {
    case 'track':
      return { kind: 'track', id: item.track.id };
    case 'album':
      return { kind: 'album', album: item.album.album, albumArtist: item.album.album_artist };
    case 'artist':
      return { kind: 'artist', name: item.artist.name };
    case 'playlist':
      return { kind: 'playlist', id: item.playlist.id };
    case 'folder':
      return { kind: 'folder', path: item.folder.path };
  }
}

export function recentKey(r: RecentItem): string {
  switch (r.kind) {
    case 'track':
      return `t:${r.id}`;
    case 'album':
      return `a:${r.albumArtist ?? ''}\u0000${r.album}`;
    case 'artist':
      return `r:${r.name}`;
    case 'playlist':
      return `p:${r.id}`;
    case 'folder':
      return `f:${r.path}`;
  }
}

/** `item` moved to the front, any earlier copy dropped, at most `cap` kept. */
export function withRecent(list: RecentItem[], item: RecentItem, cap: number): RecentItem[] {
  const key = recentKey(item);
  return [item, ...list.filter((r) => recentKey(r) !== key)].slice(0, cap);
}

/**
 * The remembered items that are still in the library, in their remembered order. Anything gone
 * since (a deleted playlist, a song removed by a rescan) is left out.
 */
export function resolveRecents(recents: RecentItem[], items: SearchItem[]): SearchItem[] {
  const byKey = new Map(items.map((i) => [recentKey(recentOf(i)), i]));
  return recents.flatMap((r) => {
    const found = byKey.get(recentKey(r));
    return found ? [found] : [];
  });
}

/** Earlier searches that contain what is typed, as completions for it, at most `max`. */
export function suggestQueries(past: string[], query: string, max = 4): string[] {
  const q = foldForFind(query.trim());
  if (!q) return [];
  return past.filter((p) => {
    const f = foldForFind(p);
    return f !== q && f.includes(q);
  }).slice(0, max);
}
