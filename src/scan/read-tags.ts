import { Paths } from 'expo-file-system';
import { appRoot, ART_CACHE_DIR, musicUri } from '@/storage';
import type { NativeTrackTags } from '../../modules/melodify-audio/src/MelodifyAudio.types';

/** How many files one bridge call covers. Small enough that progress keeps moving. */
export const TAG_BATCH = 50;

type NativeModule = { readTags(uris: string[], dir: string): Promise<NativeTrackTags[]>; tagVersion?: number };

let cached: NativeModule | null | undefined;

/**
 * Resolved lazily and guarded, like the engine: a build made before the module existed has
 * nothing to link against, and one made before 0.4.0 has the module but no `readTags`. Either
 * way the scan should degrade to filename guesses rather than throw.
 */
function native(): NativeModule | null {
  if (cached === undefined) {
    try {
      const mod = require('../../modules/melodify-audio/src/MelodifyAudioModule').default as
        | Partial<NativeModule>
        | undefined;
      cached = typeof mod?.readTags === 'function' ? (mod as NativeModule) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function canReadTags(): boolean {
  return native() !== null;
}

/**
 * What the linked reader knows how to read: 1 up to module 0.6.0, 2 from 0.7.0, which added
 * ReplayGain. Rows last read by an older reader are read again, once, by a newer one.
 */
export function tagReaderVersion(): number {
  const v = native()?.tagVersion;
  return typeof v === 'number' && v > 0 ? v : 1;
}

/** Reads tags for a batch of paths relative to the music folder. Keyed by path on the way back. */
export async function readTags(relativePaths: string[]): Promise<Map<string, NativeTrackTags>> {
  const mod = native();
  const byPath = new Map<string, NativeTrackTags>();
  if (!mod || relativePaths.length === 0) return byPath;

  const uris = relativePaths.map((p) => musicUri(p));
  const results = await mod.readTags(uris, Paths.join(appRoot, ART_CACHE_DIR));
  // Match on the echoed uri rather than array position, so a reordered or short result is safe.
  const byUri = new Map(results.map((r) => [r.uri, r]));
  relativePaths.forEach((relative, i) => {
    const found = byUri.get(uris[i]);
    if (found) byPath.set(relative, found);
  });
  return byPath;
}
