import ExpoModulesCore

/**
 Phase 1 scaffolding.

 This deliberately contains no audio code. Its only job is to prove the native pipeline end to
 end — local-module autolinking through `expo prebuild`, Swift compiling on the Xcode 27 runner,
 and the resulting IPA installing and reaching JS — before any AVAudioEngine work depends on it.

 The real engine fills this in behind the `PlayerEngine` contract in `src/player/engine.ts`,
 which already specifies every method and event the Swift side has to satisfy.
 */
public class MelodifyAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MelodifyAudio")

    // Distinguishes a real native module from any JS fallback, so the Settings diagnostic
    // cannot report success just because something answered.
    Constants([
      "implementation": "native-swift",
      "version": "0.1.0"
    ])

    // The first real method of the PlayerEngine contract. Always "idle" until there is an engine.
    Function("getState") { () -> String in
      "idle"
    }
  }
}
