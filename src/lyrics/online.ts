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
/** "Artist - Title", with an ASCII hyphen, en dash or em dash, as the scanner splits filenames. */
const ARTIST_SPLIT = /\s[-–—]\s/;

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

/** LRCLIB answered, but with an error, such as the odd 503 it sheds load with. */
class LrclibError extends Error {}

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/** One request to LRCLIB, and whether its results must match the song's length to count. */
export interface Lookup {
  path: '/get' | '/search';
  params: Record<string, string | undefined>;
  strict: boolean;
}

/**
 * LRCLIB's search wants every word it is given, so one stray word in a tag finds nothing. Tags
 * read from some files also carry NULs and other control characters that never show on screen.
 */
function clean(text: string | null): string {
  return (text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "Song (feat. X) [Official Video]", "Song ft. X" and "Song - Remastered 2009" all become "Song". */
export function simplifyTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+(feat\.?|ft\.|featuring)\s.*$/i, '')
    .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|mix|live|mono|stereo)\b.*$/i, '')
    .trim();
}

/**
 * The first of several artists: "A; B", "A, B", "A & B", "A x B" and "A feat. B" become "A".
 * Only tried after the whole name, so a band called "Simon & Garfunkel" is found either way.
 */
export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:[;/,&]|\s(?:x|and|feat\.?|ft\.|featuring|with)\s)\s*/i)[0].trim();
}

/** Song length in whole seconds, as LRCLIB takes it. */
function seconds(durationMs: number | null): string | undefined {
  return durationMs === null ? undefined : String(Math.round(durationMs / 1000));
}

/**
 * The requests to make for a song, surest first, stopping at the first that finds lyrics:
 * LRCLIB's exact match on title, artist and length; its search on the tags as they are; the
 * search again on the plain title and first artist; then without the artist, which may be a
 * folder's name the scanner guessed before the tags were read, and so only for a song whose
 * length is known, to hold the results to it. A title of "Artist - Title", from a filename, is
 * also tried as free text.
 */
export function lookups(track: Pick<Track, 'title' | 'artist' | 'duration_ms'>): Lookup[] {
  const title = clean(track.title);
  const artist = clean(track.artist) || undefined;
  const plain = simplifyTitle(title) || title;
  const known = track.duration_ms !== null;
  const list: Lookup[] = [];
  if (!title) return list;
  if (artist) {
    list.push({ path: '/get', params: { track_name: title, artist_name: artist, duration: seconds(track.duration_ms) }, strict: false });
    list.push({ path: '/search', params: { track_name: title, artist_name: artist }, strict: false });
    list.push({ path: '/search', params: { track_name: plain, artist_name: primaryArtist(artist) || artist }, strict: false });
  }
  if (known) list.push({ path: '/search', params: { track_name: plain }, strict: true });
  if (ARTIST_SPLIT.test(plain)) list.push({ path: '/search', params: { q: plain.replace(ARTIST_SPLIT, ' ') }, strict: false });
  const seen = new Set<string>();
  return list.filter((l) => {
    const key = `${l.path}?${JSON.stringify(l.params)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fits(record: LrclibRecord, durationMs: number | null): boolean {
  return durationMs === null || record.duration === null || Math.abs(record.duration - durationMs / 1000) <= DURATION_SLACK_S;
}

/**
 * The best lyrics among LRCLIB's records for a song this long: synced ones whose length matches
 * first, since those are the same recording, then plain ones that match, then an instrumental
 * that matches. Plain lyrics of another length come last (a live cut or a radio edit still has
 * the same words), unless `strict`.
 */
export function pickLyrics(records: LrclibRecord[], durationMs: number | null, strict = false): OnlineLyrics {
  const matching = records.filter((r) => fits(r, durationMs));
  const synced = matching.find((r) => r.syncedLyrics?.trim());
  if (synced) return { text: synced.syncedLyrics!, synced: true };
  const plain = matching.find((r) => r.plainLyrics?.trim());
  if (plain) return { text: plain.plainLyrics!, synced: false };
  if (matching.some((r) => r.instrumental)) return 'instrumental';
  const other = strict ? undefined : records.find((r) => r.plainLyrics?.trim());
  return other ? { text: other.plainLyrics!, synced: false } : null;
}

/** A record's lyrics, synced if it has them. Null for one without any. */
export function lyricsOf(record: LrclibRecord): { text: string; synced: boolean } | null {
  if (record.syncedLyrics?.trim()) return { text: record.syncedLyrics, synced: true };
  if (record.plainLyrics?.trim()) return { text: record.plainLyrics, synced: false };
  return null;
}

/**
 * Search results worth offering to choose from: only those with lyrics, the song's length and
 * synced ones first, and the copies LRCLIB keeps of the same recording shown once.
 */
export function rankRecords(records: LrclibRecord[], durationMs: number | null): LrclibRecord[] {
  const score = (r: LrclibRecord) => (fits(r, durationMs) ? 0 : 2) + (r.syncedLyrics?.trim() ? 0 : 1);
  const seen = new Set<string>();
  return records
    .filter((r) => lyricsOf(r) !== null)
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map(({ r }) => r)
    .filter((r) => {
      const key = `${r.trackName.toLowerCase()}\n${r.artistName.toLowerCase()}\n${Math.round(r.duration ?? 0)}\n${!!r.syncedLyrics}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Busy (503, "retry in a moment", which LRCLIB says often) or rate-limited (429): worth one more go. */
const RETRY_STATUSES = new Set([429, 503]);
const RETRY_AFTER_MS = 1000;

async function call<T>(lookup: Pick<Lookup, 'path' | 'params'>, fetchFn: Fetch): Promise<T | null> {
  const query = Object.entries(lookup.params)
    .filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  for (let attempt = 0; ; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(`${API}${lookup.path}?${query}`, { headers: { 'User-Agent': USER_AGENT }, signal: abort.signal });
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as T;
      if (attempt > 0 || !RETRY_STATUSES.has(res.status)) throw new LrclibError(`LRCLIB answered ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
  }
}

/**
 * Runs the song's lookups in turn until one finds lyrics. A lookup LRCLIB answers with an error
 * is passed over for the next; if none of the rest finds anything that error is thrown, since the
 * lyrics may be there after all. No connection throws at once.
 */
export async function findLyrics(
  track: Pick<Track, 'title' | 'artist' | 'duration_ms'>,
  fetchFn: Fetch = fetch,
): Promise<OnlineLyrics> {
  let failure: LrclibError | null = null;
  for (const lookup of lookups(track)) {
    let answer: LrclibRecord | LrclibRecord[] | null;
    try {
      answer = await call<LrclibRecord | LrclibRecord[]>(lookup, fetchFn);
    } catch (err) {
      if (!(err instanceof LrclibError)) throw err;
      failure ??= err;
      continue;
    }
    const records = answer === null ? [] : Array.isArray(answer) ? answer : [answer];
    const found = pickLyrics(records, track.duration_ms, lookup.strict);
    if (found) return found;
  }
  if (failure) throw failure;
  return null;
}

/** LRCLIB's free-text search, for words the user typed, ranked for choosing from. */
export async function searchLyrics(query: string, durationMs: number | null, fetchFn: Fetch = fetch): Promise<LrclibRecord[]> {
  const records = await call<LrclibRecord[]>({ path: '/search', params: { q: clean(query) } }, fetchFn);
  return rankRecords(records ?? [], durationMs);
}
