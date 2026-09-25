import { File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { serial } from '@/db/serial';
import type { Track } from '@/db/types';
import { forgetLyrics } from '@/lyrics/load';
import { patchTracks, withTracksReleased } from '@/player/queue-store';
import { retagTracks } from '@/scan/scanner';
import { libraryEvents } from '@/utils/events';
import { propertiesFor, type TagEdit } from './fields';

export type { TagEdit } from './fields';

type TagWriter = {
  writeTags(uri: string, fields: Record<string, string>): Promise<void>;
  setArtwork(uri: string, imageUri: string | null): Promise<void>;
  readAllTags(uri: string): Promise<Record<string, string[] | number>>;
};

let cached: TagWriter | null | undefined;

/** Lazily and guarded, like tag reading: builds before module 0.8.0 cannot write tags. */
function native(): TagWriter | null {
  if (cached === undefined) {
    try {
      const mod = require('../../modules/melodify-audio/src/MelodifyAudioModule').default as Partial<TagWriter> | undefined;
      cached = typeof mod?.writeTags === 'function' && typeof mod.setArtwork === 'function' ? (mod as TagWriter) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function canEditTags(): boolean {
  return native() !== null;
}

function uriOf(track: Track): string {
  return Paths.join(Paths.document, track.path);
}

export interface EditResult {
  /** Songs whose files could not be written; their rows are left as they were. */
  failed: number;
  /** The first failure's reason, fit to show. */
  error?: string;
}

/**
 * Runs one write per song with the player's hold on those files let go, then reads the songs
 * back into the library so every list, the queue and the lock screen show the new tags.
 */
async function writeEach(db: SQLiteDatabase, tracks: Track[], write: (mod: TagWriter, track: Track) => Promise<void>): Promise<EditResult> {
  const mod = native();
  if (!mod) return { failed: tracks.length, error: 'This build cannot write tags. Install melodify-audio 0.8.0 or newer.' };
  const result: EditResult = { failed: 0 };
  const done: Track[] = [];
  await withTracksReleased(
    tracks.map((t) => t.id),
    async () => {
      for (const track of tracks) {
        try {
          await write(mod, track);
          done.push(track);
        } catch (err) {
          result.failed += 1;
          result.error ??= err instanceof Error ? err.message : String(err);
        }
      }
      await refresh(db, done);
    },
  );
  return result;
}

/** Reads the written files back into their rows and the queue's copies of them. */
async function refresh(db: SQLiteDatabase, tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  await retagTracks(db, tracks);
  for (const t of tracks) {
    const row = await db.getFirstAsync<Track>('SELECT * FROM tracks WHERE id = ?', t.id);
    if (row) patchTracks([row.id], row);
  }
  libraryEvents.emit('changed', undefined);
}

/** Writes the fields that were set; an empty string clears a field. */
export async function editTags(db: SQLiteDatabase, tracks: Track[], edit: TagEdit): Promise<EditResult> {
  const fields = propertiesFor(edit);
  if (Object.keys(fields).length === 0) return { failed: 0 };
  return writeEach(db, tracks, (mod, track) => mod.writeTags(uriOf(track), fields));
}

/** Embeds the image file at `imageUri` as every song's artwork, or with null removes it. */
export async function setArtwork(db: SQLiteDatabase, tracks: Track[], imageUri: string | null): Promise<EditResult> {
  return writeEach(db, tracks, (mod, track) => mod.setArtwork(uriOf(track), imageUri));
}

/** Every tag in the file, for the song details; null on a build that cannot read them. */
export async function readAllTags(track: Track): Promise<Record<string, string[] | number> | null> {
  const mod = native();
  if (!mod) return null;
  return mod.readAllTags(uriOf(track));
}

/** Where lyrics are saved: in the song's own tags, or in a `.lrc` file beside it. */
export type LyricsTarget = 'tag' | 'lrc';

/** The `.lrc` path a song's lyrics file has, or would have: the same name beside it. */
export function lrcPathFor(track: Pick<Track, 'path' | 'lyrics_path'>): string {
  return track.lyrics_path ?? `${track.path.replace(/\.[^./]+$/, '')}.lrc`;
}

/**
 * Saves lyrics. Empty text removes them: from the tags, or by deleting the `.lrc` file. A `.lrc`
 * file wins over embedded lyrics when both exist, so saving to the tags only shows once there is
 * no `.lrc` beside the song.
 */
export async function saveLyrics(db: SQLiteDatabase, track: Track, text: string, target: LyricsTarget): Promise<EditResult> {
  const body = text.replace(/\r\n?/g, '\n').trim();
  if (target === 'tag') {
    const result = await writeEach(db, [track], (mod) => mod.writeTags(uriOf(track), { LYRICS: body }));
    forgetLyrics(track.id);
    return result;
  }
  const relative = lrcPathFor(track);
  try {
    const file = new File(Paths.document, ...relative.split('/'));
    if (body) {
      if (!file.exists) file.create({ intermediates: true });
      file.write(`${body}\n`);
    } else if (file.exists) {
      file.delete();
    }
  } catch (err) {
    return { failed: 1, error: err instanceof Error ? err.message : String(err) };
  }
  const lyricsPath = body ? relative : null;
  await serial(() => db.runAsync('UPDATE tracks SET lyrics_path = ? WHERE id = ?', lyricsPath, track.id));
  patchTracks([track.id], { lyrics_path: lyricsPath });
  forgetLyrics(track.id);
  libraryEvents.emit('changed', undefined);
  return { failed: 0 };
}
