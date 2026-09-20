import { registerWebModule, NativeModule } from 'expo';

import type {
  MelodifyAudioEvents,
  NativeLoadOptions,
  NativeNowPlayingMeta,
  NativeNowPlayingPatch,
  NativePosition,
} from './MelodifyAudio.types';

/** No audio on web; `src/player` falls back to FakeEngine there. */
class MelodifyAudioModule extends NativeModule<MelodifyAudioEvents> {
  implementation = 'web-stub';
  version = '0.3.0';

  async load(_uri: string, _meta: NativeNowPlayingMeta, _options: NativeLoadOptions): Promise<void> {}
  async updateNowPlaying(_meta: NativeNowPlayingPatch): Promise<void> {}
  async preload(_uri: string): Promise<void> {}
  async play(): Promise<void> {}
  async pause(): Promise<void> {}
  async stop(): Promise<void> {}
  async seek(_positionMs: number): Promise<void> {}
  async setRate(_rate: number): Promise<void> {}
  async setVolume(_volume: number): Promise<void> {}
  async getPosition(): Promise<NativePosition> {
    return { positionMs: 0, durationMs: 0 };
  }
  getState(): string {
    return 'idle';
  }
}

export default registerWebModule(MelodifyAudioModule, 'MelodifyAudioModule');
