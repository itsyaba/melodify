import { useSyncExternalStore } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_MIN_DURATION_MS } from '@/constants';
import { getSetting, setSetting } from '@/db/settings';
import { applyTheme, type AccentName, type ThemeName } from '@/theme';
import { applyOrientation } from '@/utils/device';

/** User preferences, stored together as one JSON object under the `prefs` settings key. */
export interface Prefs {
  /** Skip back / forward buttons and the lock screen's skip commands, in seconds. */
  skipSeconds: number;
  /** Tracks at least this long remember where they were left. 0 turns it off. */
  resumeMinMs: number;
  /** Fade the volume down over the sleep timer's last half minute. */
  sleepFade: boolean;
  /** Songs shorter than this stay out of the library lists. 0 shows everything. */
  minDurationMs: number;

  // Appearance.
  theme: ThemeName;
  accent: AccentName;
  playerLayout: PlayerLayout;
  /** The artwork, blurred, behind the whole player. */
  blurBackground: boolean;
  density: Density;
  /** Stop the screen from locking while the player is open. */
  keepAwake: boolean;
  orientation: OrientationChoice;
  /** Bottom tabs in order. Library and Settings are always there; the rest can be left out. */
  tabs: TabKey[];
  /** Library views in order; the ones left out are not shown. */
  libraryViews: LibraryViewKey[];

  // Data.
  autoBackup: AutoBackup;
}

export type AutoBackup = 'off' | 'daily' | 'weekly';
export type PlayerLayout = 'standard' | 'edge' | 'compact';
export type Density = 'comfortable' | 'compact';
export type OrientationChoice = 'auto' | 'portrait' | 'landscape';
export type TabKey = 'library' | 'folders' | 'queue' | 'search' | 'settings';
export type LibraryViewKey =
  | 'songs' | 'albums' | 'artists' | 'album_artists' | 'genres' | 'composers' | 'years' | 'playlists';

export const ALL_TABS: readonly TabKey[] = ['library', 'folders', 'queue', 'settings', 'search'];
/** Tabs that cannot be switched off: every "Go to album" lands in Library, and Settings is the way back. */
export const REQUIRED_TABS: readonly TabKey[] = ['library', 'settings'];
export const ALL_LIBRARY_VIEWS: readonly LibraryViewKey[] = [
  'songs', 'albums', 'artists', 'album_artists', 'genres', 'composers', 'years', 'playlists',
];

export const DEFAULT_PREFS: Prefs = {
  skipSeconds: 10,
  resumeMinMs: 10 * 60_000,
  sleepFade: true,
  minDurationMs: DEFAULT_MIN_DURATION_MS,
  theme: 'system',
  accent: 'pink',
  playerLayout: 'standard',
  blurBackground: true,
  density: 'comfortable',
  keepAwake: false,
  orientation: 'portrait',
  tabs: [...ALL_TABS],
  libraryViews: [...ALL_LIBRARY_VIEWS],
  autoBackup: 'weekly',
};

/**
 * A stored list may predate a tab or view added since, or have lost a required one; this keeps
 * the stored order and fixes both.
 */
function sanitize(p: Prefs): Prefs {
  const tabs = p.tabs.filter((t, i) => ALL_TABS.includes(t) && p.tabs.indexOf(t) === i);
  for (const t of REQUIRED_TABS) if (!tabs.includes(t)) tabs.push(t);
  const views = p.libraryViews.filter((v, i) => ALL_LIBRARY_VIEWS.includes(v) && p.libraryViews.indexOf(v) === i);
  return { ...p, tabs, libraryViews: views.length ? views : [...ALL_LIBRARY_VIEWS] };
}

/** Side effects of the preferences that live outside React. */
function apply(p: Prefs, previous?: Prefs) {
  if (!previous || previous.theme !== p.theme || previous.accent !== p.accent) applyTheme(p.theme, p.accent);
  if (!previous || previous.orientation !== p.orientation) applyOrientation(p.orientation);
}

let prefs: Prefs = DEFAULT_PREFS;
const subscribers = new Set<() => void>();
let db: SQLiteDatabase | null = null;

/** Called once from the database's `onInit`, before the first screen reads anything. */
export async function loadPrefs(database: SQLiteDatabase): Promise<void> {
  db = database;
  try {
    const stored = await getSetting(database, 'prefs');
    prefs = sanitize({ ...DEFAULT_PREFS, ...(stored ?? {}) });
  } catch (err) {
    console.warn('[melodify] loading preferences failed:', err);
  }
  apply(prefs);
  // Nothing is subscribed at launch; after a restore, every screen showing a preference is.
  subscribers.forEach((fn) => fn());
}

export function getPrefs(): Prefs {
  return prefs;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  const previous = prefs;
  prefs = sanitize({ ...prefs, [key]: value });
  apply(prefs, previous);
  subscribers.forEach((fn) => fn());
  const target = db;
  if (target) {
    void setSetting(target, 'prefs', prefs).catch((err: unknown) => console.warn('[melodify] saving preferences failed:', err));
  }
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
