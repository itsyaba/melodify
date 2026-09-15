import { FakeEngine } from './fake-engine';
import type { PlayerEngine } from './engine';

// Phase 1 swaps this for the native module on iOS:
//   Platform.OS === 'ios' ? new NativeEngine() : new FakeEngine()
export const engine: PlayerEngine = new FakeEngine();

export * from './engine';
