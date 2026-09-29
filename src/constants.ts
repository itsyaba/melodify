export const DB_NAME = 'melodify.db';

/**
 * Extensions Core Audio can decode. Ogg/Opus deliberately absent, see README. No .mp4: it is
 * nearly always a video (screen recordings, downloads), and music in that container is .m4a.
 */
export const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'aif', 'aiff', 'alac', 'caf', 'm4b',
]);

/**
 * Extensions ExoPlayer plays on Android, through the phone's own decoders: Ogg Vorbis and Opus
 * too, which iOS cannot, but not AIFF or CAF, which Android has no reader for. No .mp4, as on iOS.
 */
export const ANDROID_AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'm4b', 'ogg', 'oga', 'opus', 'mka', 'amr', 'awb',
]);

export const ART_FILENAMES = ['cover', 'folder', 'front', 'album', 'artwork'];
export const ART_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const LYRICS_EXTENSION = 'lrc';

/** Musicolet default: hide tracks shorter than this unless the user changes it. */
export const DEFAULT_MIN_DURATION_MS = 30_000;
