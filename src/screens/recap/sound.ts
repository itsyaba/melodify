import { queue, queueSnapshot } from '@/player/queue-store';
import type { Track } from '@/db/types';

/**
 * The recap's soundtrack: the songs it is about, playing while the cards go by, as Spotify's
 * Wrapped plays what it is showing you.
 *
 * It takes the queue over rather than running a second player — there is one audio engine — and
 * hands it back on the way out through the queue's own undo, which restores the songs, the place
 * in them and the position. Playback that was paused before is paused again.
 */

let taken = false;
let wasPlaying = false;
/** Whether the queue held anything before: only then is there something to undo back to. */
let hadQueue = false;

export function recapSoundPlaying(): boolean {
  return taken && queueSnapshot().state === 'playing';
}

/** Starts the recap's songs. Does nothing without any, or if it has already started. */
export async function startRecapSound(tracks: Track[]): Promise<void> {
  if (taken || tracks.length === 0) return;
  const snapshot = queueSnapshot();
  wasPlaying = snapshot.state === 'playing';
  hadQueue = (snapshot.queues.find((q) => q.id === snapshot.activeId)?.tracks.length ?? 0) > 0;
  taken = true;
  await queue.replace(tracks, 0);
}

/** Silences the recap without giving the queue back: the mute button. */
export async function toggleRecapSound(): Promise<void> {
  if (!taken) return;
  await queue.toggle();
}

/**
 * Gives the queue back as it was. An empty queue has nothing to undo to, so the songs the recap
 * played simply stay in it, paused.
 */
export async function stopRecapSound(): Promise<void> {
  if (!taken) return;
  taken = false;
  if (hadQueue) await queue.undo();
  if (!wasPlaying && queueSnapshot().state === 'playing') await queue.toggle();
}
