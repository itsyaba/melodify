import { useCallback, useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { toast } from '@/components/toast';
import type { Track } from '@/db/types';
import { findLyrics } from '@/lyrics/online';
import { lrcPathFor, saveLyrics } from '@/tags';

export type LyricsSearchState = { status: 'idle' } | { status: 'searching' } | { status: 'failed'; message: string };

const IDLE: LyricsSearchState = { status: 'idle' };

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

async function search(db: SQLiteDatabase, track: Track): Promise<void> {
  if (searches.get(track.id)?.status === 'searching') return;
  const path = lrcPathFor(track);
  // Not yet rescanned, or empty, but the user's own: never replaced with something from the internet.
  if (new File(Paths.document, ...path.split('/')).exists) {
    set(track.id, { status: 'failed', message: 'There is already a .lrc file beside this song. Rescan, or fix it in Edit lyrics.' });
    return;
  }
  set(track.id, { status: 'searching' });
  try {
    const found = await findLyrics(track);
    if (found === null) return set(track.id, { status: 'failed', message: 'LRCLIB has no lyrics for this song.' });
    if (found === 'instrumental') return set(track.id, { status: 'failed', message: 'LRCLIB lists this song as instrumental.' });
    const saved = await saveLyrics(db, track, found.text, 'lrc');
    if (saved.failed) return set(track.id, { status: 'failed', message: saved.error ?? 'Saving the lyrics failed.' });
    set(track.id, IDLE);
    toast.show(found.synced ? 'Synced lyrics saved from LRCLIB' : 'Lyrics saved from LRCLIB', {
      label: 'Undo',
      onPress: () => void saveLyrics(db, track, '', 'lrc'),
    });
  } catch (err) {
    console.warn('[melodify] searching LRCLIB failed:', err);
    set(track.id, { status: 'failed', message: 'Could not reach LRCLIB. Check the connection and try again.' });
  }
}

/** Looking up lyrics online for a song that has none, and saving them as a `.lrc` beside it. */
export function useLyricsSearch(track: Track): [LyricsSearchState, () => void] {
  const db = useSQLiteContext();
  const state = useSyncExternalStore(subscribe, () => searches.get(track.id) ?? IDLE, () => IDLE);
  const start = useCallback(() => void search(db, track), [db, track]);
  return [state, start];
}
