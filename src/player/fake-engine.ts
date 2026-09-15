import { Emitter } from '@/utils/events';
import type { EngineEvents, NowPlayingMeta, PlaybackState, PlayerEngine } from './engine';

/** Timer-driven engine for web / tests. Makes no sound. */
export class FakeEngine implements PlayerEngine {
  private events = new Emitter<EngineEvents>();
  private state: PlaybackState = 'idle';
  private positionMs = 0;
  private durationMs = 0;
  private rate = 1;
  private timer: ReturnType<typeof setInterval> | null = null;

  async load(_uri: string, meta: NowPlayingMeta, opts?: { autoplay?: boolean; startMs?: number }) {
    this.stopTimer();
    this.durationMs = meta.durationMs ?? 180_000;
    this.positionMs = opts?.startMs ?? 0;
    this.setState('paused');
    if (opts?.autoplay) await this.play();
  }
  async preload() {}
  async play() {
    if (this.state === 'idle') return;
    this.setState('playing');
    this.timer = setInterval(() => {
      this.positionMs += 250 * this.rate;
      if (this.positionMs >= this.durationMs) {
        this.positionMs = this.durationMs;
        this.stopTimer();
        this.setState('ended');
        this.events.emit('ended', undefined);
        return;
      }
      this.events.emit('position', { positionMs: this.positionMs, durationMs: this.durationMs });
    }, 250);
  }
  async pause() {
    this.stopTimer();
    if (this.state === 'playing') this.setState('paused');
  }
  async stop() {
    this.stopTimer();
    this.positionMs = 0;
    this.setState('idle');
  }
  async seek(positionMs: number) {
    this.positionMs = Math.max(0, Math.min(positionMs, this.durationMs));
    this.events.emit('position', { positionMs: this.positionMs, durationMs: this.durationMs });
  }
  async setRate(rate: number) { this.rate = rate; }
  async setVolume() {}
  updateNowPlaying() {}
  getState() { return this.state; }
  async getPosition() { return { positionMs: this.positionMs, durationMs: this.durationMs }; }
  on<K extends keyof EngineEvents>(event: K, fn: (payload: EngineEvents[K]) => void) {
    return this.events.on(event, fn);
  }
  /** Test helper: simulate a lock-screen command. */
  simulateRemote(cmd: EngineEvents['remote']) { this.events.emit('remote', cmd); }

  private setState(s: PlaybackState) {
    this.state = s;
    this.events.emit('state', s);
  }
  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
