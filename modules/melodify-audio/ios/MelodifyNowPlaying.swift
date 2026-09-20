import MediaPlayer
import UIKit

/// Mirrors `NowPlayingMeta` in src/player/engine.ts.
internal struct NowPlayingMetadata {
  var title: String = ""
  var artist: String?
  var album: String?
  var durationMs: Double?
  var artUri: String?
}

/// Mirrors the `RemoteCommand` union in src/player/engine.ts.
internal enum RemoteCommandKind {
  case play
  case pause
  case toggle
  case next
  case previous
  case like
  case seek(positionMs: Double)
  case skipForward(intervalMs: Double)
  case skipBackward(intervalMs: Double)

  var payload: [String: Any?] {
    switch self {
    case .play: return ["type": "play"]
    case .pause: return ["type": "pause"]
    case .toggle: return ["type": "toggle"]
    case .next: return ["type": "next"]
    case .previous: return ["type": "previous"]
    case .like: return ["type": "like"]
    case .seek(let positionMs): return ["type": "seek", "positionMs": positionMs]
    case .skipForward(let intervalMs): return ["type": "skipForward", "intervalMs": intervalMs]
    case .skipBackward(let intervalMs): return ["type": "skipBackward", "intervalMs": intervalMs]
    }
  }
}

/**
 The lock screen, Control Center, headset and Bluetooth side of playback.

 Nothing here decides anything: commands are forwarded to JS, where the queue store already knows
 what "next" means. That keeps one source of truth for the queue and costs a round trip the user
 cannot perceive.

 Every method hops to the main thread. MediaPlayer expects to be driven from there, and the calls
 arrive from the player's audio queue.
 */
internal final class MelodifyNowPlaying {
  private let infoCenter = MPNowPlayingInfoCenter.default()
  private let commandCenter = MPRemoteCommandCenter.shared()
  /// Artwork is read off disk, so it is loaded away from both the main and audio threads.
  private let artQueue = DispatchQueue(label: "dev.yeab.melodify.artwork", qos: .utility)

  // Main thread only.
  private var metadata = NowPlayingMetadata()
  private var artwork: (uri: String, image: MPMediaItemArtwork)?
  private var lastState: PlayerState = .idle
  private var lastPosition = PlayerPosition(positionMs: 0, durationMs: 0)
  private var targets: [(command: MPRemoteCommand, token: Any)] = []

  var onCommand: ((RemoteCommandKind) -> Void)?

  init() {
    onMain { self.registerCommands() }
  }

  /// Replaces the metadata outright, for a new track.
  func setMetadata(_ next: NowPlayingMetadata) {
    onMain {
      self.metadata = next
      self.loadArtwork(next.artUri)
      self.publish()
    }
  }

  /// Applies the fields that were supplied and leaves the rest alone. The bridge cannot tell an
  /// absent field from an explicit null, so neither can this: both keep the current value.
  func mergeMetadata(
    title: String?, artist: String?, album: String?, durationMs: Double?, artUri: String?
  ) {
    onMain {
      if let title { self.metadata.title = title }
      if let artist { self.metadata.artist = artist }
      if let album { self.metadata.album = album }
      if let durationMs { self.metadata.durationMs = durationMs }
      if let artUri {
        self.metadata.artUri = artUri
        self.loadArtwork(artUri)
      }
      self.publish()
    }
  }

  func update(state: PlayerState, position: PlayerPosition) {
    onMain {
      self.lastState = state
      self.lastPosition = position
      if state == .idle {
        self.clearLocked()
      } else {
        self.publish()
      }
    }
  }

  func teardown() {
    onMain {
      for target in self.targets {
        target.command.removeTarget(target.token)
      }
      self.targets = []
      self.clearLocked()
    }
    onCommand = nil
  }

  // MARK: - Publishing

  private func publish() {
    var info: [String: Any] = [MPMediaItemPropertyTitle: metadata.title]
    if let artist = metadata.artist { info[MPMediaItemPropertyArtist] = artist }
    if let album = metadata.album { info[MPMediaItemPropertyAlbumTitle] = album }

    // The engine's duration comes from the file itself, so it beats whatever the database
    // guessed. Untagged tracks have no duration there at all until tag reading lands.
    let durationMs = lastPosition.durationMs > 0 ? lastPosition.durationMs : (metadata.durationMs ?? 0)
    if durationMs > 0 {
      info[MPMediaItemPropertyPlaybackDuration] = durationMs / 1000
    }
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = lastPosition.positionMs / 1000
    // iOS extrapolates elapsed time from this rate, which is why the position ticker does not
    // republish: telling it the rate once is both cheaper and smoother than 4 updates a second.
    info[MPNowPlayingInfoPropertyPlaybackRate] = lastState == .playing ? 1.0 : 0.0
    if let artwork {
      info[MPMediaItemPropertyArtwork] = artwork.image
    }

    infoCenter.nowPlayingInfo = info
    switch lastState {
    case .playing: infoCenter.playbackState = .playing
    case .paused, .loading: infoCenter.playbackState = .paused
    case .idle, .ended, .error: infoCenter.playbackState = .stopped
    }
  }

  private func clearLocked() {
    infoCenter.nowPlayingInfo = nil
    infoCenter.playbackState = .stopped
    artwork = nil
    metadata = NowPlayingMetadata()
  }

  private func loadArtwork(_ uri: String?) {
    guard let uri else {
      artwork = nil
      return
    }
    // Tracks in one album share a folder image, so the common case is already loaded.
    guard artwork?.uri != uri else { return }
    artwork = nil
    artQueue.async { [weak self] in
      let url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
      guard let image = UIImage(contentsOfFile: url.path) else { return }
      let art = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        guard let self, self.metadata.artUri == uri else { return }
        self.artwork = (uri, art)
        self.publish()
      }
    }
  }

  // MARK: - Commands

  private func registerCommands() {
    register(commandCenter.playCommand) { _ in .play }
    register(commandCenter.pauseCommand) { _ in .pause }
    register(commandCenter.togglePlayPauseCommand) { _ in .toggle }
    register(commandCenter.nextTrackCommand) { _ in .next }
    register(commandCenter.previousTrackCommand) { _ in .previous }
    register(commandCenter.changePlaybackPositionCommand) { event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return nil }
      return .seek(positionMs: event.positionTime * 1000)
    }

    // On the lock screen, fixed-interval skipping replaces next and previous rather than joining
    // them. A music player wants track buttons; the interval version belongs to the Phase 3
    // "seek by fixed amount" setting, so it stays off and unregistered until then.
    commandCenter.skipForwardCommand.isEnabled = false
    commandCenter.skipBackwardCommand.isEnabled = false
    // Phase 3, with favourites.
    commandCenter.likeCommand.isEnabled = false
  }

  private func register(
    _ command: MPRemoteCommand,
    _ map: @escaping (MPRemoteCommandEvent) -> RemoteCommandKind?
  ) {
    command.isEnabled = true
    let token = command.addTarget { [weak self] event in
      guard let self, let onCommand = self.onCommand, let kind = map(event) else {
        return .commandFailed
      }
      onCommand(kind)
      return .success
    }
    targets.append((command, token))
  }

  private func onMain(_ body: @escaping () -> Void) {
    if Thread.isMainThread {
      body()
    } else {
      DispatchQueue.main.async(execute: body)
    }
  }
}
