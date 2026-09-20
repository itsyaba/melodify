import { NativeModule, requireNativeModule } from 'expo';

import type { NativeAudioConstants } from './MelodifyAudio.types';

declare class MelodifyAudioModule extends NativeModule<{}> implements NativeAudioConstants {
  readonly implementation: string;
  readonly version: string;
  /** Widened to string here; `src/player` narrows it to PlaybackState. */
  getState(): string;
}

export default requireNativeModule<MelodifyAudioModule>('MelodifyAudio');
