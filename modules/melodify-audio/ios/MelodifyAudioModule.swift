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
  @Field var gainDb: Double = 0
}

/// Mirrors `NextTrack` in src/player/engine.ts.
internal struct NextTrackRecord: Record {
  @Field var uri: String = ""
  @Field var meta: NowPlayingMetaRecord = NowPlayingMetaRecord()
  @Field var gainDb: Double = 0
  @Field var key: String = ""
}

/// Mirrors `EqualizerSettings` in src/player/engine.ts.
internal struct EqualizerRecord: Record {
  @Field var enabled: Bool = false
  @Field var preampDb: Double = 0
  @Field var gains: [Double] = []
  @Field var bassBoost: Double = 0
}

/// Mirrors `TransitionSettings` in src/player/engine.ts.
internal struct TransitionRecord: Record {
  @Field var crossfadeMs: Double = 0
  @Field var gapless: Bool = true
}

/**
 The native half of `PlayerEngine` (src/player/engine.ts). Every function here has a counterpart
 on that interface, and `FakeEngine` is the reference for what each one is expected to do.
 */
public class MelodifyAudioModule: Module {
  private let player = MelodifyPlayer()
  private let nowPlaying = MelodifyNowPlaying()

  public func definition() -> ModuleDefinition {
    Name("MelodifyAudio")

    // Distinguishes a real native module from any JS fallback, so the Settings diagnostic
    // cannot report success just because something answered.
    Constant("implementation") { "native-swift" }
    Constant("version") { "0.7.0" }
    // What `readTags` reads; see src/scan/read-tags.ts. 2 added ReplayGain.
    Constant("tagVersion") { 2 }

    Events("state", "position", "ended", "advanced", "remote", "routeChange", "error")

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
      self.nowPlaying.setMetadata(Self.metadata(meta))
      try self.player.load(url: url, startMs: options.startMs, autoplay: options.autoplay, gainDb: options.gainDb)
    }

    // Since 0.7.0: the track to move on to without a gap, or with a crossfade. Nil disarms.
    AsyncFunction("setNext") { (next: NextTrackRecord?) in
      guard let next else {
        self.player.setNext(nil)
        return
      }
      // A file that has gone missing is not armed; the end is then reported as `ended` and the
      // queue deals with it as it would without gapless.
      guard let url = try? Self.fileURL(from: next.uri) else {
        self.player.setNext(nil)
        return
      }
      self.player.setNext(NextTrackItem(url: url, meta: Self.metadata(next.meta), gainDb: next.gainDb, key: next.key))
    }

    AsyncFunction("setTransition") { (settings: TransitionRecord) in
      self.player.setTransition(crossfadeMs: settings.crossfadeMs, gapless: settings.gapless)
    }

    AsyncFunction("setEqualizer") { (settings: EqualizerRecord) in
      self.player.setEqualizer(
        EqualizerConfig(
          enabled: settings.enabled, preampDb: settings.preampDb, gains: settings.gains, bassBoost: settings.bassBoost
        )
      )
    }

    AsyncFunction("setPitch") { (semitones: Double) in
      self.player.setPitch(semitones: semitones)
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
      self.nowPlaying.setRate(rate)
    }

    AsyncFunction("setVolume") { (volume: Double) in
      self.player.setVolume(volume)
    }

    AsyncFunction("getPosition") { () -> [String: Double] in
      let position = self.player.currentPosition()
      return ["positionMs": position.positionMs, "durationMs": position.durationMs]
    }

    // Tag reading is independent of playback: nothing here touches the player, so a scan can
    // run while music is playing. `artCacheDirectory` is passed in rather than resolved in Swift
    // because under LiveContainer the guest's Documents is not where FileManager would look.
    AsyncFunction("readTags") { (uris: [String], artCacheDirectory: String) -> [TrackTagsRecord] in
      await MelodifyTags.read(uris: uris, artCacheDirectory: artCacheDirectory)
    }

    // Embedded lyrics for one file, on demand. Nil when there are none.
    AsyncFunction("readLyrics") { (uri: String) -> String? in
      await MelodifyTags.lyrics(uri: uri)
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
    player.onAdvanced = { [weak self] item in
      // The lock screen changes to the new track before JS hears about it, as it does on a load.
      self?.nowPlaying.setMetadata(item.meta)
      self?.emit("advanced", ["key": item.key])
    }
    player.onNowPlaying = { [weak self] state, position in
      self?.nowPlaying.update(state: state, position: position)
    }
    player.onRouteChange = { [weak self] event in
      self?.emit("routeChange", ["reason": event.rawValue])
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

  private static func metadata(_ meta: NowPlayingMetaRecord) -> NowPlayingMetadata {
    NowPlayingMetadata(
      title: meta.title, artist: meta.artist, album: meta.album, durationMs: meta.durationMs, artUri: meta.artUri
    )
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
