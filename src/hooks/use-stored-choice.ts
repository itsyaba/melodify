import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/settings';

/** Loaded once per launch and shared, so every list after the first opens already sorted. */
let cache: Record<string, string> | null = null;

/** Drops the shared copy, so the next list reads the stored choices again (after a restore). */
export function forgetStoredChoices(): void {
  cache = null;
}

/**
 * A small UI choice remembered across launches under `key`: a list's sort order, the library's
 * last view. A stored value that is no longer one of `allowed` falls back rather than sticking.
 */
export function useStoredChoice<T extends string>(key: string, fallback: T, allowed: readonly { key: T }[]): [T, (next: T) => void] {
  const db = useSQLiteContext();
  const valid = (v: string | undefined): v is T => allowed.some((o) => o.key === v);
  const [value, setValue] = useState<T>(() => {
    const cached = cache?.[key];
    return valid(cached) ? cached : fallback;
  });

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    void getSetting(db, 'choices').then((stored) => {
      cache = stored ?? {};
      const saved = cache[key];
      if (!cancelled && valid(saved)) setValue(saved);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);

  const update = (next: T) => {
    setValue(next);
    cache = { ...(cache ?? {}), [key]: next };
    void setSetting(db, 'choices', cache).catch((err: unknown) => console.warn('[melodify] saving a choice failed:', err));
  };
  return [value, update];
}
