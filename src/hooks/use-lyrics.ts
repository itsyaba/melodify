import { useEffect, useRef, useState } from 'react';
import type { Track } from '@/db/types';
import { loadLyrics, type LoadedLyrics } from '@/lyrics/load';

/**
 * The song's lyrics: undefined while they are read, null when it has none. Read again only for
 * another song or another lyrics file: hearting the song replaces its row, and reloading then would
 * blank the lyrics for a moment and jolt everything under them.
 */
export function useLyrics(track: Track): LoadedLyrics | null | undefined {
  const [lyrics, setLyrics] = useState<LoadedLyrics | null | undefined>(undefined);
  const latest = useRef(track);
  latest.current = track;
  useEffect(() => {
    let cancelled = false;
    setLyrics(undefined);
    void loadLyrics(latest.current).then((l) => {
      if (!cancelled) setLyrics(l);
    });
    return () => {
      cancelled = true;
    };
  }, [track.id, track.lyrics_path]);
  return lyrics;
}
