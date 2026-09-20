import { NativeModule, requireNativeModule } from 'expo';

import type {
  MelodifyAudioEvents,
  NativeAudioConstants,
  NativeLoadOptions,
  NativeNowPlayingMeta,
  NativePosition,
} from './MelodifyAudio.types';

declare class MelodifyAudioModule
  extends NativeModule<MelodifyAudioEvents>
  implements NativeAudioConstants
{
  readonly implementation: string;
  readonly version: string;

  load(uri: string, meta: NativeNowPlayingMeta, options: NativeLoadOptions): Promise<void>;
  preload(uri: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getPosition(): Promise<NativePosition>;
  /** Widened to string here; `src/player/native-engine.ts` narrows it to PlaybackState. */
  getState(): string;
}

export default requireNativeModule<MelodifyAudioModule>('MelodifyAudio');
