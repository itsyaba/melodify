import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { libraryEvents } from '@/utils/events';

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Runs a DB query, re-runs it whenever the library changes (after a scan, tag edit, etc.).
 * `deps` should list every value the query closes over.
 */
export function useLibraryQuery<T>(query: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const db = useSQLiteContext();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => libraryEvents.on('changed', refresh), [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    query(db)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, tick, ...deps]);

  return { data, loading, error, refresh };
}
