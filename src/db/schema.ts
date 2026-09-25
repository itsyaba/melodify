/**
 * Versioned migrations. Each entry runs once, in order, inside a transaction.
 * Never edit a shipped migration; append a new one.
 */
export const migrations: string[] = [
  // v1: library core
  `
  CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,          -- relative to Documents/, e.g. "Artist/Album/01 Song.flac"
    folder TEXT NOT NULL,               -- dirname(path), "" for root
    filename TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,             -- ms since epoch
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    album_artist TEXT,
    genre TEXT,
    composer TEXT,
    year INTEGER,
    track_no INTEGER,
    disc_no INTEGER,
    duration_ms INTEGER,
    bitrate INTEGER,
    sample_rate INTEGER,
    art_key TEXT,                       -- cache key for extracted / folder art
    lyrics_path TEXT,                   -- sidecar .lrc if present
    tagged INTEGER NOT NULL DEFAULT 0,  -- 1 once native tag reading has run
    hidden INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    play_count INTEGER NOT NULL DEFAULT 0,
    skip_count INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER,
    resume_ms INTEGER,
    added_at INTEGER NOT NULL
  );
  CREATE INDEX idx_tracks_folder ON tracks(folder);
  CREATE INDEX idx_tracks_album ON tracks(album_artist, album, disc_no, track_no);
  CREATE INDEX idx_tracks_artist ON tracks(artist);
  CREATE INDEX idx_tracks_title ON tracks(title);
  CREATE INDEX idx_tracks_added ON tracks(added_at);
  CREATE INDEX idx_tracks_played ON tracks(last_played_at);

  CREATE TABLE playlists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, position)
  );

  CREATE TABLE queues (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,          -- tab order
    current_index INTEGER NOT NULL DEFAULT 0,
    current_ms INTEGER NOT NULL DEFAULT 0,
    shuffle INTEGER NOT NULL DEFAULT 0,
    repeat TEXT NOT NULL DEFAULT 'off', -- off | all | one
    created_at INTEGER NOT NULL
  );
  CREATE TABLE queue_tracks (
    queue_id INTEGER NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (queue_id, position)
  );

  CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position_ms INTEGER NOT NULL,
    label TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE excluded_folders (
    folder TEXT PRIMARY KEY
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL                 -- JSON
  );

  CREATE TABLE scan_runs (
    id INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    added INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    removed INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  INSERT INTO queues (id, name, position, created_at) VALUES (1, 'Queue 1', 0, strftime('%s','now') * 1000);
  `,

  // v2: ReplayGain, and which tag reader last read a row. Rows tagged before this were read by
  // reader 1, which knew no ReplayGain; a newer reader reads them again (see src/scan/read-tags.ts).
  `
  ALTER TABLE tracks ADD COLUMN rg_track_gain REAL;   -- dB
  ALTER TABLE tracks ADD COLUMN rg_album_gain REAL;   -- dB
  ALTER TABLE tracks ADD COLUMN rg_track_peak REAL;   -- linear, 1.0 = full scale
  ALTER TABLE tracks ADD COLUMN rg_album_peak REAL;
  ALTER TABLE tracks ADD COLUMN tag_version INTEGER NOT NULL DEFAULT 1;
  `,

  // v3: what a restored Musicolet backup had that Melodify has no place for, kept so that the next
  // backup gives it back to Musicolet (see src/backup/musicolet.ts). Songs by Musicolet's own path,
  // each with the library song it was matched to (by path, so a rescan keeps it), if any.
  `
  CREATE TABLE musicolet_songs (
    uri TEXT PRIMARY KEY,               -- Musicolet's COL_PATH
    path TEXT,                          -- tracks.path it was matched to, NULL when none was
    row TEXT NOT NULL                   -- JSON: the rest of Musicolet's TABLE_SONGS row
  );
  CREATE INDEX musicolet_songs_path ON musicolet_songs(path);
  CREATE TABLE musicolet_files (
    name TEXT PRIMARY KEY,              -- zip member: PP, USP, DB_BDN, PCs_Y_2025, ...
    method INTEGER NOT NULL,            -- zip compression: 0 stored, 8 deflated
    crc INTEGER NOT NULL,               -- zip CRC-32 of the uncompressed bytes
    size INTEGER NOT NULL,              -- uncompressed
    data BLOB NOT NULL,                 -- as it was in the zip: compressed, still encrypted
    md5 TEXT NOT NULL                   -- of the decrypted contents, for the manifest
  );
  `,
];
