/**
 * The contract the UI and queue manager program against.
 * Implemented by the `melodify-audio` module (Swift on iOS, Kotlin on Android) and by FakeEngine
 * elsewhere. Every new engine feature is added here first, then in FakeEngine, then natively.
 */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface NowPlayingMeta {
  title: string;
  artist?: string | null;
  album?: string | null;
  durationMs?: number | null;
  /** file:// URI of art, if any. Without one the lock screen shows the default cover. */
  artUri?: string | null;
  /** Android: fills the notification's heart. iOS has no such button and ignores it. */
  favorite?: boolean;
}

/** Per-track loudness correction, in dB. ReplayGain, already worked out by the queue. */
export type GainDb = number;

/**
 * The track that should follow the current one when it ends by itself. The engine starts it
 * without a gap (or crossfades into it) and reports `advanced` with the same `key`, so the queue
 * can tell which of its tracks is now playing even if it has since armed another.
 */
export interface NextTrack {
  uri: string;
  meta: NowPlayingMeta;
  gainDb?: GainDb;
  key: string;
}

/** Centre frequencies of the ten equalizer bands, in Hz. */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
/** Band and pre-amp gains are clamped to this, in dB. */
export const EQ_RANGE_DB = 12;

export interface EqualizerSettings {
  enabled: boolean;
  /** Applied before the bands, dB. Negative leaves headroom for boosted bands. */
  preampDb: number;
  /** One per `EQ_FREQUENCIES`, dB. */
  gains: number[];
  /** 0 to 1: a low shelf up to +12 dB. */
  bassBoost: number;
}

export interface TransitionSettings {
  /** 0 for none. Overlaps the end of a track with the start of the next when it ends by itself. */
  crossfadeMs: number;
  /** Start the next track with no silence between. Ignored while crossfading. */
  gapless: boolean;
}

export interface EngineEvents {
  state: PlaybackState;
  /** Fired roughly 4x per second while playing. */
  position: { positionMs: number; durationMs: number };
  /**
   * Fired when the current file finished naturally and nothing was armed with `setNext`. Queue
   * manager decides what plays next.
   */
  ended: void;
  /** The engine moved on to the track armed with `setNext`, by itself: gapless or crossfading. */
  advanced: { key: string };
  /** Lock screen / headset / Bluetooth remote commands. */
  remote: RemoteCommand;
  /**
   * An interruption or route change, reported after the engine has already acted on it, since
   * these are the cases where a bridge round trip would be audible:
   * - `unplugged`: headphones or Bluetooth went away; the engine paused.
   * - `interruptionBegan`: a call, alarm or another app took audio; the engine paused.
   * - `interruptionEnded`: the engine resumed if iOS allows it and it was playing when the
   *   interruption began. Anything the user had paused stays paused.
   * - `connected`: new headphones; nothing happens on its own. Resume-on-plug is the queue's call.
   * The resulting state changes arrive as ordinary `state` events, before this one, so
   * `wasPlaying` says whether playback was running when it happened (absent before module 0.9.2).
   */
  routeChange: { reason: RouteChangeReason; wasPlaying?: boolean };
  error: { message: string };
}

export type RouteChangeReason = 'unplugged' | 'connected' | 'interruptionBegan' | 'interruptionEnded' | 'other';

export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'skipForward'; intervalMs: number }
  | { type: 'skipBackward'; intervalMs: number }
  | { type: 'like' }
  /**
   * Android: a headset's one button (or a Bluetooth play/pause) pressed this many times in a row,
   * one to three. The queue maps the count to an action from Settings, as Musicolet does. iOS
   * turns clicks into play/pause, next and previous itself, so it never sends this.
   */
  | { type: 'headset'; clicks: number };

export interface LoadOptions {
  autoplay?: boolean;
  startMs?: number;
  gainDb?: GainDb;
}

export interface PlayerEngine {
  /** Load a file and optionally start playing. Forgets whatever `setNext` armed. */
  load(uri: string, meta: NowPlayingMeta, opts?: LoadOptions): Promise<void>;
  /** Opens the next file ahead of time so a `load` of it is instant. */
  preload(uri: string): Promise<void>;
  /**
   * What follows the current track when it ends by itself; null for nothing (the engine then
   * reports `ended`). Replaces whatever was armed before.
   */
  setNext(next: NextTrack | null): Promise<void>;
  setTransition(settings: TransitionSettings): Promise<void>;
  setEqualizer(settings: EqualizerSettings): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** Speed, 0.5 to 2. Pitch is kept unless `setPitch` says otherwise. */
  setRate(rate: number): Promise<void>;
  /** Pitch shift in semitones, -12 to 12, independent of speed. */
  setPitch(semitones: number): Promise<void>;
  /**
   * Leaves out silence: the quiet stretch before a hidden track, gaps in a recorded talk. Android
   * (ExoPlayer's silence skipping); iOS has no such stage in its audio graph and ignores it.
   */
  setSkipSilence(enabled: boolean): Promise<void>;
  setVolume(volume: number): Promise<void>;
  updateNowPlaying(meta: Partial<NowPlayingMeta>): void;
  getState(): PlaybackState;
  getPosition(): Promise<{ positionMs: number; durationMs: number }>;
  on<K extends keyof EngineEvents>(event: K, fn: (payload: EngineEvents[K]) => void): () => void;
}
