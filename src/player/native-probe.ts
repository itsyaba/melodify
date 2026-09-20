/**
 * Reports whether the `melodify-audio` native module is linked into the running build.
 *
 * The require is lazy and guarded on purpose. The module only exists in an IPA built after it
 * landed, so a top-level import would crash any older build the instant this file hot-reloads
 * into it — including the one currently on the phone. Failing to a readable message instead
 * makes this safe to ship ahead of the native build.
 *
 * Temporary: once the real engine replaces FakeEngine, `src/player/index.ts` picks the
 * implementation and this diagnostic goes away.
 */
export interface NativeAudioProbe {
  linked: boolean;
  implementation?: string;
  version?: string;
  state?: string;
  error?: string;
}

export function probeNativeAudio(): NativeAudioProbe {
  try {
    const mod = require('../../modules/melodify-audio/src/MelodifyAudioModule').default;
    return {
      linked: true,
      implementation: String(mod.implementation),
      version: String(mod.version),
      state: String(mod.getState()),
    };
  } catch (err) {
    return { linked: false, error: err instanceof Error ? err.message : String(err) };
  }
}
