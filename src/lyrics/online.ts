import type { Track } from '@/db/types';

/**
 * Lyrics from LRCLIB (lrclib.net): free, keyless, and often synced. This is the app's one online
 * lookup, and it only runs when the user taps Search online on a song with no lyrics; what it
 * finds is saved as a `.lrc` beside the song, so each song goes online at most once.
 */

const API = 'https://lrclib.net/api';
/** LRCLIB asks clients to name themselves. */
const USER_AGENT = 'Melodify (https://github.com/itsyaba/melodify)';
const TIMEOUT_MS = 10_000;
/** LRCLIB's own lookup allows 2 s; search results get a little more. */
const DURATION_SLACK_S = 3;

export interface LrclibRecord {
  trackName: string;
  artistName: string;
  albumName: string | null;
  /** Seconds. */
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export type OnlineLyrics = { text: string; synced: boolean } | 'instrumental' | null;

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/** "Song (feat. X) [2011 Remaster]" and "Song - Remastered 2009" both become "Song". */
export function simplifyTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|mix|live|mono|stereo)\b.*$/i, '')
    .trim();
}

/** The first of several artists: "A; B", "A / B" and "A feat. B" become "A". Not "&" or ",", which band names use. */
export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:;|\/|\s(?:feat\.?|ft\.|featuring)\s)\s*/i)[0].trim();
}

/**
 * The best lyrics among LRCLIB's records for a song this long: synced ones whose length matches
 * first, since those are the same recording, then plain ones that match, then an instrumental
 * that matches. Plain lyrics of another length come last (a live cut or a radio edit still has
 * the same words), unless `strict`, for a song with no artist, where a title alone is too loose.
 */
export function pickLyrics(records: LrclibRecord[], durationMs: number | null, strict = false): OnlineLyrics {
  const seconds = durationMs === null ? null : durationMs / 1000;
  const fits = records.filter((r) => seconds === null || r.duration === null || Math.abs(r.duration - seconds) <= DURATION_SLACK_S);
  const synced = fits.find((r) => r.syncedLyrics?.trim());
  if (synced) return { text: synced.syncedLyrics!, synced: true };
  const plain = fits.find((r) => r.plainLyrics?.trim());
  if (plain) return { text: plain.plainLyrics!, synced: false };
  if (fits.some((r) => r.instrumental)) return 'instrumental';
  const other = strict ? undefined : records.find((r) => r.plainLyrics?.trim());
  return other ? { text: other.plainLyrics!, synced: false } : null;
}

async function call<T>(path: string, params: Record<string, string | undefined>, fetchFn: Fetch): Promise<T | null> {
  const query = Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${API}${path}?${query}`, { headers: { 'User-Agent': USER_AGENT }, signal: abort.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`LRCLIB answered ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks the song up by its tags: LRCLIB's exact match on title, artist and length first, then
 * its search, then the search again with the title and artist cut down to their plain parts.
 * Throws when LRCLIB cannot be reached.
 */
export async function findLyrics(
  track: Pick<Track, 'title' | 'artist' | 'duration_ms'>,
  fetchFn: Fetch = fetch,
): Promise<OnlineLyrics> {
  const title = track.title.trim();
  const artist = track.artist?.trim() || undefined;
  if (!title) return null;
  if (artist) {
    const duration = track.duration_ms === null ? undefined : String(Math.round(track.duration_ms / 1000));
    const exact = await call<LrclibRecord>('/get', { track_name: title, artist_name: artist, duration }, fetchFn);
    const found = exact ? pickLyrics([exact], track.duration_ms) : null;
    if (found) return found;
  }
  const tried = new Set<string>();
  for (const [name, by] of [[title, artist], [simplifyTitle(title), artist && primaryArtist(artist)]]) {
    const key = `${name}\n${by ?? ''}`;
    if (!name || tried.has(key)) continue;
    tried.add(key);
    const records = await call<LrclibRecord[]>('/search', { track_name: name, artist_name: by }, fetchFn);
    const found = pickLyrics(records ?? [], track.duration_ms, !artist);
    if (found) return found;
  }
  return null;
}
