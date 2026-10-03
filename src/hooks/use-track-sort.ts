import { useMemo } from 'react';
import type { SortOption } from '@/components/list-toolbar';
import type { TrackSort } from '@/db/tracks';
import type { Track } from '@/db/types';
import { SONG_SORTS, sortOrder, type ListSort } from '@/utils/sort-tracks';
import { useStoredChoice } from './use-stored-choice';

export interface TrackSortResult {
  /** The songs in the chosen order. */
  tracks: Track[];
  /** For each of `tracks`, its position in the list as it came. */
  order: number[];
  /** For `ListToolbar`. */
  sort: { options: readonly SortOption<ListSort>[]; value: ListSort; onChange: (value: ListSort) => void };
}

/**
 * A remembered sort for one kind of song list. `natural` names the list's own order (a
 * playlist's, an album's track numbers), offered first and used until another is picked; `same`
 * is the song sort that would repeat it, left out. A list with no order of its own opens by title.
 */
export function useTrackSort(
  key: string,
  tracks: Track[],
  natural?: { label: string; same?: TrackSort },
): TrackSortResult {
  const options = useMemo<readonly SortOption<ListSort>[]>(
    () => [
      ...(natural ? [{ key: 'default' as const, label: natural.label }] : []),
      ...SONG_SORTS.filter((o) => o.key !== natural?.same),
    ],
    [natural?.label, natural?.same],
  );
  const [value, onChange] = useStoredChoice<ListSort>(`sort.${key}`, natural ? 'default' : 'title', options);
  const order = useMemo(() => sortOrder(tracks, value), [tracks, value]);
  const sorted = useMemo(() => (value === 'default' ? tracks : order.map((i) => tracks[i])), [tracks, order, value]);
  return { tracks: sorted, order, sort: { options, value, onChange } };
}
