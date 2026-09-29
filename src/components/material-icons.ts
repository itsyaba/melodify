/**
 * The Material icon Android draws for each SF Symbol the app names. The app is written with SF
 * Symbol names (see `SymbolView` in ./symbol); on Android each goes through this table to the
 * classic Material Icons font, which, unlike Material Symbols, has filled and outlined shapes
 * apart: a favorite's heart is filled, a plain one is not.
 *
 * Names are the font's own (@expo/vector-icons MaterialIcons, hyphenated). An SF Symbol missing
 * here draws as a note, and warns once in development.
 */
const TABLE: Record<string, string> = {
  // Playback.
  'play': 'play-arrow',
  'play.fill': 'play-arrow',
  'pause': 'pause',
  'pause.fill': 'pause',
  'play.circle': 'play-circle-outline',
  'play.circle.fill': 'play-circle-filled',
  'forward.fill': 'skip-next',
  'forward.end.fill': 'skip-next',
  'backward.fill': 'skip-previous',
  'backward.end.fill': 'skip-previous',
  'gobackward': 'replay',
  'goforward': 'forward-10',
  'shuffle': 'shuffle',
  'repeat': 'repeat',
  'repeat.1': 'repeat-one',
  'arrow.triangle.capsulepath': 'loop',
  'arrow.triangle.2.circlepath': 'sync',
  'speedometer': 'speed',
  'slider.horizontal.3': 'tune',
  'slider.vertical.3': 'equalizer',
  'waveform': 'graphic-eq',
  'speaker.fill': 'volume-down',
  'speaker.wave.3.fill': 'volume-up',
  'moon.zzz': 'bedtime',
  'moon.zzz.fill': 'bedtime',
  'sleep': 'bedtime',
  'headphones': 'headphones',
  'headset': 'headset-mic',
  'cable.connector': 'cable',

  // The library.
  'music.note': 'music-note',
  'music.note.list': 'queue-music',
  'list.number': 'format-list-numbered',
  'list.bullet': 'list',
  'list.bullet.rectangle': 'list-alt',
  'opticaldisc': 'album',
  'person': 'person',
  'rectangle.stack': 'library-music',
  'square.stack.fill': 'library-music',
  'square.grid.2x2': 'grid-view',
  'folder': 'folder',
  'folder.fill': 'folder',
  'folder.badge.minus': 'folder-off',
  'questionmark.folder': 'folder-off',
  'externaldrive': 'sd-storage',
  'quote.bubble': 'lyrics',
  'quote.bubble.fill': 'lyrics',
  'tag': 'sell',
  'tag.fill': 'sell',
  'photo.fill': 'image',
  'chart.bar.fill': 'bar-chart',
  'clock.fill': 'schedule',
  'clock.arrow.circlepath': 'history',
  'calendar.badge.plus': 'event',
  'text.badge.plus': 'playlist-add',
  'text.line.first.and.arrowtriangle.forward': 'playlist-play',
  'text.line.last.and.arrowtriangle.forward': 'low-priority',

  // State.
  'heart': 'favorite-border',
  'heart.fill': 'favorite',
  'heart.slash': 'heart-broken',
  'bookmark': 'bookmark-border',
  'bookmark.fill': 'bookmark',
  'eye': 'visibility',
  'eye.slash': 'visibility-off',
  'checkmark': 'check',
  'checkmark.circle': 'check-circle-outline',
  'checkmark.circle.fill': 'check-circle',
  'circle': 'radio-button-unchecked',
  'exclamationmark.triangle.fill': 'warning',
  'lightbulb.fill': 'lightbulb',
  'hand.raised.fill': 'back-hand',
  'info.circle': 'info-outline',
  'info.circle.fill': 'info',
  'paintbrush.fill': 'brush',
  'externaldrive.fill': 'sd-storage',
  'sparkles': 'auto-awesome',
  'wifi.slash': 'wifi-off',

  // Actions and navigation.
  'magnifyingglass': 'search',
  'gearshape.fill': 'settings',
  'house': 'home',
  'house.fill': 'home',
  'ellipsis': 'more-vert',
  'ellipsis.circle': 'more-vert',
  'line.3.horizontal': 'drag-handle',
  'plus': 'add',
  'plus.circle': 'add-circle-outline',
  'minus.circle': 'remove-circle-outline',
  'xmark': 'close',
  'trash': 'delete-outline',
  'trash.fill': 'delete',
  'pencil': 'edit',
  'square.and.arrow.up': 'share',
  'square.and.arrow.down': 'save-alt',
  'arrow.down.to.line': 'file-download',
  'arrow.up.to.line': 'file-upload',
  'arrow.up.arrow.down': 'swap-vert',
  'arrow.clockwise': 'refresh',
  'arrow.right.doc.on.clipboard': 'content-paste-go',
  'chevron.down': 'keyboard-arrow-down',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'globe': 'language',
  'link': 'link',
};

/** Seconds-skip buttons: the font has numbered glyphs for 5, 10 and 30 only. */
const SKIPS: Record<string, Record<number, string>> = {
  gobackward: { 5: 'replay-5', 10: 'replay-10', 30: 'replay-30' },
  goforward: { 5: 'forward-5', 10: 'forward-10', 30: 'forward-30' },
};

export const FALLBACK_ICON = 'music-note';

export function materialIcon(symbol: string): string | null {
  const direct = TABLE[symbol];
  if (direct) return direct;
  const skip = /^(gobackward|goforward)\.(\d+)$/.exec(symbol);
  if (skip) return SKIPS[skip[1]][Number(skip[2])] ?? TABLE[skip[1]];
  return null;
}

/** Every Material name the table can produce, for the test that checks them against the font. */
export function allMaterialIcons(): string[] {
  const skips = Object.values(SKIPS).flatMap((m) => Object.values(m));
  return [...new Set([...Object.values(TABLE), ...skips, FALLBACK_ICON])];
}
