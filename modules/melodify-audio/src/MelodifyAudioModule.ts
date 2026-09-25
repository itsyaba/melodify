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
  NativeShortcut,
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
  /** Since 0.8.0: TagLib property names to values; an empty value removes the field. */
  writeTags?(uri: string, fields: Record<string, string>): Promise<void>;
  /** Since 0.8.0: embeds an image file as the only artwork; null removes all artwork. */
  setArtwork?(uri: string, imageUri: string | null): Promise<void>;
  /** Since 0.8.0: every property name to its values, plus `_pictures`, the embedded picture count. */
  readAllTags?(uri: string): Promise<Record<string, string[] | number>>;
  /** Since 0.9.0: replaces the dynamic home screen quick actions. */
  setShortcuts?(items: NativeShortcut[]): Promise<void>;
  /** Since 0.9.0: the quick action the app was launched with, once; null after or without one. */
  takeLaunchShortcut?(): string | null;
  /** Widened to string here; `src/player/native-engine.ts` narrows it to PlaybackState. */
  getState(): string;
}

export default requireNativeModule<MelodifyAudioModule>('MelodifyAudio');
