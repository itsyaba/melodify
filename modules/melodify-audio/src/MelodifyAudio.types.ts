/** Constants the Swift module exposes, used to confirm a real native build is running. */
export interface NativeAudioConstants {
  readonly implementation: string;
  readonly version: string;
}

export interface NativePosition {
  positionMs: number;
  durationMs: number;
}

/** Mirrors the `NowPlayingMeta` fields of the Swift `NowPlayingMetaRecord`. */
export interface NativeNowPlayingMeta {
  title: string;
  artist?: string | null;
  album?: string | null;
  durationMs?: number | null;
  artUri?: string | null;
}

/** A partial `NativeNowPlayingMeta`: the fields present are applied, the rest are left alone. */
export interface NativeNowPlayingPatch {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  durationMs?: number | null;
  artUri?: string | null;
}

export interface NativeLoadOptions {
  autoplay: boolean;
  startMs: number;
  /** Since 0.7.0. ReplayGain for this track, dB. */
  gainDb?: number;
}

/** Since 0.7.0. Mirrors `NextTrack` in src/player/engine.ts. */
export interface NativeNextTrack {
  uri: string;
  meta: NativeNowPlayingMeta;
  gainDb: number;
  key: string;
}

/** Since 0.7.0. */
export interface NativeEqualizer {
  enabled: boolean;
  preampDb: number;
  gains: number[];
  bassBoost: number;
}

/** Since 0.7.0. */
export interface NativeTransition {
  crossfadeMs: number;
  gapless: boolean;
}

/**
 * Event payloads exactly as Swift sends them, before `src/player/native-engine.ts` narrows them
 * to the `EngineEvents` types. `state` and `reason` arrive as plain strings on purpose: the
 * bridge cannot enforce the unions, so the narrowing happens once, in one place.
 */
export type MelodifyAudioEvents = {
  state: (payload: { state: string }) => void;
  position: (payload: NativePosition) => void;
  ended: () => void;
  /** Since 0.7.0: moved on to the armed next track by itself. */
  advanced: (payload: { key: string }) => void;
  error: (payload: { message: string }) => void;
  remote: (payload: { type: string; positionMs?: number; intervalMs?: number }) => void;
  /** Sent after the player has already paused or resumed for it; see `EngineEvents.routeChange`. */
  routeChange: (payload: { reason: string }) => void;
  /** Since 0.9.0: a home screen quick action chosen while the app runs. */
  shortcut: (payload: { type: string }) => void;
};

/** One file's tags as the Swift side reports them. Absent fields come back null. */
export interface NativeTrackTags {
  uri: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  genre: string | null;
  composer: string | null;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  /** Relative to Documents/, e.g. ".artcache/ab12cd34.jpg". */
  artKey: string | null;
  /** Since 0.7.0 (absent before). ReplayGain tags, dB and linear peak. */
  trackGainDb?: number | null;
  albumGainDb?: number | null;
  trackPeak?: number | null;
  albumPeak?: number | null;
  /** Set when this one file failed; the rest of the batch still returns. */
  error: string | null;
}

/** Since 0.9.0. A home screen quick action; `symbol` is an SF Symbol name. */
export interface NativeShortcut {
  type: string;
  title: string;
  subtitle?: string | null;
  symbol?: string | null;
}
