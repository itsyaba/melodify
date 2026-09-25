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
  /** Bottom tabs in order. Home and Library are always there; the rest can be left out. */
  tabs: TabKey[];
  /** Library views in order; the ones left out are not shown. */
  libraryViews: LibraryViewKey[];
  /** The player's quick-access buttons under the controls, in order. The rest stay in its menu. */
  playerShortcuts: PlayerShortcut[];

  // Data.
  autoBackup: AutoBackup;

  // Sound.
  /** 0.5 to 2. */
  playbackRate: number;
  /** -12 to 12, when it does not follow the speed. */
  pitchSemitones: number;
  /** Pitch rises and falls with the speed, as on a record player. */
  pitchFollowsSpeed: boolean;
  equalizer: EqualizerPrefs;
  /** The user's own equalizer presets, by name. */
  eqPresets: EqPreset[];
  /** 0 for none. */
  crossfadeMs: number;
  gapless: boolean;
  replayGain: ReplayGainMode;
  /** Added to every ReplayGain value, dB. */
  replayGainPreampDb: number;
  /** In-app volume, 0 to 1, on top of the system's. */
  volume: number;
  /** A volume slider under the player's controls. */
  showVolume: boolean;
  /** Carry on playing when headphones come back after being pulled out mid-song. */
  resumeOnConnect: boolean;
  /** Which of the one-time changes in `migrate` the stored preferences have had. */
  version: number;
}

export interface EqPreset {
  name: string;
  gains: number[];
  preampDb: number;
}

/** `name` is the preset the gains came from, or '' once they were changed by hand. */
export interface EqualizerPrefs extends EqPreset {
  enabled: boolean;
  /** 0 to 1. */
  bassBoost: number;
}

export type ReplayGainMode = 'off' | 'track' | 'album';

export type AutoBackup = 'off' | 'daily' | 'weekly';
export type PlayerLayout = 'standard' | 'edge' | 'compact';
export type Density = 'comfortable' | 'compact';
export type OrientationChoice = 'auto' | 'portrait' | 'landscape';
export type TabKey = 'home' | 'queue' | 'folders' | 'library' | 'search';
export type LibraryViewKey =
  | 'songs' | 'albums' | 'artists' | 'album_artists' | 'genres' | 'composers' | 'years' | 'playlists';
export type PlayerShortcut =
  | 'lyrics' | 'sleep' | 'abRepeat' | 'bookmark' | 'sound' | 'queue' | 'details' | 'playlist' | 'share';

export const ALL_TABS: readonly TabKey[] = ['home', 'queue', 'folders', 'library', 'search'];
/**
 * Tabs that cannot be switched off: Home holds the settings gear and is where "Go to album" from
 * the player lands, and Library holds the lists.
 */
export const REQUIRED_TABS: readonly TabKey[] = ['home', 'library'];
export const ALL_LIBRARY_VIEWS: readonly LibraryViewKey[] = [
  'songs', 'albums', 'artists', 'album_artists', 'genres', 'composers', 'years', 'playlists',
];
export const ALL_PLAYER_SHORTCUTS: readonly PlayerShortcut[] = [
  'lyrics', 'sleep', 'abRepeat', 'bookmark', 'sound', 'queue', 'details', 'playlist', 'share',
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
  // Spotify keeps three under its controls; A–B repeat, bookmarks and sound are in the menu.
  playerShortcuts: ['lyrics', 'sleep', 'queue'],
  autoBackup: 'weekly',
  playbackRate: 1,
  pitchSemitones: 0,
  pitchFollowsSpeed: false,
  equalizer: { enabled: false, name: 'Flat', gains: Array(10).fill(0), preampDb: 0, bassBoost: 0 },
  eqPresets: [],
  crossfadeMs: 0,
  gapless: true,
  replayGain: 'off',
  replayGainPreampDb: 0,
  volume: 1,
  showVolume: false,
  resumeOnConnect: false,
  version: 2,
};

/** Version 1 trimmed the player's default row from these six; a row the user chose stays as it was. */
const SIX_SHORTCUTS: readonly PlayerShortcut[] = ['lyrics', 'sleep', 'abRepeat', 'bookmark', 'sound', 'queue'];
/** Version 2 put Home first and moved Settings to a gear on it; this was the default bar before. */
const OLD_DEFAULT_TABS = ['library', 'folders', 'queue', 'settings', 'search'];

/**
 * One-time changes to stored preferences, for defaults that changed after they were saved: a
 * stored value is the whole object, so a new default would never reach it otherwise.
 */
function migrate(stored: Partial<Prefs>): Partial<Prefs> {
  const out = { ...stored };
  if ((stored.version ?? 0) < 1 && String(stored.playerShortcuts) === String(SIX_SHORTCUTS)) {
    out.playerShortcuts = [...DEFAULT_PREFS.playerShortcuts];
  }
  // The old default bar becomes the new one. A bar the user arranged keeps its order: `sanitize`
  // drops Settings from it and puts Home in front.
  if ((stored.version ?? 0) < 2 && String(stored.tabs) === String(OLD_DEFAULT_TABS)) {
    out.tabs = [...DEFAULT_PREFS.tabs];
  }
  out.version = DEFAULT_PREFS.version;
  return out;
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Ten band gains, whatever was stored. */
function bands(gains: unknown): number[] {
  const list = Array.isArray(gains) ? gains : [];
  return Array.from({ length: 10 }, (_, i) => clamp(list[i], -12, 12, 0));
}

/**
 * A stored list may predate a tab or view added since, or have lost a required one; this keeps
 * the stored order and fixes both.
 */
function sanitize(p: Prefs): Prefs {
  const tabs = p.tabs.filter((t, i) => ALL_TABS.includes(t) && p.tabs.indexOf(t) === i);
  // A missing required tab goes back where the default bar has it: Home in front.
  for (const t of REQUIRED_TABS) if (!tabs.includes(t)) tabs.splice(Math.min(ALL_TABS.indexOf(t), tabs.length), 0, t);
  const views = p.libraryViews.filter((v, i) => ALL_LIBRARY_VIEWS.includes(v) && p.libraryViews.indexOf(v) === i);
  // Unlike the views, all of these may be switched off: the player's menu still has every one.
  const shortcuts = Array.isArray(p.playerShortcuts)
    ? p.playerShortcuts.filter((k, i) => ALL_PLAYER_SHORTCUTS.includes(k) && p.playerShortcuts.indexOf(k) === i)
    : [...DEFAULT_PREFS.playerShortcuts];
  const eq = { ...DEFAULT_PREFS.equalizer, ...(p.equalizer ?? {}) };
  return {
    ...p,
    tabs,
    libraryViews: views.length ? views : [...ALL_LIBRARY_VIEWS],
    playerShortcuts: shortcuts,
    playbackRate: clamp(p.playbackRate, 0.5, 2, 1),
    pitchSemitones: clamp(p.pitchSemitones, -12, 12, 0),
    equalizer: {
      enabled: eq.enabled === true,
      name: typeof eq.name === 'string' ? eq.name : '',
      gains: bands(eq.gains),
      preampDb: clamp(eq.preampDb, -12, 12, 0),
      bassBoost: clamp(eq.bassBoost, 0, 1, 0),
    },
    eqPresets: (Array.isArray(p.eqPresets) ? p.eqPresets : [])
      .filter((x) => x && typeof x.name === 'string' && x.name)
      .map((x) => ({ name: x.name, gains: bands(x.gains), preampDb: clamp(x.preampDb, -12, 12, 0) })),
    crossfadeMs: clamp(p.crossfadeMs, 0, 12_000, 0),
    replayGainPreampDb: clamp(p.replayGainPreampDb, -12, 12, 0),
    volume: clamp(p.volume, 0, 1, 1),
  };
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
    prefs = sanitize({ ...DEFAULT_PREFS, ...(stored ? migrate(stored) : {}) });
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

/** Runs `fn` after every preference change, outside React. Returns the unsubscribe. */
export function subscribePrefs(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
const subscribe = subscribePrefs;

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
