import type { Track } from '@/db/types';
import type { ReplayGainMode } from '@/prefs';

/** The engine lowers freely but can raise a track by at most this much (its headroom). */
export const MAX_BOOST_DB = 6;
const MIN_DB = -24;

type GainColumns = Pick<Track, 'rg_track_gain' | 'rg_album_gain' | 'rg_track_peak' | 'rg_album_peak'>;

/**
 * The loudness correction for one track, in dB. Album mode keeps an album's own dynamics (its
 * quiet songs stay quiet next to its loud ones); track mode evens every song out. Each falls back
 * to the other value when a file carries only one. A known peak caps the gain so the loudest
 * sample stays below full scale. Untagged tracks are left alone.
 */
export function replayGainDb(track: GainColumns, mode: ReplayGainMode, preampDb = 0): number {
  if (mode === 'off') return 0;
  const album = mode === 'album';
  const gain = album ? (track.rg_album_gain ?? track.rg_track_gain) : (track.rg_track_gain ?? track.rg_album_gain);
  if (gain == null) return 0;
  const peak = album ? (track.rg_album_peak ?? track.rg_track_peak) : (track.rg_track_peak ?? track.rg_album_peak);
  let db = gain + preampDb;
  if (peak != null && peak > 0) db = Math.min(db, -20 * Math.log10(peak));
  return Math.min(MAX_BOOST_DB, Math.max(MIN_DB, db));
}
