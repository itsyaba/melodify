/**
 * A–B repeat: one stretch of a song, played over and over. The pure parts, apart from the store
 * in `ab-repeat.ts`, so they can be tested without an engine.
 */
export interface AbLoop {
  trackId: number;
  /** Where the stretch starts. */
  aMs: number;
  /** Where it ends; null while only A is set. */
  bMs: number | null;
}

/** The shortest stretch there can be, so a double tap cannot make a loop that only stutters. */
export const MIN_LOOP_MS = 1000;

/**
 * The latest B can sit. Before the end, the engine arms the next song and, with crossfade on,
 * starts fading it in, so B stays clear of both or the loop would lose to them.
 */
export function latestB(durationMs: number, crossfadeMs: number): number {
  return Math.max(0, durationMs - Math.max(1000, crossfadeMs + 500));
}

/** A at `positionMs`, starting a new loop on `trackId` and dropping any old one. */
export function startLoop(trackId: number, positionMs: number): AbLoop {
  return { trackId, aMs: Math.max(0, Math.round(positionMs)), bMs: null };
}

/**
 * B at `positionMs`, pulled back from the end if needed. Null when that leaves the stretch
 * shorter than `MIN_LOOP_MS`, including a B before A.
 */
export function closeLoop(loop: AbLoop, positionMs: number, durationMs: number, crossfadeMs: number): AbLoop | null {
  const limit = durationMs > 0 ? latestB(durationMs, crossfadeMs) : positionMs;
  const bMs = Math.round(Math.min(positionMs, limit));
  return bMs - loop.aMs >= MIN_LOOP_MS ? { ...loop, bMs } : null;
}

/** Where to seek to, or null to let the song carry on. */
export function loopSeek(loop: AbLoop | null, trackId: number | undefined, positionMs: number): number | null {
  if (!loop || loop.bMs === null || loop.trackId !== trackId) return null;
  return positionMs >= loop.bMs ? loop.aMs : null;
}
