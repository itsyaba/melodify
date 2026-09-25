import { useCallback, useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { promptText, showMenu } from '@/components/menus';
import { toast } from '@/components/toast';
import type { Track } from '@/db/types';
import { findLyrics, lyricsOf, searchLyrics, simplifyTitle } from '@/lyrics/online';
import { lrcPathFor, saveLyrics } from '@/tags';
import { formatDuration } from '@/utils/format';

/** After a failure, `next` is what the button under the message offers: the same search again, or the user's own words. */
export type LyricsSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'failed'; message: string; next: 'retry' | 'words' | null };

const IDLE: LyricsSearchState = { status: 'idle' };
/** As many results as an action sheet shows without scrolling. */
const CHOICES = 8;

/**
 * Shared by song, so the lyrics view and the lyrics card, both showing "No lyrics" at once, show
 * the same search and never send two. Kept for the session, so a miss stays said until retried.
 */
const searches = new Map<number, LyricsSearchState>();
const subscribers = new Set<() => void>();

function set(trackId: number, state: LyricsSearchState) {
  searches.set(trackId, state);
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

const OFFLINE: LyricsSearchState = { status: 'failed', message: 'Could not reach LRCLIB. Check the connection and try again.', next: 'retry' };

/** Starts a search unless one is running, or unless the song has a `.lrc` of the user's own. */
function begin(track: Track): boolean {
  if (searches.get(track.id)?.status === 'searching') return false;
  // Not yet rescanned, or empty, but the user's own: never replaced with something from the internet.
  if (new File(Paths.document, ...lrcPathFor(track).split('/')).exists) {
    set(track.id, { status: 'failed', message: 'There is already a .lrc file beside this song. Rescan, or fix it in Edit lyrics.', next: null });
    return false;
  }
  set(track.id, { status: 'searching' });
  return true;
}

async function save(db: SQLiteDatabase, track: Track, lyrics: { text: string; synced: boolean }): Promise<void> {
  const saved = await saveLyrics(db, track, lyrics.text, 'lrc');
  if (saved.failed) return set(track.id, { status: 'failed', message: saved.error ?? 'Saving the lyrics failed.', next: 'retry' });
  set(track.id, IDLE);
  toast.show(lyrics.synced ? 'Synced lyrics saved from LRCLIB' : 'Lyrics saved from LRCLIB', {
    label: 'Undo',
    onPress: () => void saveLyrics(db, track, '', 'lrc'),
  });
}

/** Looks the song up by its tags and saves the best match. */
async function search(db: SQLiteDatabase, track: Track): Promise<void> {
  if (!begin(track)) return;
  try {
    const found = await findLyrics(track);
    if (found === 'instrumental') return set(track.id, { status: 'failed', message: 'LRCLIB lists this song as instrumental.', next: 'words' });
    if (found === null) {
      // Naming what was looked for shows at once when the tags are the problem.
      const what = `“${track.title}”${track.artist ? ` by ${track.artist}` : ''}`;
      return set(track.id, { status: 'failed', message: `Nothing on LRCLIB for ${what}.`, next: 'words' });
    }
    await save(db, track, found);
  } catch (err) {
    console.warn('[melodify] searching LRCLIB failed:', err);
    set(track.id, OFFLINE);
  }
}

/** Searches LRCLIB for words the user types, and saves the result they pick. */
async function searchWords(db: SQLiteDatabase, track: Track): Promise<void> {
  const before = searches.get(track.id) ?? IDLE;
  const query = await promptText('Search LRCLIB', {
    message: 'Words from the title and the artist.',
    defaultValue: `${track.artist ?? ''} ${simplifyTitle(track.title)}`.trim(),
    ok: 'Search',
  });
  if (!query || !begin(track)) return;
  try {
    const records = await searchLyrics(query, track.duration_ms);
    if (records.length === 0) return set(track.id, { status: 'failed', message: `Nothing on LRCLIB for “${query}”.`, next: 'words' });
    // The sheet has no cancel callback, so the message from before stays under it.
    set(track.id, before);
    showMenu({
      title: 'Choose the lyrics',
      message: track.duration_ms === null ? undefined : `This song is ${formatDuration(track.duration_ms)}.`,
      items: records.slice(0, CHOICES).map((r) => ({
        label: `${r.trackName} · ${r.artistName} · ${formatDuration(r.duration === null ? null : r.duration * 1000)}${r.syncedLyrics?.trim() ? ' · Synced' : ''}`,
        onPress: () => {
          const lyrics = lyricsOf(r);
          if (lyrics && begin(track)) void save(db, track, lyrics);
        },
      })),
    });
  } catch (err) {
    console.warn('[melodify] searching LRCLIB failed:', err);
    set(track.id, OFFLINE);
  }
}

/**
 * Looking up lyrics online for a song that has none, and saving them as a `.lrc` beside it:
 * by the song's tags, or by words the user types when the tags find nothing.
 */
export function useLyricsSearch(track: Track): { state: LyricsSearchState; search: () => void; searchWords: () => void } {
  const db = useSQLiteContext();
  const state = useSyncExternalStore(subscribe, () => searches.get(track.id) ?? IDLE, () => IDLE);
  const byTags = useCallback(() => void search(db, track), [db, track]);
  const byWords = useCallback(() => void searchWords(db, track), [db, track]);
  return { state, search: byTags, searchWords: byWords };
}
