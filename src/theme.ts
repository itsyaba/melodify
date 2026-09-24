import { Platform, PlatformColor, type ColorValue } from 'react-native';

// Semantic colors resolve to iOS system colors so light/dark/black themes come for free.
// Phase 4 replaces this with a user-selectable theme; keep every color behind a token.
function ios(name: string, fallback: string): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(name) : fallback;
}

export const colors = {
  background: ios('systemBackground', '#ffffff'),
  groupedBackground: ios('systemGroupedBackground', '#f2f2f7'),
  secondaryBackground: ios('secondarySystemBackground', '#f2f2f7'),
  label: ios('label', '#000000'),
  secondaryLabel: ios('secondaryLabel', '#3c3c4399'),
  tertiaryLabel: ios('tertiaryLabel', '#3c3c434d'),
  separator: ios('separator', '#3c3c4349'),
  tint: ios('systemPink', '#ff2d55'),
  fill: ios('systemFill', '#78788033'),
  destructive: ios('systemRed', '#ff3b30'),
  /** Text and icons drawn on a tint-colored fill. */
  onTint: ios('white', '#ffffff'),
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16 } as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const },
  title: { fontSize: 22, fontWeight: '600' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17, fontWeight: '400' as const },
  subhead: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const artSize = { row: 48, card: 160, player: 320 } as const;
