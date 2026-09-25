type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter; used to tell screens the library changed. */
export class Emitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    (this.listeners[event] ??= new Set()).add(fn);
    return () => this.listeners[event]?.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((fn) => fn(payload));
  }
}

export const libraryEvents = new Emitter<{ changed: void; scanProgress: ScanProgress }>();

/** `focus`: put the cursor in the Search tab's field (its tab was tapped, or Home's field was). */
export const searchEvents = new Emitter<{ focus: void }>();

export interface ScanProgress {
  phase: 'walking' | 'indexing' | 'tagging' | 'done' | 'error';
  seen: number;
  added: number;
  updated: number;
  removed: number;
  /** Rows whose real tags have been read this run. */
  tagged: number;
  /** Of those, how many the native reader could not parse; they keep their filename guesses. */
  tagFailed: number;
  /** The first of those failures, path and reason, so an unreadable library says why. */
  tagError?: string;
  message?: string;
}
