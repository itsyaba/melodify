export const DB_NAME = 'cadence.db';

/** Extensions Core Audio can decode. Ogg/Opus deliberately absent, see README. */
export const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'aif', 'aiff', 'alac', 'caf', 'm4b', 'mp4',
]);

export const ART_FILENAMES = ['cover', 'folder', 'front', 'album', 'artwork'];
export const ART_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const LYRICS_EXTENSION = 'lrc';

/** Musicolet default: hide tracks shorter than this unless the user changes it. */
export const DEFAULT_MIN_DURATION_MS = 30_000;
