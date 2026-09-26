import { useSyncExternalStore } from 'react';
import { Appearance, Platform, PlatformColor, StyleSheet, type ColorValue } from 'react-native';

/**
 * Colors are iOS semantic colors, so light and dark come from the system; the theme only forces
 * one of them (through `Appearance.setColorScheme`, which sets the windows' interface style) and
 * swaps the few tokens that differ. A theme change re-renders every component that reads colors
 * through `useTheme` or `makeStyles`, so it applies at once, without a restart.
 *
 * Android has no such names, so each token carries the same color's light and dark values, and
 * the palette is rebuilt when the system switches between them.
 */

export type ThemeName = 'system' | 'light' | 'dark' | 'black';

type AndroidAccent = { systemAccent?: { light: string; dark: string } | null };

/** Android 12's wallpaper colors (Material You), from the module; null elsewhere and before 12. */
const WALLPAPER: { light: string; dark: string } | null = (() => {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = require('../modules/melodify-audio/src/MelodifyAudioModule').default as AndroidAccent | undefined;
    return mod?.systemAccent ?? null;
  } catch {
    return null;
  }
})();

/**
 * iOS system colors; each already has its own light and dark shade. `hex` and `dark` are the
 * same colors for Android and web. `wallpaper` follows the wallpaper on Android 12 and later, and
 * is only offered there.
 */
export const ACCENTS = {
  pink: { ios: 'systemPink', hex: '#ff2d55', dark: '#ff375f', label: 'Pink' },
  red: { ios: 'systemRed', hex: '#ff3b30', dark: '#ff453a', label: 'Red' },
  orange: { ios: 'systemOrange', hex: '#ff9500', dark: '#ff9f0a', label: 'Orange' },
  yellow: { ios: 'systemYellow', hex: '#ffcc00', dark: '#ffd60a', label: 'Yellow' },
  green: { ios: 'systemGreen', hex: '#34c759', dark: '#30d158', label: 'Green' },
  mint: { ios: 'systemMint', hex: '#00c7be', dark: '#63e6e2', label: 'Mint' },
  teal: { ios: 'systemTeal', hex: '#30b0c7', dark: '#40c8e0', label: 'Teal' },
  cyan: { ios: 'systemCyan', hex: '#32ade6', dark: '#64d2ff', label: 'Cyan' },
  blue: { ios: 'systemBlue', hex: '#007aff', dark: '#0a84ff', label: 'Blue' },
  indigo: { ios: 'systemIndigo', hex: '#5856d6', dark: '#5e5ce6', label: 'Indigo' },
  purple: { ios: 'systemPurple', hex: '#af52de', dark: '#bf5af2', label: 'Purple' },
  brown: { ios: 'systemBrown', hex: '#a2845e', dark: '#ac8e68', label: 'Brown' },
  wallpaper: { ios: 'systemBlue', hex: WALLPAPER?.light ?? '#6750a4', dark: WALLPAPER?.dark ?? '#d0bcff', label: 'Wallpaper' },
} as const;
export type AccentName = keyof typeof ACCENTS;

/** The accents this phone can show: all of them but the wallpaper's, which needs Android 12. */
export function availableAccents(): AccentName[] {
  return (Object.keys(ACCENTS) as AccentName[]).filter((a) => a !== 'wallpaper' || WALLPAPER !== null);
}

/** Whether the palette being built is the dark one. Only Android and web read it. */
let dark = false;

function ios(name: string, light: string, darkValue?: string): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(name) : dark && darkValue ? darkValue : light;
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
  /** A bottom sheet over the page, such as the menus: one step lighter than the page when dark. */
  sheet: ColorValue;
  /** Dims the page behind a sheet. The same in every theme. */
  scrim: ColorValue;
}

function palette(theme: ThemeName, accent: AccentName): Palette {
  const base: Palette = {
    background: ios('systemBackground', '#ffffff', '#000000'),
    groupedBackground: ios('systemGroupedBackground', '#f2f2f7', '#000000'),
    secondaryBackground: ios('secondarySystemBackground', '#f2f2f7', '#1c1c1e'),
    label: ios('label', '#000000', '#ffffff'),
    secondaryLabel: ios('secondaryLabel', '#3c3c4399', '#ebebf599'),
    tertiaryLabel: ios('tertiaryLabel', '#3c3c434d', '#ebebf54d'),
    separator: ios('separator', '#3c3c4349', '#54545899'),
    tint: ios(ACCENTS[accent].ios, ACCENTS[accent].hex, ACCENTS[accent].dark),
    fill: ios('systemFill', '#78788033', '#7878805c'),
    destructive: ios('systemRed', '#ff3b30', '#ff453a'),
    // A plain hex, not PlatformColor('white'): React Native only knows the semantic names in its own
    // table, and resolves any other (such as "white") to clear, so text in this color vanished.
    onTint: '#ffffff',
    shadow: 'rgba(0, 0, 0, 0.4)',
    sheet: ios('secondarySystemGroupedBackground', '#ffffff', '#1c1c1e'),
    scrim: 'rgba(0, 0, 0, 0.55)',
  };
  if (theme === 'dark') {
    // Charcoal rather than black: every surface one step up the system's dark scale.
    return {
      ...base,
      background: ios('secondarySystemBackground', '#1c1c1e', '#1c1c1e'),
      groupedBackground: ios('systemBackground', '#000000', '#000000'),
      secondaryBackground: ios('tertiarySystemBackground', '#2c2c2e', '#2c2c2e'),
      sheet: ios('tertiarySystemBackground', '#2c2c2e', '#2c2c2e'),
    };
  }
  if (theme === 'black') {
    // Pure black everywhere, including sheets, which iOS otherwise lifts to dark gray.
    return { ...base, background: '#000000', groupedBackground: '#000000', secondaryBackground: '#111111', sheet: '#1c1c1e' };
  }
  return base;
}

let current: { theme: ThemeName; accent: AccentName } = { theme: 'system', accent: 'pink' };
let version = 0;
const subscribers = new Set<() => void>();

/** Android and web: whether `theme` shows dark, which for System is the phone's setting. */
function isDark(theme: ThemeName): boolean {
  if (theme === 'dark' || theme === 'black') return true;
  return theme === 'system' && Appearance.getColorScheme() === 'dark';
}
dark = Platform.OS !== 'ios' && isDark(current.theme);

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
  // Before reading the system's scheme below: the override has to be gone for System to see it.
  Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme === 'light' ? 'light' : 'dark');
  rebuild();
}

function rebuild() {
  if (Platform.OS !== 'ios') dark = isDark(current.theme);
  Object.assign(colors, palette(current.theme, current.accent));
  snapshot = { ...colors };
  version += 1;
  subscribers.forEach((fn) => fn());
}

// iOS colors follow the system by themselves; Android's hex values are swapped by hand.
if (Platform.OS !== 'ios') {
  Appearance.addChangeListener(() => {
    if (current.theme === 'system' && isDark('system') !== dark) rebuild();
  });
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

/**
 * The record that slides out of a cover's sleeve on Home's list cards: black vinyl with faint
 * grooves in every theme, its centre label in the accent.
 */
export const VINYL = { disc: '#121212', groove: 'rgba(255, 255, 255, 0.08)', sheen: 'rgba(255, 255, 255, 0.05)' } as const;

/**
 * Bright fills under white text (`onTint`), the same in every theme: Import and scan's two tiles,
 * and the welcome pages' covers and feature tiles.
 */
export const BROWSE_TILE_COLORS = [
  '#dc148c',
  '#8400e7',
  '#006450',
  '#e13300',
  '#1e3264',
  '#148a08',
  '#0d73ec',
  '#8d67ab',
  '#ba5d07',
  '#e91429',
  '#27856a',
  '#af2896',
  '#477d95',
] as const;

/** An accent's own colour, as its swatch shows it; the tint is this for the accent in use. */
export function accentColor(accent: AccentName): ColorValue {
  return ios(ACCENTS[accent].ios, ACCENTS[accent].hex, ACCENTS[accent].dark);
}

/**
 * The welcome pages' theme swatches: each theme's page and a line of text on it, drawn the same
 * whichever theme is on, so they can be compared. System shows light and dark halves.
 */
export const THEME_SWATCHES = {
  light: { page: '#ffffff', ink: '#d1d1d6' },
  dark: { page: '#1c1c1e', ink: '#48484a' },
  black: { page: '#000000', ink: '#2c2c2e' },
} as const;
