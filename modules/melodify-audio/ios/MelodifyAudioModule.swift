import AVFoundation
import ExpoModulesCore

/// Mirrors `NowPlayingMeta` in src/player/engine.ts.
internal struct NowPlayingMetaRecord: Record {
  @Field var title: String = ""
  @Field var artist: String? = nil
  @Field var album: String? = nil
  @Field var durationMs: Double? = nil
  @Field var artUri: String? = nil
}

/// A partial `NowPlayingMeta`: every field optional, so a caller can correct one of them.
internal struct NowPlayingPatchRecord: Record {
  @Field var title: String? = nil
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

 `routeChange` is declared but never sent yet; interruptions and unplug are the next Phase 1 item.
 */
public class MelodifyAudioModule: Module {
  private let player = MelodifyPlayer()
  private let nowPlaying = MelodifyNowPlaying()

  public func definition() -> ModuleDefinition {
    Name("MelodifyAudio")

    // Distinguishes a real native module from any JS fallback, so the Settings diagnostic
    // cannot report success just because something answered.
    Constant("implementation") { "native-swift" }
    Constant("version") { "0.3.0" }

    Events("state", "position", "ended", "remote", "routeChange", "error")

    OnCreate {
      self.attachPlayerCallbacks()
    }

    OnDestroy {
      self.player.teardown()
      self.nowPlaying.teardown()
    }

    AsyncFunction("load") { (uri: String, meta: NowPlayingMetaRecord, options: LoadOptionsRecord) in
      let url = try Self.fileURL(from: uri)
      // Before the load, so the lock screen changes to the new track as playback starts rather
      // than a frame later: loading is itself a state change and publishes what is set here.
      self.nowPlaying.setMetadata(
        NowPlayingMetadata(
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          durationMs: meta.durationMs,
          artUri: meta.artUri
        )
      )
      try self.player.load(url: url, startMs: options.startMs, autoplay: options.autoplay)
    }

    AsyncFunction("updateNowPlaying") { (meta: NowPlayingPatchRecord) in
      self.nowPlaying.mergeMetadata(
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        durationMs: meta.durationMs,
        artUri: meta.artUri
      )
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
      self.player.seek(toMs: positionMs)
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
    player.onNowPlaying = { [weak self] state, position in
      self?.nowPlaying.update(state: state, position: position)
    }
    // Commands are not acted on here. They go to JS, where the queue store already knows what
    // "next" means; deciding in two places is how the lock screen and the app drift apart.
    nowPlaying.onCommand = { [weak self] command in
      self?.emit("remote", command.payload)
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
