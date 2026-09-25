import { useSyncExternalStore } from 'react';
import { Appearance, Platform, PlatformColor, StyleSheet, type ColorValue } from 'react-native';

/**
 * Colors are iOS semantic colors, so light and dark come from the system; the theme only forces
 * one of them (through `Appearance.setColorScheme`, which sets the windows' interface style) and
 * swaps the few tokens that differ. A theme change re-renders every component that reads colors
 * through `useTheme` or `makeStyles`, so it applies at once, without a restart.
 */

export type ThemeName = 'system' | 'light' | 'dark' | 'black';

/** iOS system colors; each already has its own light and dark shade. Hex values are for web. */
export const ACCENTS = {
  pink: { ios: 'systemPink', hex: '#ff2d55', label: 'Pink' },
  red: { ios: 'systemRed', hex: '#ff3b30', label: 'Red' },
  orange: { ios: 'systemOrange', hex: '#ff9500', label: 'Orange' },
  yellow: { ios: 'systemYellow', hex: '#ffcc00', label: 'Yellow' },
  green: { ios: 'systemGreen', hex: '#34c759', label: 'Green' },
  mint: { ios: 'systemMint', hex: '#00c7be', label: 'Mint' },
  teal: { ios: 'systemTeal', hex: '#30b0c7', label: 'Teal' },
  cyan: { ios: 'systemCyan', hex: '#32ade6', label: 'Cyan' },
  blue: { ios: 'systemBlue', hex: '#007aff', label: 'Blue' },
  indigo: { ios: 'systemIndigo', hex: '#5856d6', label: 'Indigo' },
  purple: { ios: 'systemPurple', hex: '#af52de', label: 'Purple' },
  brown: { ios: 'systemBrown', hex: '#a2845e', label: 'Brown' },
} as const;
export type AccentName = keyof typeof ACCENTS;

function ios(name: string, fallback: string): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(name) : fallback;
}

export interface Palette {
  background: ColorValue;
  groupedBackground: ColorValue;
  secondaryBackground: ColorValue;
  label: ColorValue;
  secondaryLabel: ColorValue;
  tertiaryLabel: ColorValue;
  separator: ColorValue;
  tint: ColorValue;
  fill: ColorValue;
  destructive: ColorValue;
  /** Text and icons drawn on a tint-colored fill. */
  onTint: ColorValue;
  /** Drop shadows, such as the one under the player's artwork. The same in every theme. */
  shadow: ColorValue;
}

function palette(theme: ThemeName, accent: AccentName): Palette {
  const base: Palette = {
    background: ios('systemBackground', '#ffffff'),
    groupedBackground: ios('systemGroupedBackground', '#f2f2f7'),
    secondaryBackground: ios('secondarySystemBackground', '#f2f2f7'),
    label: ios('label', '#000000'),
    secondaryLabel: ios('secondaryLabel', '#3c3c4399'),
    tertiaryLabel: ios('tertiaryLabel', '#3c3c434d'),
    separator: ios('separator', '#3c3c4349'),
    tint: ios(ACCENTS[accent].ios, ACCENTS[accent].hex),
    fill: ios('systemFill', '#78788033'),
    destructive: ios('systemRed', '#ff3b30'),
    onTint: ios('white', '#ffffff'),
    shadow: 'rgba(0, 0, 0, 0.4)',
  };
  if (theme === 'dark') {
    // Charcoal rather than black: every surface one step up the system's dark scale.
    return {
      ...base,
      background: ios('secondarySystemBackground', '#1c1c1e'),
      groupedBackground: ios('systemBackground', '#000000'),
      secondaryBackground: ios('tertiarySystemBackground', '#2c2c2e'),
    };
  }
  if (theme === 'black') {
    // Pure black everywhere, including sheets, which iOS otherwise lifts to dark gray.
    return { ...base, background: '#000000', groupedBackground: '#000000', secondaryBackground: '#111111' };
  }
  return base;
}

let current: { theme: ThemeName; accent: AccentName } = { theme: 'system', accent: 'pink' };
let version = 0;
const subscribers = new Set<() => void>();

/**
 * The live palette. Read it through `useTheme()` in components so they re-render on a change;
 * reading it from module scope gets whatever was current at that moment.
 */
export const colors: Palette = palette(current.theme, current.accent);
/** A copy per theme, so memoized values that depend on colors can list them as a dependency. */
let snapshot: Palette = { ...colors };

export function applyTheme(theme: ThemeName, accent: AccentName): void {
  if (theme === current.theme && accent === current.accent && version > 0) return;
  current = { theme, accent };
  if (Platform.OS === 'ios') {
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme === 'light' ? 'light' : 'dark');
  }
  Object.assign(colors, palette(theme, accent));
  snapshot = { ...colors };
  version += 1;
  subscribers.forEach((fn) => fn());
}

export function currentTheme(): { theme: ThemeName; accent: AccentName } {
  return current;
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
const getVersion = () => version;

const getSnapshot = () => snapshot;

/** The palette, re-rendering the caller whenever the theme changes. A new object each time it does. */
export function useTheme(): Palette {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Styles that use colors. Returns a hook; the sheet is rebuilt once per theme change, not per
 * render, and every component calling the hook re-renders with the new one.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Palette) => T): () => T {
  let builtFor = -1;
  let sheet: T;
  return function useStyles() {
    const v = useSyncExternalStore(subscribe, getVersion, getVersion);
    if (v !== builtFor) {
      sheet = StyleSheet.create(factory(colors));
      builtFor = v;
    }
    return sheet;
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { none: 0, sm: 6, md: 10, lg: 16, full: 999 } as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const },
  title: { fontSize: 22, fontWeight: '600' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17, fontWeight: '400' as const },
  subhead: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const artSize = { row: 48, cover: 60, card: 160, player: 320 } as const;
