import { NativeModule, requireNativeModule } from 'expo';

import type {
  MelodifyAudioEvents,
  NativeAudioConstants,
  NativeEqualizer,
  NativeLoadOptions,
  NativeNextTrack,
  NativeNowPlayingMeta,
  NativeNowPlayingPatch,
  NativePosition,
  NativeTrackTags,
  NativeTransition,
} from './MelodifyAudio.types';

declare class MelodifyAudioModule
  extends NativeModule<MelodifyAudioEvents>
  implements NativeAudioConstants
{
  readonly implementation: string;
  readonly version: string;

  load(uri: string, meta: NativeNowPlayingMeta, options: NativeLoadOptions): Promise<void>;
  updateNowPlaying(meta: NativeNowPlayingPatch): Promise<void>;
  preload(uri: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  /** Since 0.7.0. The ones below may be missing on an older build; callers check first. */
  setPitch?(semitones: number): Promise<void>;
  setNext?(next: NativeNextTrack | null): Promise<void>;
  setEqualizer?(settings: NativeEqualizer): Promise<void>;
  setTransition?(settings: NativeTransition): Promise<void>;
  getPosition(): Promise<NativePosition>;
  readTags(uris: string[], artCacheDirectory: string): Promise<NativeTrackTags[]>;
  /** Since 0.5.0. Embedded lyrics (ID3 USLT, iTunes, Vorbis LYRICS), or null. */
  readLyrics(uri: string): Promise<string | null>;
  /** Widened to string here; `src/player/native-engine.ts` narrows it to PlaybackState. */
  getState(): string;
}

export default requireNativeModule<MelodifyAudioModule>('MelodifyAudio');
