import Native from '../../modules/melodify-audio/src/MelodifyAudioModule';
import { Emitter } from '@/utils/events';
import type { EngineEvents, NowPlayingMeta, PlaybackState, PlayerEngine } from './engine';

const STATES: readonly string[] = ['idle', 'loading', 'playing', 'paused', 'ended', 'error'];

/** The bridge hands over a plain string; anything unrecognised is treated as a fault. */
function toState(raw: string): PlaybackState {
  return STATES.includes(raw) ? (raw as PlaybackState) : 'error';
}

/**
 * `melodify-audio` behind the same contract FakeEngine implements. Listeners are attached once,
 * in the constructor, and fanned out through a local Emitter so `on()` returns an unsubscribe
 * the same way it does everywhere else.
 *
 * v1 covers transport and position. `remote` and `routeChange` are part of the contract and are
 * declared by the Swift module, but nothing sends them until the remote-command and interruption
 * items land, so this does not subscribe to them yet.
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
    Native.addListener('error', ({ message }) => this.events.emit('error', { message }));
  }

  async load(uri: string, meta: NowPlayingMeta, opts?: { autoplay?: boolean; startMs?: number }) {
    await Native.load(
      uri,
      {
        title: meta.title,
        artist: meta.artist ?? null,
        album: meta.album ?? null,
        durationMs: meta.durationMs ?? null,
        artUri: meta.artUri ?? null,
      },
      { autoplay: opts?.autoplay ?? false, startMs: opts?.startMs ?? 0 },
    );
  }

  async preload(uri: string) {
    await Native.preload(uri);
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
   * No native counterpart yet. Now Playing info is the next Phase 1 item; until it lands the
   * lock screen shows nothing, and the metadata the queue already passes to `load` is what
   * MPNowPlayingInfoCenter will read.
   */
  updateNowPlaying(_meta: Partial<NowPlayingMeta>) {}

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
