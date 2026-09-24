import type { OrientationChoice } from '@/prefs';

/**
 * Screen orientation and keep-awake, through Expo modules that only builds from module 0.5.0 on
 * include. Required lazily and guarded, like the audio engine: on an older build the import itself
 * would throw, and these are conveniences that should quietly do nothing there.
 */

type OrientationModule = typeof import('expo-screen-orientation');
type KeepAwakeModule = typeof import('expo-keep-awake');

let orientationModule: OrientationModule | null | undefined;
let keepAwakeModule: KeepAwakeModule | null | undefined;

function orientation(): OrientationModule | null {
  if (orientationModule === undefined) {
    try {
      orientationModule = require('expo-screen-orientation') as OrientationModule;
    } catch {
      orientationModule = null;
    }
  }
  return orientationModule;
}

function keepAwake(): KeepAwakeModule | null {
  if (keepAwakeModule === undefined) {
    try {
      keepAwakeModule = require('expo-keep-awake') as KeepAwakeModule;
    } catch {
      keepAwakeModule = null;
    }
  }
  return keepAwakeModule;
}

export function applyOrientation(choice: OrientationChoice): void {
  const mod = orientation();
  if (!mod) return;
  const lock = {
    auto: mod.OrientationLock.DEFAULT,
    portrait: mod.OrientationLock.PORTRAIT_UP,
    landscape: mod.OrientationLock.LANDSCAPE,
  }[choice];
  void mod.lockAsync(lock).catch((err: unknown) => console.warn('[melodify] orientation lock failed:', err));
}

const TAG = 'melodify-player';

export function setKeepAwake(on: boolean): void {
  const mod = keepAwake();
  if (!mod) return;
  const op = on ? mod.activateKeepAwakeAsync(TAG) : mod.deactivateKeepAwake(TAG);
  void Promise.resolve(op).catch(() => undefined);
}

export function canLockOrientation(): boolean {
  return orientation() !== null;
}
