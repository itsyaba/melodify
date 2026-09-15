import type { Track } from '@/db/types';
import { queue } from './queue-store';

/** Tapping a row in any list: play it and queue the rest of that list after it. */
export function playTrackFromList(track: Track, list: Track[]): void {
  const index = Math.max(0, list.findIndex((t) => t.id === track.id));
  void queue.replace(list, index);
}
