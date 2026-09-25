import { registerWebModule, NativeModule } from 'expo';

import type {
  MelodifyAudioEvents,
  NativeEqualizer,
  NativeLoadOptions,
  NativeNextTrack,
  NativeNowPlayingMeta,
  NativeNowPlayingPatch,
  NativePosition,
  NativeShortcut,
  NativeTrackTags,
  NativeTransition,
} from './MelodifyAudio.types';

/** No audio on web; `src/player` falls back to FakeEngine there. */
class MelodifyAudioModule extends NativeModule<MelodifyAudioEvents> {
  implementation = 'web-stub';
  version = '0.9.1';

  async load(_uri: string, _meta: NativeNowPlayingMeta, _options: NativeLoadOptions): Promise<void> {}
  async updateNowPlaying(_meta: NativeNowPlayingPatch): Promise<void> {}
  async preload(_uri: string): Promise<void> {}
  async play(): Promise<void> {}
  async pause(): Promise<void> {}
  async stop(): Promise<void> {}
  async seek(_positionMs: number): Promise<void> {}
  async setRate(_rate: number): Promise<void> {}
  async setVolume(_volume: number): Promise<void> {}
  async setPitch(_semitones: number): Promise<void> {}
  async setNext(_next: NativeNextTrack | null): Promise<void> {}
  async setEqualizer(_settings: NativeEqualizer): Promise<void> {}
  async setTransition(_settings: NativeTransition): Promise<void> {}
  async getPosition(): Promise<NativePosition> {
    return { positionMs: 0, durationMs: 0 };
  }
  async readTags(_uris: string[], _artCacheDirectory: string): Promise<NativeTrackTags[]> {
    return [];
  }
  async readLyrics(_uri: string): Promise<string | null> {
    return null;
  }
  async writeTags(_uri: string, _fields: Record<string, string>): Promise<void> {}
  async setArtwork(_uri: string, _imageUri: string | null): Promise<void> {}
  async readAllTags(_uri: string): Promise<Record<string, string[] | number>> {
    return {};
  }
  async setShortcuts(_items: NativeShortcut[]): Promise<void> {}
  takeLaunchShortcut(): string | null {
    return null;
  }
  getState(): string {
    return 'idle';
  }
}

export default registerWebModule(MelodifyAudioModule, 'MelodifyAudioModule');
