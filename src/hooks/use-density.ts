import { usePrefs } from '@/prefs';
import { artSize, spacing } from '@/theme';

/**
 * Row sizing for the list density preference. Compact fits about a third more songs a screen.
 * `cover` is the art on album, artist and playlist rows, a size up from a song's, as in Spotify.
 */
export function useDensity() {
  const { density } = usePrefs();
  return density === 'compact'
    ? { art: 36, cover: 44, paddingVertical: 4, minHeight: 44 }
    : { art: artSize.row, cover: artSize.cover, paddingVertical: spacing.sm, minHeight: 56 };
}
