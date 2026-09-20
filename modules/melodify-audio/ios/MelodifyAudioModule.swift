import AVFoundation
import ExpoModulesCore

/// Mirrors `NowPlayingMeta` in src/player/engine.ts. Only carried across the bridge in v1;
/// MPNowPlayingInfoCenter reads it once the Now Playing item of Phase 1 lands.
internal struct NowPlayingMetaRecord: Record {
  @Field var title: String = ""
  @Field var artist: String? = nil
  @Field var album: String? = nil
  @Field var durationMs: Double? = nil
  @Field var artUri: String? = nil
}

internal struct LoadOptionsRecord: Record {
  @Field var autoplay: Bool = false
  @Field var startMs: Double = 0
}

/**
 The native half of `PlayerEngine` (src/player/engine.ts). Every function here has a counterpart
 on that interface, and `FakeEngine` is the reference for what each one is expected to do.

 v1 implements transport and position. `remote` and `routeChange` are declared but never sent yet;
 they are the next two Phase 1 items (remote commands, then interruptions and unplug).
 */
public class MelodifyAudioModule: Module {
  private let player = MelodifyPlayer()

  public func definition() -> ModuleDefinition {
    Name("MelodifyAudio")

    // Distinguishes a real native module from any JS fallback, so the Settings diagnostic
    // cannot report success just because something answered.
    Constant("implementation") { "native-swift" }
    Constant("version") { "0.2.0" }

    Events("state", "position", "ended", "remote", "routeChange", "error")

    OnCreate {
      self.attachPlayerCallbacks()
    }

    OnDestroy {
      self.player.teardown()
    }

    // `meta` is accepted but unused in v1: it exists so the JS call site is already the final
    // one when MPNowPlayingInfoCenter starts reading it in the next Phase 1 item.
    AsyncFunction("load") { (uri: String, meta: NowPlayingMetaRecord, options: LoadOptionsRecord) in
      let url = try Self.fileURL(from: uri)
      try self.player.load(url: url, startMs: options.startMs, autoplay: options.autoplay)
    }

    AsyncFunction("preload") { (uri: String) in
      let url = try Self.fileURL(from: uri)
      self.player.preload(url: url)
    }

    AsyncFunction("play") {
      try self.player.play()
    }

    AsyncFunction("pause") {
      self.player.pause()
    }

    AsyncFunction("stop") {
      self.player.stop()
    }

    AsyncFunction("seek") { (positionMs: Double) in
      try self.player.seek(toMs: positionMs)
    }

    AsyncFunction("setRate") { (rate: Double) in
      self.player.setRate(rate)
    }

    AsyncFunction("setVolume") { (volume: Double) in
      self.player.setVolume(volume)
    }

    AsyncFunction("getPosition") { () -> [String: Double] in
      let position = self.player.currentPosition()
      return ["positionMs": position.positionMs, "durationMs": position.durationMs]
    }

    // Synchronous so the Settings diagnostic can read the engine without awaiting. The JS engine
    // does not call this; it tracks state from the `state` event instead.
    Function("getState") { () -> String in
      self.player.currentState().rawValue
    }
  }

  /// Split out of `OnCreate` so the weak captures below are plain weak captures. Written inline,
  /// they sit inside a definition closure that already captures self implicitly and strongly,
  /// which the compiler flags as a mismatch. The captures have to be weak either way: the player
  /// is owned by this module and these closures are stored on the player.
  private func attachPlayerCallbacks() {
    player.onState = { [weak self] state in
      self?.emit("state", ["state": state.rawValue])
    }
    player.onPosition = { [weak self] position in
      self?.emit("position", ["positionMs": position.positionMs, "durationMs": position.durationMs])
    }
    player.onEnded = { [weak self] in
      self?.emit("ended", [:])
    }
  }

  /// Events originate on the player's audio queue, including a 4 Hz position tick.
  private func emit(_ name: String, _ body: [String: Any?]) {
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent(name, body)
    }
  }

  /// `expo-file-system` hands JS a percent-encoded `file://` URI; accept a bare path too.
  private static func fileURL(from uri: String) throws -> URL {
    let url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw AudioFileException("\(url.lastPathComponent): no such file")
    }
    return url
  }
}
