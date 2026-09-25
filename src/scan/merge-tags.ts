import type { NativeTrackTags } from '../../modules/melodify-audio/src/MelodifyAudio.types';

/** The columns a row holds before its tags are read: the scanner's filename guesses. */
export interface GuessedColumns {
  title: string;
  artist: string | null;
  album: string | null;
  track_no: number | null;
  disc_no: number | null;
}

/** Every column the tagging pass writes. */
export interface TaggedColumns extends GuessedColumns {
  album_artist: string | null;
  genre: string | null;
  composer: string | null;
  year: number | null;
  duration_ms: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  art_key: string | null;
  rg_track_gain: number | null;
  rg_album_gain: number | null;
  rg_track_peak: number | null;
  rg_album_peak: number | null;
}

/**
 * Real tags win field by field. A field the file does not carry keeps its filename guess, so an
 * MP3 with a title but no album still groups under its folder name. Embedded art beats folder art
 * (a `cover.jpg` is the fallback, as in Musicolet). A file whose read failed comes back with every
 * field null and so keeps its guesses. The caller still marks it tagged, but with no duration it
 * counts as pending again, so the next scan or launch tries it once more.
 */
export function mergeTags(guess: GuessedColumns, tags: NativeTrackTags, folderArt: string | null): TaggedColumns {
  return {
    title: tags.title ?? guess.title,
    artist: tags.artist ?? guess.artist,
    album: tags.album ?? guess.album,
    track_no: tags.trackNo ?? guess.track_no,
    disc_no: tags.discNo ?? guess.disc_no,
    album_artist: tags.albumArtist,
    genre: tags.genre,
    composer: tags.composer,
    year: tags.year,
    duration_ms: tags.durationMs,
    bitrate: tags.bitrate,
    sample_rate: tags.sampleRate,
    art_key: tags.artKey ?? folderArt,
    // Absent altogether from a reader older than 0.7.0.
    rg_track_gain: tags.trackGainDb ?? null,
    rg_album_gain: tags.albumGainDb ?? null,
    rg_track_peak: tags.trackPeak ?? null,
    rg_album_peak: tags.albumPeak ?? null,
  };
}
