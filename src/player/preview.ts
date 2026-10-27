import { useSyncExternalStore } from 'react';
import type { Track } from '@/db/types';

/**
 * What a preview is: the song being sampled, when it started and how long it runs. The queue
 * store drives the audio; this only holds what the card on screen needs, so anything can watch a
 * preview without subscribing to the queue's four-times-a-second position.
 */

export interface PreviewState {
  track: Track;
  startedAt: number;
  lengthMs: number;
}

/** How long a preview plays before the queue comes back, as Musicolet's does. */
export const PREVIEW_MS = 15_000;

let state: PreviewState | null = null;
const subscribers = new Set<() => void>();

export function setPreview(next: PreviewState | null): void {
  state = next;
  subscribers.forEach((fn) => fn());
}

export function previewState(): PreviewState | null {
  return state;
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function usePreview(): PreviewState | null {
  return useSyncExternalStore(subscribe, previewState, previewState);
}
