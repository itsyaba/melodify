import { usePrefs } from '@/prefs';
import { artSize, spacing } from '@/theme';

/** Row sizing for the list density preference. Compact fits about a third more songs a screen. */
export function useDensity() {
  const { density } = usePrefs();
  return density === 'compact'
    ? { art: 36, paddingVertical: 4, minHeight: 44 }
    : { art: artSize.row, paddingVertical: spacing.sm, minHeight: 56 };
}
