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
  /** Declared for the interruption item of Phase 1; nothing sends it yet. */
  routeChange: (payload: { reason: string }) => void;
};
