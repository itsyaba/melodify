/**
 * The contract the UI and queue manager program against.
 * Implemented by the Swift `cadence-audio` module on iOS (Phase 1) and by FakeEngine elsewhere.
 * Every future engine feature (EQ, crossfade, pitch) is added here first, then in Swift.
 */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface NowPlayingMeta {
  title: string;
  artist?: string | null;
  album?: string | null;
  durationMs?: number | null;
  /** file:// URI of art, if any */
  artUri?: string | null;
}

export interface EngineEvents {
  state: PlaybackState;
  /** Fired roughly 4x per second while playing. */
  position: { positionMs: number; durationMs: number };
  /** Fired when the current file finished naturally. Queue manager decides what plays next. */
  ended: void;
  /** Lock screen / headset / Bluetooth remote commands. */
  remote: RemoteCommand;
  /** Route change or interruption the JS side may want to react to. */
  routeChange: { reason: 'unplugged' | 'connected' | 'interruptionBegan' | 'interruptionEnded' | 'other' };
  error: { message: string };
}

export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'skipForward'; intervalMs: number }
  | { type: 'skipBackward'; intervalMs: number }
  | { type: 'like' };

export interface PlayerEngine {
  /** Load a file and optionally start playing. */
  load(uri: string, meta: NowPlayingMeta, opts?: { autoplay?: boolean; startMs?: number }): Promise<void>;
  /** Pre-decode the next file so `load` of it is instant (gapless later). */
  preload(uri: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  updateNowPlaying(meta: Partial<NowPlayingMeta>): void;
  getState(): PlaybackState;
  getPosition(): Promise<{ positionMs: number; durationMs: number }>;
  on<K extends keyof EngineEvents>(event: K, fn: (payload: EngineEvents[K]) => void): () => void;
}
