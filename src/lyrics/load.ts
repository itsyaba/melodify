import { musicFile, musicUri } from '@/storage';
import type { Track } from '@/db/types';
import { parseLyrics, type Lyrics } from './lrc';

export interface LoadedLyrics extends Lyrics {
  source: 'lrc' | 'embedded';
}

type NativeLyrics = { readLyrics(uri: string): Promise<string | null> };

let nativeModule: NativeLyrics | null | undefined;

/** Lazily and guarded, like tag reading: builds before module 0.5.0 have no `readLyrics`. */
function native(): NativeLyrics | null {
  if (nativeModule === undefined) {
    try {
      const mod = require('../../modules/melodify-audio/src/MelodifyAudioModule').default as Partial<NativeLyrics> | undefined;
      nativeModule = typeof mod?.readLyrics === 'function' ? (mod as NativeLyrics) : null;
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}

/** Per track, for the session. Lyrics files rarely change while the app is open. */
const cache = new Map<number, LoadedLyrics | null>();

/** After the lyrics editor saved, so the player reads them again. */
export function forgetLyrics(trackId: number): void {
  cache.delete(trackId);
}

/**
 * A sidecar `.lrc` first, since it is usually the synced one and the one a user put there on
 * purpose; then whatever is embedded in the file.
 */
export async function loadLyrics(track: Track): Promise<LoadedLyrics | null> {
  if (cache.has(track.id)) return cache.get(track.id)!;
  let result: LoadedLyrics | null = null;
  if (track.lyrics_path) {
    try {
      const text = await musicFile(track.lyrics_path).text();
      const parsed = parseLyrics(text);
      if (parsed.lines.length) result = { ...parsed, source: 'lrc' };
    } catch (err) {
      console.warn('[melodify] reading lyrics failed:', track.lyrics_path, err);
    }
  }
  const mod = native();
  if (!result && mod) {
    try {
      const text = await mod.readLyrics(musicUri(track.path));
      const parsed = text ? parseLyrics(text) : null;
      if (parsed?.lines.length) result = { ...parsed, source: 'embedded' };
    } catch (err) {
      console.warn('[melodify] reading embedded lyrics failed:', track.path, err);
    }
  }
  cache.set(track.id, result);
  return result;
}

/**
 * The lyrics as text, for the editor: the `.lrc` file's if there is one, else the embedded ones,
 * with where they came from. Not cached; the editor reads fresh.
 */
export async function loadRawLyrics(track: Track): Promise<{ text: string; source: LoadedLyrics['source'] } | null> {
  if (track.lyrics_path) {
    try {
      const text = await musicFile(track.lyrics_path).text();
      if (text.trim()) return { text: text.replace(/\r\n?/g, '\n').trim(), source: 'lrc' };
    } catch (err) {
      console.warn('[melodify] reading lyrics failed:', track.lyrics_path, err);
    }
  }
  const text = await native()?.readLyrics(musicUri(track.path)).catch(() => null);
  return text?.trim() ? { text: text.replace(/\r\n?/g, '\n').trim(), source: 'embedded' } : null;
}

export function canReadEmbeddedLyrics(): boolean {
  return native() !== null;
}
