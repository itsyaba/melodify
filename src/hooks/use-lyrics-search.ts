import { useCallback, useSyncExternalStore } from 'react';
import { musicFile } from '@/storage';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { promptText, showMenu } from '@/components/menus';
import { toast } from '@/components/toast';
import type { Track } from '@/db/types';
import { loadRawLyrics } from '@/lyrics/load';
import { findChoices, findLyrics, lyricsOf, searchLyrics, simplifyTitle, type LrclibRecord } from '@/lyrics/online';
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

type Existing = Awaited<ReturnType<typeof loadRawLyrics>>;

/** One search for one song. */
interface Job {
  db: SQLiteDatabase;
  track: Track;
  /** Started from the button under "No lyrics", which shows how it went; otherwise a toast says. */
  inline: boolean;
  /** The lyrics the song has now, which a pick replaces and Undo puts back. Null for a song with none. */
  existing: Existing;
}

function fail(job: Job, message: string, next: 'retry' | 'words' | null) {
  if (job.inline) return set(job.track.id, { status: 'failed', message, next });
  set(job.track.id, IDLE);
  const action =
    next === 'words'
      ? { label: 'Search for…', onPress: () => void searchWords(job) }
      : next === 'retry'
        ? { label: 'Try again', onPress: () => void searchTags(job) }
        : undefined;
  toast.show(message, action);
}

const offline = (job: Job) => fail(job, 'Could not reach LRCLIB. Check the connection and try again.', 'retry');

const busy = (track: Track) => searches.get(track.id)?.status === 'searching';

/**
 * Sets up a search unless one is running: reads what lyrics the song has, for replacing, and
 * leaves the state as it was (a miss's message stays under the prompt for other words).
 */
async function begin(db: SQLiteDatabase, track: Track, inline: boolean): Promise<Job | null> {
  if (busy(track)) return null;
  const before = searches.get(track.id) ?? IDLE;
  set(track.id, { status: 'searching' });
  const job: Job = { db, track, inline, existing: await loadRawLyrics(track) };
  set(track.id, before);
  // A `.lrc` the lyrics are not from (unscanned, or empty) is the user's own: never replaced with
  // something from the internet. The one they are from can be, since Undo writes it back.
  if (job.existing?.source !== 'lrc' && musicFile(lrcPathFor(track)).exists) {
    fail(job, 'There is already a .lrc file beside this song. Rescan, or fix it in Edit lyrics.', null);
    return null;
  }
  return job;
}

function searching(job: Job) {
  set(job.track.id, { status: 'searching' });
  if (!job.inline) toast.show('Searching LRCLIB…');
}

/** Saves as the song's `.lrc`, where it takes over from embedded lyrics, which stay in the tags. */
async function save(job: Job, lyrics: { text: string; synced: boolean }): Promise<void> {
  const { db, track, existing } = job;
  const saved = await saveLyrics(db, track, lyrics.text, 'lrc');
  if (saved.failed) return fail(job, saved.error ?? 'Saving the lyrics failed.', 'retry');
  set(track.id, IDLE);
  const what = lyrics.synced ? 'synced lyrics' : 'lyrics';
  toast.show(existing ? `Replaced with ${what} from LRCLIB` : `Saved ${what} from LRCLIB`, {
    label: 'Undo',
    // The `.lrc` written back as it was, or removed, so the embedded ones or none show again.
    onPress: () => void saveLyrics(db, track, existing?.source === 'lrc' ? existing.text : '', 'lrc'),
  });
}

/** LRCLIB's matches in a sheet; picking one saves it. */
function choose(job: Job, records: LrclibRecord[]) {
  const { track, existing } = job;
  if (!job.inline) toast.hide();
  const from = existing?.source === 'lrc' ? 'the .lrc file' : 'the song’s tags, which stay as they are';
  const length = track.duration_ms === null ? '' : ` This song is ${formatDuration(track.duration_ms)}.`;
  showMenu({
    title: existing ? 'Replace the lyrics with' : 'Choose the lyrics',
    message: `${existing ? `The ones shown now are from ${from}. Undo puts them back.` : ''}${length}`.trim() || undefined,
    items: [
      ...records.slice(0, CHOICES).map((r) => ({
        label: `${r.trackName} · ${r.artistName} · ${formatDuration(r.duration === null ? null : r.duration * 1000)}${r.syncedLyrics?.trim() ? ' · Synced' : ''}`,
        onPress: () => {
          const lyrics = lyricsOf(r);
          if (!lyrics) return;
          set(track.id, { status: 'searching' });
          void save(job, lyrics);
        },
      })),
      { label: 'Other words…', onPress: () => void searchWords(job) },
    ],
  });
}

/**
 * By the song's tags. A song with no lyrics gets the best match saved at once; one with lyrics
 * gets the matches to choose from, since picking one replaces what it has.
 */
async function searchTags(job: Job): Promise<void> {
  const { track } = job;
  if (busy(track)) return;
  searching(job);
  try {
    if (job.existing) {
      const records = await findChoices(track);
      if (records.length) {
        set(track.id, IDLE);
        return choose(job, records);
      }
    } else {
      const found = await findLyrics(track);
      if (found === 'instrumental') return fail(job, 'LRCLIB lists this song as instrumental.', 'words');
      if (found) return await save(job, found);
    }
    // Naming what was looked for shows at once when the tags are the problem.
    fail(job, `Nothing on LRCLIB for “${track.title}”${track.artist ? ` by ${track.artist}` : ''}.`, 'words');
  } catch (err) {
    console.warn('[melodify] searching LRCLIB failed:', err);
    offline(job);
  }
}

/** By words the user types; the matches to choose from. */
async function searchWords(job: Job): Promise<void> {
  const { track } = job;
  const before = searches.get(track.id) ?? IDLE;
  const query = await promptText('Search LRCLIB', {
    message: 'Words from the title and the artist.',
    defaultValue: `${track.artist ?? ''} ${simplifyTitle(track.title)}`.trim(),
    ok: 'Search',
  });
  if (!query || busy(track)) return;
  searching(job);
  try {
    const records = await searchLyrics(query, track.duration_ms);
    if (records.length === 0) return fail(job, `Nothing on LRCLIB for “${query}”.`, 'words');
    // The sheet has no cancel callback, so the message from before stays under it.
    set(track.id, before);
    choose(job, records);
  } catch (err) {
    console.warn('[melodify] searching LRCLIB failed:', err);
    offline(job);
  }
}

/** "Lyrics from LRCLIB…" in a song's menu: a search by its tags, told in toasts. */
export async function lyricsFromLrclib(db: SQLiteDatabase, track: Track): Promise<void> {
  const job = await begin(db, track, false);
  if (job) await searchTags(job);
}

/**
 * Looking up lyrics on LRCLIB for the song, and saving them as a `.lrc` beside it: by its tags,
 * or by words the user types when the tags find nothing. `inline` for the button under "No
 * lyrics", which shows how it went; the one under lyrics already shown leaves that to toasts.
 */
export function useLyricsSearch(track: Track, inline: boolean): { state: LyricsSearchState; search: () => void; searchWords: () => void } {
  const db = useSQLiteContext();
  const state = useSyncExternalStore(subscribe, () => searches.get(track.id) ?? IDLE, () => IDLE);
  const byTags = useCallback(() => {
    void begin(db, track, inline).then((job) => job && searchTags(job));
  }, [db, track, inline]);
  const byWords = useCallback(() => {
    void begin(db, track, inline).then((job) => job && searchWords(job));
  }, [db, track, inline]);
  return { state, search: byTags, searchWords: byWords };
}
