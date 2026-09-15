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

export interface ScanProgress {
  phase: 'walking' | 'indexing' | 'done' | 'error';
  seen: number;
  added: number;
  updated: number;
  removed: number;
  message?: string;
}
