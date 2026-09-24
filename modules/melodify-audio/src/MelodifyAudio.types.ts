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
  error: (payload: { message: string }) => void;
  remote: (payload: { type: string; positionMs?: number; intervalMs?: number }) => void;
  /** Sent after the player has already paused or resumed for it; see `EngineEvents.routeChange`. */
  routeChange: (payload: { reason: string }) => void;
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
  /** Set when this one file failed; the rest of the batch still returns. */
  error: string | null;
}
