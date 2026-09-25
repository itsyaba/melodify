export interface Track {
  id: number;
  path: string;
  folder: string;
  filename: string;
  ext: string;
  size: number;
  mtime: number;
  title: string;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  genre: string | null;
  composer: string | null;
  year: number | null;
  track_no: number | null;
  disc_no: number | null;
  duration_ms: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  art_key: string | null;
  lyrics_path: string | null;
  tagged: 0 | 1;
  hidden: 0 | 1;
  favorite: 0 | 1;
  play_count: number;
  skip_count: number;
  last_played_at: number | null;
  resume_ms: number | null;
  added_at: number;
  rg_track_gain: number | null;
  rg_album_gain: number | null;
  rg_track_peak: number | null;
  rg_album_peak: number | null;
  /** Which tag reader last read this row; see `tagReaderVersion`. */
  tag_version: number;
}

export interface AlbumSummary {
  album: string;
  album_artist: string | null;
  year: number | null;
  track_count: number;
  art_key: string | null;
  first_track_id: number;
  /** Newest track's, for the recently added sort. */
  added_at: number;
}

export interface GroupSummary {
  /** The artist, genre, composer or year, as text. */
  name: string;
  track_count: number;
  album_count: number;
  art_key: string | null;
  duration_ms: number | null;
}

export interface FolderEntry {
  /** Folder path relative to Documents/, e.g. "Artist/Album". */
  path: string;
  name: string;
  /** Tracks anywhere beneath this folder. */
  track_count: number;
}

export interface Queue {
  id: number;
  name: string;
  position: number;
  current_index: number;
  current_ms: number;
  shuffle: 0 | 1;
  repeat: 'off' | 'all' | 'one';
  created_at: number;
}
