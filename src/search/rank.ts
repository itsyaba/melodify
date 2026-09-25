import type { PlaylistSummary } from '@/db/playlists';
import type { AlbumSummary, FolderEntry, GroupSummary, Track } from '@/db/types';
import { foldForFind } from '@/utils/find';

export type SearchKind = 'track' | 'album' | 'artist' | 'playlist' | 'folder';

export type SearchItem =
  | { kind: 'track'; track: Track }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: GroupSummary }
  | { kind: 'playlist'; playlist: PlaylistSummary }
  | { kind: 'folder'; folder: FolderEntry };

/** Everything Search looks through, loaded once when a search starts. */
export interface SearchLibrary {
  tracks: Track[];
  albums: AlbumSummary[];
  artists: GroupSummary[];
  playlists: PlaylistSummary[];
  folders: FolderEntry[];
}

/** The library as one list of items, built once per load so their folded text can be kept. */
export function searchItems(library: SearchLibrary, withFolders: boolean): SearchItem[] {
  return [
    ...library.artists.map((artist): SearchItem => ({ kind: 'artist', artist })),
    ...library.albums.map((album): SearchItem => ({ kind: 'album', album })),
    ...library.playlists.map((playlist): SearchItem => ({ kind: 'playlist', playlist })),
    ...library.tracks.map((track): SearchItem => ({ kind: 'track', track })),
    // Only while the Folders tab is on: a switched-off tab's screens cannot be opened.
    ...(withFolders ? library.folders.map((folder): SearchItem => ({ kind: 'folder', folder })) : []),
  ];
}

/** The item's own name, which ranks a match, then the other text it can be found by. */
function texts(item: SearchItem): [string, (string | null)[]] {
  switch (item.kind) {
    case 'track': {
      const t = item.track;
      return [t.title, [t.artist, t.album, t.album_artist, t.filename]];
    }
    case 'album':
      return [item.album.album, [item.album.album_artist]];
    case 'artist':
      return [item.artist.name, []];
    case 'playlist':
      return [item.playlist.name, []];
    case 'folder':
      return [item.folder.name, []];
  }
}

const folded = new WeakMap<SearchItem, { name: string; all: string }>();

function foldedTexts(item: SearchItem) {
  let f = folded.get(item);
  if (!f) {
    const [name, others] = texts(item);
    const n = foldForFind(name);
    f = { name: n, all: [n, ...others.filter(Boolean).map((o) => foldForFind(o!))].join('\n') };
    folded.set(item, f);
  }
  return f;
}

/**
 * How well a match reads, lower being better, or null when some word of the query is in none of
 * the item's text. The whole query as the name comes first, then as its start, as the start of
 * one of its words, anywhere in it; then every word in the name; last, words found elsewhere
 * (a song by its artist or album).
 */
export function scoreMatch(name: string, all: string, phrase: string, words: string[]): number | null {
  if (!words.every((w) => all.includes(w))) return null;
  if (name === phrase) return 0;
  if (name.startsWith(phrase)) return 1;
  if (` ${name}`.includes(` ${phrase}`)) return 2;
  if (name.includes(phrase)) return 3;
  if (words.every((w) => name.includes(w))) return 4;
  return 5;
}

/** On a tie, the way Spotify's top results read: artists, albums, playlists, then songs. */
const KIND_ORDER: Record<SearchKind, number> = { artist: 0, album: 1, playlist: 2, track: 3, folder: 4 };

/** The items matching every word of `query`, best first. Accents and case are ignored. */
export function rankSearch(items: SearchItem[], query: string): SearchItem[] {
  const phrase = foldForFind(query).trim().replace(/\s+/g, ' ');
  if (!phrase) return [];
  const words = phrase.split(' ');
  const scored: { item: SearchItem; score: number; name: string }[] = [];
  for (const item of items) {
    const f = foldedTexts(item);
    const score = scoreMatch(f.name, f.all, phrase, words);
    if (score !== null) scored.push({ item, score, name: f.name });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] ||
      a.name.length - b.name.length ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return scored.map((s) => s.item);
}
