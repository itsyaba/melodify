import { Emitter } from '@/utils/events';
import type {
  EngineEvents,
  EqualizerSettings,
  LoadOptions,
  NextTrack,
  NowPlayingMeta,
  PlaybackState,
  PlayerEngine,
  RouteChangeReason,
  TransitionSettings,
} from './engine';

const DEFAULT_DURATION_MS = 180_000;

/**
 * Timer-driven engine for web / tests. Makes no sound. It is also the reference for what the
 * Swift engine does: arming a next track makes the end of this one move straight on to it
 * (at the start of the crossfade, when there is one) and report `advanced` instead of `ended`.
 */
export class FakeEngine implements PlayerEngine {
  private events = new Emitter<EngineEvents>();
  private state: PlaybackState = 'idle';
  private positionMs = 0;
  private durationMs = 0;
  private rate = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private interruptedWhilePlaying = false;
  private next: NextTrack | null = null;
  private transition: TransitionSettings = { crossfadeMs: 0, gapless: true };
  /** Kept only so tests can see what was asked for. */
  equalizer: EqualizerSettings | null = null;
  pitch = 0;
  volume = 1;
  gainDb = 0;

  async load(_uri: string, meta: NowPlayingMeta, opts?: LoadOptions) {
    this.stopTimer();
    this.next = null;
    this.durationMs = meta.durationMs ?? DEFAULT_DURATION_MS;
    this.positionMs = opts?.startMs ?? 0;
    this.gainDb = opts?.gainDb ?? 0;
    this.setState('paused');
    if (opts?.autoplay) await this.play();
  }
  async preload() {}
  async setNext(next: NextTrack | null) {
    this.next = next;
  }
  async setTransition(settings: TransitionSettings) {
    this.transition = settings;
  }
  async setEqualizer(settings: EqualizerSettings) {
    this.equalizer = settings;
  }
  async play() {
    if (this.state === 'idle' || this.state === 'playing') return;
    if (this.state === 'ended') this.positionMs = 0;
    this.setState('playing');
    this.timer = setInterval(() => this.tick(), 250);
  }
  async pause() {
    this.stopTimer();
    if (this.state === 'playing') this.setState('paused');
  }
  async stop() {
    this.stopTimer();
    this.next = null;
    this.positionMs = 0;
    this.setState('idle');
  }
  async seek(positionMs: number) {
    this.positionMs = Math.max(0, Math.min(positionMs, this.durationMs));
    this.events.emit('position', { positionMs: this.positionMs, durationMs: this.durationMs });
  }
  async setRate(rate: number) { this.rate = rate; }
  async setPitch(semitones: number) { this.pitch = semitones; }
  async setVolume(volume: number) { this.volume = volume; }
  updateNowPlaying() {}
  getState() { return this.state; }
  async getPosition() { return { positionMs: this.positionMs, durationMs: this.durationMs }; }
  on<K extends keyof EngineEvents>(event: K, fn: (payload: EngineEvents[K]) => void) {
    return this.events.on(event, fn);
  }

  /** One 250 ms step of playback. Public so tests can drive it without real timers. */
  tick() {
    if (this.state !== 'playing') return;
    this.positionMs += 250 * this.rate;
    const next = this.next;
    const moveOnAt = next ? this.durationMs - this.transition.crossfadeMs : this.durationMs;
    if (next && (this.transition.gapless || this.transition.crossfadeMs > 0) && this.positionMs >= moveOnAt) {
      this.next = null;
      this.positionMs = 0;
      this.durationMs = next.meta.durationMs ?? DEFAULT_DURATION_MS;
      this.gainDb = next.gainDb ?? 0;
      this.events.emit('advanced', { key: next.key });
      this.events.emit('position', { positionMs: 0, durationMs: this.durationMs });
      return;
    }
    if (this.positionMs >= this.durationMs) {
      this.positionMs = this.durationMs;
      this.stopTimer();
      this.setState('ended');
      this.events.emit('ended', undefined);
      return;
    }
    this.events.emit('position', { positionMs: this.positionMs, durationMs: this.durationMs });
  }

  /** Test helper: simulate a lock-screen command. */
  simulateRemote(cmd: EngineEvents['remote']) { this.events.emit('remote', cmd); }
  /**
   * Test helper: simulate an unplug or interruption. Acts before it reports, as the Swift side
   * does: pauses on unplug and interruption, resumes after one only if it had been playing.
   */
  async simulateRouteChange(reason: RouteChangeReason) {
    const wasPlaying = this.state === 'playing';
    if (reason === 'unplugged') {
      await this.pause();
    } else if (reason === 'interruptionBegan') {
      this.interruptedWhilePlaying = this.state === 'playing';
      await this.pause();
    } else if (reason === 'interruptionEnded') {
      const resume = this.interruptedWhilePlaying && this.state === 'paused';
      this.interruptedWhilePlaying = false;
      if (resume) await this.play();
    }
    this.events.emit('routeChange', { reason, wasPlaying });
  }

  private setState(s: PlaybackState) {
    this.state = s;
    this.events.emit('state', s);
  }
  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
