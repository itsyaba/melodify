import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Where the library lives, and where the app keeps its own files.
 *
 * iOS: both are the app's Documents/, which USB (ifuse) and the Files app reach. Android: the music
 * is the phone's shared storage (/storage/emulated/0), walked directly, the way Musicolet scans
 * it; the app's own files (the art cache) stay in its private folder, out of the user's.
 *
 * Every track path, folder and folder-art key in the database is relative to `musicRoot`, so the
 * same backup restores onto either platform, and on Android matches Musicolet's own paths exactly.
 */

type AndroidConstants = { storageRoot?: string };

function androidRoot(): string {
  try {
    const mod = require('../modules/melodify-audio/src/MelodifyAudioModule').default as AndroidConstants | undefined;
    if (typeof mod?.storageRoot === 'string' && mod.storageRoot) return mod.storageRoot;
  } catch {
    // A build without the module: the usual place.
  }
  return '/storage/emulated/0';
}

export const isAndroid = Platform.OS === 'android';

export const musicRoot: Directory = isAndroid ? new Directory(`file://${androidRoot()}`) : Paths.document;

/** The app's own folder: Documents/ on iOS, the private files folder on Android. */
export const appRoot: Directory = Paths.document;

/**
 * Extracted artwork, relative to `appRoot`. The leading dot matters on iOS, where the app's folder
 * is the music folder: the scanner's walk skips dot-directories, so the cache never shows up as
 * library content.
 */
export const ART_CACHE_DIR = '.artcache';

/** The file:// URI of a path relative to the music folder. */
export function musicUri(relative: string): string {
  return Paths.join(musicRoot, relative);
}

export function musicFile(relative: string): File {
  return new File(musicRoot, ...relative.split('/'));
}

export function musicDirectory(relative: string): Directory {
  return relative ? new Directory(musicRoot, ...relative.split('/')) : musicRoot;
}

/** A cover: extracted art in the app's cache, or an image beside the songs. */
export function artFileUri(artKey: string): string {
  return artKey.startsWith(`${ART_CACHE_DIR}/`) ? Paths.join(appRoot, artKey) : musicUri(artKey);
}

/**
 * Folders a walk of the music folder leaves alone: hidden ones, and on Android the apps' own
 * (`Android/`, where messengers keep voice notes and other apps their sounds).
 */
export function skipsFolder(parentRelative: string, name: string): boolean {
  if (name.startsWith('.')) return true;
  return isAndroid && parentRelative === '' && name === 'Android';
}

type MediaIndex = { scanMediaFiles?(uris: string[]): Promise<void> };

/**
 * Android: tells the system's media index that these files changed, appeared or were deleted, so
 * other apps (and the system's own player) agree with Melodify. Nothing to do on iOS.
 */
export function notifyMediaChanged(uris: string[]): void {
  if (!isAndroid || uris.length === 0) return;
  try {
    const mod = require('../modules/melodify-audio/src/MelodifyAudioModule').default as MediaIndex | undefined;
    void mod?.scanMediaFiles?.(uris).catch(() => undefined);
  } catch {
    // An older build: the index catches up by itself on the next media scan.
  }
}

/** The music folder as a person would write it, for Settings. */
export function musicRootLabel(): string {
  const path = decodeURIComponent(musicRoot.uri).replace(/^file:\/\//, '').replace(/\/$/, '');
  return isAndroid && path === '/storage/emulated/0' ? 'Internal storage (/storage/emulated/0)' : path;
}
