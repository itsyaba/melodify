import { Platform } from 'react-native';
import type { PlayerEngine } from './engine';
import { FakeEngine } from './fake-engine';

export interface EngineInfo {
  kind: 'native' | 'fake';
  implementation: string;
  version: string;
  /** Set only when the native module was expected but could not be loaded. */
  reason?: string;
}

const FAKE: EngineInfo = { kind: 'fake', implementation: 'fake-engine', version: '0' };

function select(): { engine: PlayerEngine; info: EngineInfo } {
  if (Platform.OS !== 'ios') {
    return { engine: new FakeEngine(), info: FAKE };
  }
  try {
    // Required lazily and guarded on purpose. An IPA built before the module existed has nothing
    // to link against, and a top-level import would take the whole app down on that build rather
    // than falling back to a silent one that still browses the library.
    const native = require('./native-engine') as typeof import('./native-engine');
    return { engine: new native.NativeEngine(), info: { kind: 'native', ...native.nativeInfo() } };
  } catch (err) {
    return {
      engine: new FakeEngine(),
      info: { ...FAKE, reason: err instanceof Error ? err.message : String(err) },
    };
  }
}

const selected = select();

export const engine: PlayerEngine = selected.engine;
/** Which engine this build ended up with. Surfaced in Settings. */
export const engineInfo: EngineInfo = selected.info;

export * from './engine';
