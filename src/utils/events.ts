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

export const libraryEvents = new Emitter<{ changed: void; scanProgress: ScanProgress; importProgress: ImportProgress }>();

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
  /** How many rows the tagging phase reads, once it has started; `tagged` counts up to it. */
  toTag?: number;
  /** Of those, how many the native reader could not parse; they keep their filename guesses. */
  tagFailed: number;
  /** The first of those failures, path and reason, so an unreadable library says why. */
  tagError?: string;
  message?: string;
}

/** Songs copied in from the Files app; counts are songs only, not the covers and lyrics beside them. */
export interface ImportProgress {
  phase: 'finding' | 'copying' | 'done' | 'error';
  /** Where they land, relative to Documents/. */
  folder: string;
  /** Songs to copy: picked, or found in the picked folder and not imported before. */
  total: number;
  copied: number;
  /** Already in Melodify's folder from an earlier import, so not copied again. */
  skipped: number;
  failed: number;
  /** In iCloud Drive but not downloaded to the phone, so they cannot be read. */
  notDownloaded: number;
  /** Picked files that are not a format Melodify plays. */
  unsupported: number;
  /** The song being copied. */
  current?: string;
  stopped?: boolean;
  /** The first failure, or why the import could not start. */
  message?: string;
}
