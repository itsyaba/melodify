import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Multi-select over a list, by index. Indexes rather than ids because a queue or playlist can
 * hold the same track twice. Resets whenever `resetKey` changes identity, which callers pass as
 * the list itself: after a rescan or an edit, old indexes would point at other rows.
 */
export function useSelection(resetKey: unknown) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    // Bail out when already clear, so a caller passing a fresh empty array each render does
    // not loop.
    setActive(false);
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, [resetKey]);

  const start = useCallback((index?: number) => {
    setActive(true);
    setSelected(new Set(index === undefined ? [] : [index]));
  }, []);
  const end = useCallback(() => {
    setActive(false);
    setSelected(new Set());
  }, []);
  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);
  const setAll = useCallback((count: number, on: boolean) => {
    setSelected(new Set(on ? Array.from({ length: count }, (_, i) => i) : []));
  }, []);

  return useMemo(
    () => ({
      active,
      selected,
      /** Selected indexes, ascending. */
      indexes: () => [...selected].sort((a, b) => a - b),
      start,
      end,
      toggle,
      setAll,
    }),
    [active, selected, start, end, toggle, setAll],
  );
}

export type Selection = ReturnType<typeof useSelection>;
