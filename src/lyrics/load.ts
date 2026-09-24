import { File, Paths } from 'expo-file-system';
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

/**
 * A sidecar `.lrc` first, since it is usually the synced one and the one a user put there on
 * purpose; then whatever is embedded in the file.
 */
export async function loadLyrics(track: Track): Promise<LoadedLyrics | null> {
  if (cache.has(track.id)) return cache.get(track.id)!;
  let result: LoadedLyrics | null = null;
  if (track.lyrics_path) {
    try {
      const text = await new File(Paths.join(Paths.document, track.lyrics_path)).text();
      const parsed = parseLyrics(text);
      if (parsed.lines.length) result = { ...parsed, source: 'lrc' };
    } catch (err) {
      console.warn('[melodify] reading lyrics failed:', track.lyrics_path, err);
    }
  }
  const mod = native();
  if (!result && mod) {
    try {
      const text = await mod.readLyrics(Paths.join(Paths.document, track.path));
      const parsed = text ? parseLyrics(text) : null;
      if (parsed?.lines.length) result = { ...parsed, source: 'embedded' };
    } catch (err) {
      console.warn('[melodify] reading embedded lyrics failed:', track.path, err);
    }
  }
  cache.set(track.id, result);
  return result;
}

export function canReadEmbeddedLyrics(): boolean {
  return native() !== null;
}
