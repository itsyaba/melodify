import Native from '../../modules/melodify-audio/src/MelodifyAudioModule';
import { Emitter } from '@/utils/events';
import type {
  EngineEvents,
  EqualizerSettings,
  LoadOptions,
  NextTrack,
  NowPlayingMeta,
  PlaybackState,
  PlayerEngine,
  RemoteCommand,
  RouteChangeReason,
  TransitionSettings,
} from './engine';

const STATES: readonly string[] = ['idle', 'loading', 'playing', 'paused', 'ended', 'error'];

/** The bridge hands over a plain string; anything unrecognised is treated as a fault. */
function toState(raw: string): PlaybackState {
  return STATES.includes(raw) ? (raw as PlaybackState) : 'error';
}

const ROUTE_REASONS: readonly string[] = ['unplugged', 'connected', 'interruptionBegan', 'interruptionEnded'];

/** A reason this build does not know yet still reaches listeners, as `other`. */
function toRouteReason(raw: string): RouteChangeReason {
  return ROUTE_REASONS.includes(raw) ? (raw as RouteChangeReason) : 'other';
}

/** The commands that carry nothing but their name. */
const SIMPLE_COMMANDS = ['play', 'pause', 'toggle', 'next', 'previous', 'like'] as const;

function isSimpleCommand(type: string): type is (typeof SIMPLE_COMMANDS)[number] {
  return (SIMPLE_COMMANDS as readonly string[]).includes(type);
}

/**
 * A discriminated union cannot cross the bridge, so it is rebuilt here, in one place. A command
 * that arrives malformed is dropped rather than forwarded half-built: the queue store switches on
 * `type` and would otherwise seek to `undefined`.
 */
function toRemoteCommand(payload: {
  type: string;
  positionMs?: number;
  intervalMs?: number;
  clicks?: number;
}): RemoteCommand | null {
  if (isSimpleCommand(payload.type)) return { type: payload.type };
  if (payload.type === 'headset' && typeof payload.clicks === 'number' && payload.clicks > 0) {
    return { type: 'headset', clicks: Math.round(payload.clicks) };
  }
  if (payload.type === 'seek' && typeof payload.positionMs === 'number') {
    return { type: 'seek', positionMs: payload.positionMs };
  }
  if (
    (payload.type === 'skipForward' || payload.type === 'skipBackward') &&
    typeof payload.intervalMs === 'number'
  ) {
    return { type: payload.type, intervalMs: payload.intervalMs };
  }
  return null;
}

function nativeMeta(meta: NowPlayingMeta) {
  return {
    title: meta.title,
    artist: meta.artist ?? null,
    album: meta.album ?? null,
    durationMs: meta.durationMs ?? null,
    artUri: meta.artUri ?? null,
    favorite: meta.favorite ?? null,
  };
}

/**
 * `melodify-audio` behind the same contract FakeEngine implements. Listeners are attached once,
 * in the constructor, and fanned out through a local Emitter so `on()` returns an unsubscribe
 * the same way it does everywhere else.
 */
export class NativeEngine implements PlayerEngine {
  private events = new Emitter<EngineEvents>();
  private state: PlaybackState = 'idle';

  constructor() {
    Native.addListener('state', ({ state }) => {
      this.state = toState(state);
      this.events.emit('state', this.state);
    });
    Native.addListener('position', (position) => this.events.emit('position', position));
    Native.addListener('ended', () => this.events.emit('ended', undefined));
    Native.addListener('advanced', ({ key }) => this.events.emit('advanced', { key }));
    Native.addListener('error', ({ message }) => this.events.emit('error', { message }));
    Native.addListener('remote', (payload) => {
      const command = toRemoteCommand(payload);
      if (command) this.events.emit('remote', command);
    });
    Native.addListener('routeChange', ({ reason, wasPlaying }) => {
      this.events.emit('routeChange', {
        reason: toRouteReason(reason),
        ...(typeof wasPlaying === 'boolean' ? { wasPlaying } : {}),
      });
    });
  }

  async load(uri: string, meta: NowPlayingMeta, opts?: LoadOptions) {
    await Native.load(uri, nativeMeta(meta), {
      autoplay: opts?.autoplay ?? false,
      startMs: opts?.startMs ?? 0,
      gainDb: opts?.gainDb ?? 0,
    });
  }

  async preload(uri: string) {
    await Native.preload(uri);
  }

  // The four below arrived in 0.7.0. An older build has no such functions: arming falls back to
  // opening the file early, and the rest do nothing, so the queue still plays, with gaps.

  async setNext(next: NextTrack | null) {
    if (!Native.setNext) {
      if (next) await Native.preload(next.uri);
      return;
    }
    await Native.setNext(next ? { uri: next.uri, meta: nativeMeta(next.meta), gainDb: next.gainDb ?? 0, key: next.key } : null);
  }

  async setTransition(settings: TransitionSettings) {
    await Native.setTransition?.(settings);
  }

  async setEqualizer(settings: EqualizerSettings) {
    await Native.setEqualizer?.(settings);
  }

  async setPitch(semitones: number) {
    await Native.setPitch?.(semitones);
  }

  /** Android only (module 0.11.0): the Swift module has no such function. */
  async setSkipSilence(enabled: boolean) {
    await Native.setSkipSilence?.(enabled);
  }

  play() {
    return Native.play();
  }

  pause() {
    return Native.pause();
  }

  stop() {
    return Native.stop();
  }

  seek(positionMs: number) {
    return Native.seek(positionMs);
  }

  setRate(rate: number) {
    return Native.setRate(rate);
  }

  setVolume(volume: number) {
    return Native.setVolume(volume);
  }

  /**
   * The contract is synchronous and the bridge call is not, which is fine: nothing waits on the
   * lock screen, and `load` already published the metadata this corrects.
   */
  updateNowPlaying(meta: Partial<NowPlayingMeta>) {
    void Native.updateNowPlaying(meta);
  }

  /** Tracked from the `state` event rather than called across the bridge on every render. */
  getState() {
    return this.state;
  }

  getPosition() {
    return Native.getPosition();
  }

  on<K extends keyof EngineEvents>(event: K, fn: (payload: EngineEvents[K]) => void) {
    return this.events.on(event, fn);
  }
}

/** Constants of the module actually linked into this build, for the Settings diagnostic. */
export function nativeInfo(): { implementation: string; version: string } {
  return { implementation: String(Native.implementation), version: String(Native.version) };
}
