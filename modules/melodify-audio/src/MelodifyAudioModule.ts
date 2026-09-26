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
  /** Since 0.10.0: Blowfish, ECB, PKCS5 padding. Rejects on bad padding. */
  blowfish?(data: Uint8Array, key: Uint8Array, encrypt: boolean): Promise<Uint8Array>;
  /** Since 0.10.0: lowercase hex. */
  md5?(data: Uint8Array): Promise<string>;
  /** Since 0.10.0: UTF-8 to a string, bad sequences as U+FFFD. */
  utf8?(data: Uint8Array): Promise<string>;
  /** Since 0.10.0: zip's CRC-32. */
  crc32?(data: Uint8Array): Promise<number>;
  /** Since 0.10.0: raw DEFLATE, or null when it would not come out smaller. */
  deflate?(data: Uint8Array): Promise<Uint8Array | null>;
  /** Since 0.10.0: raw DEFLATE back to `size` bytes. Rejects when it does not come out so. */
  inflate?(data: Uint8Array, size: number): Promise<Uint8Array>;
  /** Widened to string here; `src/player/native-engine.ts` narrows it to PlaybackState. */
  getState(): string;

  // Android only (the Kotlin module, 0.11.0). Absent on iOS; callers check first.
  /** The primary shared storage, the music folder on Android: /storage/emulated/0. */
  readonly storageRoot?: string;
  /** Android 12's wallpaper accent, light and dark; null before Android 12. */
  readonly systemAccent?: { light: string; dark: string } | null;
  readonly sdkVersion?: number;
  /** "full": read and write everything; "read": audio and images only; "none". */
  storageAccess?(): NativeStorageAccess;
  /** "full" opens the All files access page; "read" asks for the media permissions. */
  requestStorageAccess?(kind: 'full' | 'read'): Promise<NativeStorageAccess>;
  /** Leaves silence out of what plays (ExoPlayer's silence skipping). */
  setSkipSilence?(enabled: boolean): Promise<void>;
  /** Tells the system's media index that these files changed, appeared or went. */
  scanMediaFiles?(uris: string[]): Promise<void>;
  /** The share sheet with the file itself. */
  shareFile?(uri: string, mimeType: string | null, title: string | null): Promise<void>;
}

export type NativeStorageAccess = 'full' | 'read' | 'none';

export default requireNativeModule<MelodifyAudioModule>('MelodifyAudio');
