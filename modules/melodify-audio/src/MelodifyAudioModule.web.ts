import { registerWebModule, NativeModule } from 'expo';

/** No audio on web; `src/player` falls back to FakeEngine there. */
class MelodifyAudioModule extends NativeModule<{}> {
  implementation = 'web-stub';
  version = '0.1.0';
  getState(): string {
    return 'idle';
  }
}

export default registerWebModule(MelodifyAudioModule, 'MelodifyAudioModule');
