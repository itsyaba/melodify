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
 * Home's now-playing card: white text and controls over the song's own cover, blurred and
 * darkened, so they read the same whatever the art and the theme.
 */
export const HERO = {
  shade: 'rgba(0, 0, 0, 0.45)',
  ink: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.72)',
  track: 'rgba(255, 255, 255, 0.24)',
  button: '#ffffff',
  buttonInk: '#000000',
} as const;

/**
 * Home's Favorites tile: a heart on a pink-to-violet sweep, the same in every theme and accent,
 * so the list you build by hand stands apart from the ones the library fills in.
 */
export const FAVORITES_FILL = ['#ff2d6f', '#8e2de2'] as const;

/**
 * The icon tiles on the Settings root, one color per page, the same in every theme and accent so
 * each page keeps its place by color, as in the system's own Settings.
 */
export const SETTINGS_TILES = {
  library: ACCENTS.blue.hex,
  appearance: ACCENTS.purple.hex,
  playback: ACCENTS.pink.hex,
  sound: ACCENTS.orange.hex,
  backup: ACCENTS.green.hex,
  tour: ACCENTS.yellow.hex,
  recap: ACCENTS.indigo.hex,
  about: '#8e8e93',
} as const;

/** White at a lower strength, for the second line on a tint-colored fill. */
export const ON_TINT_MUTED = 'rgba(255, 255, 255, 0.78)';
/** A faint white disc or pill on a tint-colored fill. */
export const ON_TINT_FAINT = 'rgba(255, 255, 255, 0.2)';

/**
 * Light from above on an accent fill: lighter at the top-left corner, darker at the foot, so a
 * chosen card reads as lit rather than flat. Laid over the tint, so it suits every accent.
 */
export const SHEEN = { light: 'rgba(255, 255, 255, 0.24)', clear: 'rgba(255, 255, 255, 0)', shade: 'rgba(0, 0, 0, 0.2)' } as const;

/** Bright fills under white text (`onTint`), the same in every theme: Import and scan's two tiles. */
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

/**
 * The welcome pages' theme cards: each theme's page and a line of text on it, drawn the same
 * whichever theme is on, so they can be compared. System shows light and dark halves.
 */
export const THEME_SWATCHES = {
  light: { page: '#ffffff', ink: '#d1d1d6' },
  dark: { page: '#1c1c1e', ink: '#48484a' },
  black: { page: '#000000', ink: '#2c2c2e' },
} as const;

/**
 * The welcome pages: dark in every theme, a photo behind the first and near-black behind the
 * rest, with white text, a white button and glass pills. The accent only glows.
 */
export const ONBOARDING = {
  background: '#0e0e10',
  ink: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.58)',
  faint: 'rgba(255, 255, 255, 0.16)',
  glass: 'rgba(255, 255, 255, 0.08)',
  glassEdge: 'rgba(255, 255, 255, 0.14)',
  /** The floating cards and badges in the pictures. */
  card: '#1b1b1e',
  cardEdge: '#2c2c30',
  button: '#f5f5f7',
  buttonInk: '#111113',
  /** Over the photo: darker at the top for the name, and at the foot for the button. */
  photoShade: 'rgba(6, 10, 12, 0.62)',
  clear: 'rgba(6, 10, 12, 0)',
  highlight: 'rgba(255, 255, 255, 0.28)',
} as const;

/** How one of Home's big cards is painted: its fill, the text on it, and its round play button. */
export interface CardLook {
  fill: ColorValue;
  /** A diagonal sweep over the fill, in place of the flat color. */
  gradient?: readonly [string, string];
  ink: ColorValue;
  muted: ColorValue;
  button: ColorValue;
  buttonInk: ColorValue;
}

/**
 * Home's big cards for the lists the library keeps by itself: soft pastels with dark ink, the same
 * in every theme and accent, so each list keeps its color as Favorites keeps its sweep.
 */
export const HOME_CARDS = {
  lilac: { fill: '#c9a3f2', ink: '#1c0f2c', muted: 'rgba(28, 15, 44, 0.7)', button: '#3c1a5e', buttonInk: '#ffffff' },
  lime: { fill: '#d2e86b', ink: '#171c04', muted: 'rgba(23, 28, 4, 0.68)', button: '#2a320a', buttonInk: '#ffffff' },
  peach: { fill: '#f7b896', ink: '#2b1207', muted: 'rgba(43, 18, 7, 0.68)', button: '#5b2611', buttonInk: '#ffffff' },
} as const satisfies Record<string, CardLook>;

/**
 * The recap's story cards: one sweep each, dark enough for white text, in the order the cards are
 * shown. The same in every theme, as Spotify's Wrapped is: a recap is its own place, not a page
 * of the app.
 */
export const RECAP_CARDS: readonly { gradient: readonly [string, string]; glow: string }[] = [
  { gradient: ['#3b1d60', '#120a1f'], glow: '#b06bff' },
  { gradient: ['#06324a', '#04141d'], glow: '#38d6ff' },
  { gradient: ['#5c1430', '#1d0610'], glow: '#ff4f87' },
  { gradient: ['#13472f', '#06160f'], glow: '#49e08a' },
  { gradient: ['#5a3406', '#1d1102'], glow: '#ffae34' },
  { gradient: ['#1c2a63', '#080d20'], glow: '#6c86ff' },
  { gradient: ['#4a1550', '#17071a'], glow: '#e36bff' },
];

/** Ink and glass on a recap card, which is dark whatever the theme is. */
export const RECAP = {
  ink: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.64)',
  faint: 'rgba(255, 255, 255, 0.22)',
  glass: 'rgba(255, 255, 255, 0.1)',
  glassEdge: 'rgba(255, 255, 255, 0.16)',
  button: '#ffffff',
  buttonInk: '#111113',
} as const;

/**
 * The name bands on Home's playlist covers, Spotify's mix labels: bright fills with near-black
 * ink, the same in every theme. A playlist keeps its color by its id.
 */
export const PLAYLIST_BANDS = [
  { fill: '#e6f23f', ink: '#121212' },
  { fill: '#aaa6f4', ink: '#121212' },
  { fill: '#f6d43a', ink: '#121212' },
  { fill: '#f5a3c7', ink: '#121212' },
  { fill: '#7fe0c2', ink: '#121212' },
  { fill: '#ffa166', ink: '#121212' },
  { fill: '#8fc9ff', ink: '#121212' },
] as const;
/** The little round mark in a playlist cover's top corner, over any cover. */
export const PLAYLIST_BADGE = { fill: 'rgba(0, 0, 0, 0.55)', ink: '#ffffff' } as const;

/** Home's soft lights behind the greeting, beside the accent's own. */
export const HOME_GLOWS = ['#8e2de2', '#3a6df0'] as const;
