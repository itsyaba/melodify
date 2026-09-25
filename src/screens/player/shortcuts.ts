import type { SFSymbol } from 'expo-symbols';
import type { PlayerShortcut } from '@/prefs';

/**
 * The player's quick-access buttons, Musicolet's "Quick access" shortcuts. Which ones show, and
 * in what order, is a preference; the ones left out stay reachable from the player's menu.
 */
export const SHORTCUTS: Record<PlayerShortcut, { label: string; icon: SFSymbol; activeIcon?: SFSymbol }> = {
  lyrics: { label: 'Lyrics', icon: 'quote.bubble', activeIcon: 'quote.bubble.fill' },
  sleep: { label: 'Sleep timer', icon: 'moon.zzz', activeIcon: 'moon.zzz.fill' },
  abRepeat: { label: 'A–B repeat', icon: 'arrow.triangle.capsulepath' },
  bookmark: { label: 'Bookmark', icon: 'bookmark', activeIcon: 'bookmark.fill' },
  sound: { label: 'Speed and sound', icon: 'slider.horizontal.3' },
  queue: { label: 'Queue', icon: 'list.bullet' },
  details: { label: 'Song details', icon: 'info.circle' },
  playlist: { label: 'Add to playlist', icon: 'text.badge.plus' },
  share: { label: 'Share file', icon: 'square.and.arrow.up' },
};
