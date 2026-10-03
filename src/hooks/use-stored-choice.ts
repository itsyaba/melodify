import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/settings';
import { Emitter } from '@/utils/events';

/** Loaded once per launch and shared, so every list after the first opens already sorted. */
let cache: Record<string, string> | null = null;
const invalidation = new Emitter<{ changed: void }>();

/** Reloads stored choices after a restore, including lists still mounted in another tab. */
export function forgetStoredChoices(): void {
  cache = null;
  invalidation.emit('changed', undefined);
}

/**
 * A small UI choice remembered across launches under `key`: a list's sort order, the library's
 * last view. A stored value that is no longer one of `allowed` falls back rather than sticking.
 */
export function useStoredChoice<T extends string>(key: string, fallback: T, allowed: readonly { key: T }[]): [T, (next: T) => void] {
  const db = useSQLiteContext();
  const [revision, setRevision] = useState(0);
  useEffect(() => invalidation.on('changed', () => setRevision((r) => r + 1)), []);
  const valid = (v: string | undefined): v is T => allowed.some((o) => o.key === v);
  const [value, setValue] = useState<T>(() => {
    const cached = cache?.[key];
    return valid(cached) ? cached : fallback;
  });

  useEffect(() => {
    let cancelled = false;
    void (cache ? Promise.resolve(cache) : getSetting(db, 'choices')).then((stored) => {
      if (cancelled) return;
      // A choice made while this was read wins over the stored one, and keeps the others stored.
      cache = { ...(stored ?? {}), ...(cache ?? {}) };
      const saved = cache[key];
      setValue(valid(saved) ? saved : fallback);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key, revision]);

  const update = (next: T) => {
    setValue(next);
    cache = { ...(cache ?? {}), [key]: next };
    void setSetting(db, 'choices', cache).catch((err: unknown) => console.warn('[melodify] saving a choice failed:', err));
  };
  return [value, update];
}
