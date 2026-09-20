import AVFoundation
import ExpoModulesCore

/// Mirrors `PlaybackState` in src/player/engine.ts. The raw values cross the bridge as-is.
internal enum PlayerState: String {
  case idle, loading, playing, paused, ended, error
}

internal struct PlayerPosition {
  let positionMs: Double
  let durationMs: Double
}

/**
 AVAudioEngine playback behind the `PlayerEngine` contract.

 Phase 1 v1: one player node, one file at a time. Gapless (a second player node), crossfade and
 EQ are Phase 6 and slot into the same graph. Now Playing info, remote commands and interruption
 handling are the next two Phase 1 items and are not wired here yet.
 */
internal final class MelodifyPlayer {
  /// Every mutation below happens here. AVAudioEngine is not thread safe, the position ticker
  /// touches the same state the module's functions do, and `scheduleSegment` completions arrive
  /// on an engine-internal thread.
  private let queue = DispatchQueue(label: "dev.yeab.melodify.audio")

  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  /// In the graph from v1 so `setRate` is real rather than a stub, and so Phase 6's speed and
  /// pitch work has somewhere to land. At rate 1.0 it is a pass-through.
  private let timePitch = AVAudioUnitTimePitch()

  private var file: AVAudioFile?
  /// Opened ahead of time by `preload` and handed to `load` when the URL matches.
  private var preloaded: (url: URL, file: AVAudioFile)?

  /// Frame the current segment was scheduled from; the node's own clock counts up from here.
  private var segmentStartFrame: AVAudioFramePosition = 0
  /// Last position computed. Used while paused and whenever the render clock is unavailable.
  private var lastFrame: AVAudioFramePosition = 0
  /// Bumped whenever a schedule is superseded, so a stale completion handler does nothing.
  /// `scheduleSegment`'s callback also fires on `stop()`, which is why a plain flag is not enough.
  private var generation: UInt64 = 0

  private var state: PlayerState = .idle
  private var ticker: DispatchSourceTimer?
  private var sessionActive = false

  // Called on the audio queue. The module marshals them to the JS side.
  var onState: ((PlayerState) -> Void)?
  var onPosition: ((PlayerPosition) -> Void)?
  var onEnded: (() -> Void)?
  /// Fired when the lock screen's picture of playback changes: a new state, or a seek that moved
  /// the position out from under iOS's own extrapolation. Deliberately not driven by the position
  /// ticker — MPNowPlayingInfoCenter works out elapsed time from the rate on its own, and only
  /// needs telling when that arithmetic would be wrong.
  var onNowPlaying: ((PlayerState, PlayerPosition) -> Void)?

  init() {
    engine.attach(player)
    engine.attach(timePitch)
    // Seed the graph with a standard format. Each load reconnects with the file's own processing
    // format, which is what keeps mono files and 48 kHz / high-rate files from playing at the
    // wrong speed.
    let seed = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2)!
    engine.connect(player, to: timePitch, format: seed)
    engine.connect(timePitch, to: engine.mainMixerNode, format: seed)
    configureSessionCategory()
  }

  // MARK: - Transport

  /// Opening the file is the only slow step, so it happens before taking the queue: that keeps
  /// every queue-held critical section short enough for `currentState()` never to block JS.
  func load(url: URL, startMs: Double, autoplay: Bool) throws {
    let cached: AVAudioFile? = queue.sync { () -> AVAudioFile? in
      guard let pre = preloaded, pre.url == url else { return nil }
      return pre.file
    }
    let opened = try cached ?? openFile(url)

    try queue.sync {
      invalidateSchedule()
      stopTicker()
      preloaded = nil
      file = opened
      setState(.loading)

      let format = opened.processingFormat
      engine.connect(player, to: timePitch, format: format)
      engine.connect(timePitch, to: engine.mainMixerNode, format: format)

      // A start position at or past the end has nothing to schedule; `schedule` reports the
      // track as finished and there is no playback to start.
      guard schedule(from: clampFrames(framesFromMs(startMs, in: opened), in: opened)) else { return }
      emitPosition()

      if autoplay {
        try startPlayback()
      } else {
        setState(.paused)
      }
    }
  }

  /// Best effort: opening the file now parses its header so the `load` that follows does no disk
  /// work. Real gapless, which needs the next file scheduled on a second node, is Phase 6.
  func preload(url: URL) {
    queue.async { [weak self] in
      guard let self, let opened = try? AVAudioFile(forReading: url) else { return }
      self.preloaded = (url, opened)
    }
  }

  func play() throws {
    try queue.sync {
      // Nothing loaded is not a fault: a lock screen command can land just as the queue empties.
      // FakeEngine does nothing here too, and the two engines have to behave the same.
      guard file != nil, state != .playing else { return }
      // Playing after the file ran out starts it over rather than resuming at the end.
      if state == .ended {
        invalidateSchedule()
        guard schedule(from: 0) else { return }
      }
      try startPlayback()
    }
  }

  func pause() {
    queue.sync {
      guard state == .playing else { return }
      lastFrame = currentFrame()
      // Only the node is paused; the engine keeps rendering silence. That preserves the node's
      // sample clock, so resuming is instant and the position stays correct across a pause.
      player.pause()
      stopTicker()
      setState(.paused)
      emitPosition()
    }
  }

  func stop() {
    queue.sync {
      invalidateSchedule()
      stopTicker()
      file = nil
      segmentStartFrame = 0
      lastFrame = 0
      if engine.isRunning {
        engine.stop()
      }
      deactivateSession()
      setState(.idle)
    }
  }

  func seek(toMs ms: Double) {
    queue.sync {
      guard let opened = file else { return }
      let wasPlaying = state == .playing
      let wasEnded = state == .ended
      invalidateSchedule()
      // Dragging the seek bar to the far right lands here: nothing left to schedule, so the
      // track reports as finished rather than resuming into silence.
      guard schedule(from: clampFrames(framesFromMs(ms, in: opened), in: opened)) else { return }
      if wasPlaying {
        player.play()
        setState(.playing)
        startTicker()
      } else if wasEnded {
        setState(.paused)
      }
      emitPosition()
      // Seeking while playing leaves the state alone, so `setState` did not report this.
      emitNowPlaying()
    }
  }

  func setRate(_ rate: Double) {
    queue.sync {
      // AVAudioUnitTimePitch accepts 1/32 ... 32. The UI only ever asks for 0.5 ... 2.
      timePitch.rate = Float(min(max(rate, 1.0 / 32.0), 32.0))
    }
  }

  func setVolume(_ volume: Double) {
    queue.sync {
      engine.mainMixerNode.outputVolume = Float(min(max(volume, 0), 1))
    }
  }

  func currentState() -> PlayerState {
    queue.sync { state }
  }

  func currentPosition() -> PlayerPosition {
    queue.sync { () -> PlayerPosition in
      if state == .playing {
        lastFrame = currentFrame()
      }
      return snapshotLocked()
    }
  }

  func teardown() {
    queue.sync {
      invalidateSchedule()
      stopTicker()
      if engine.isRunning {
        engine.stop()
      }
      deactivateSession()
      file = nil
      preloaded = nil
    }
    onState = nil
    onPosition = nil
    onEnded = nil
    onNowPlaying = nil
  }

  // MARK: - Scheduling

  private func startPlayback() throws {
    try activateSession()
    if !engine.isRunning {
      engine.prepare()
      do {
        try engine.start()
      } catch {
        setState(.error)
        throw EngineStartException(error.localizedDescription)
      }
    }
    player.play()
    setState(.playing)
    startTicker()
  }

  /// Returns false when the start position left nothing to play, in which case the track has
  /// already been reported as finished and the caller has nothing more to do.
  @discardableResult
  private func schedule(from startFrame: AVAudioFramePosition) -> Bool {
    guard let opened = file else { return false }
    segmentStartFrame = startFrame
    lastFrame = startFrame

    let remaining = opened.length - startFrame
    guard remaining > 0 else {
      finishNaturally()
      return false
    }
    let frameCount = AVAudioFrameCount(min(remaining, AVAudioFramePosition(AVAudioFrameCount.max)))

    generation &+= 1
    let scheduledGeneration = generation
    player.scheduleSegment(
      opened,
      startingFrame: startFrame,
      frameCount: frameCount,
      at: nil,
      completionCallbackType: .dataPlayedBack
    ) { [weak self] _ in
      // Arrives on an engine-internal thread, and also fires when `stop()` discards the segment.
      guard let self else { return }
      self.queue.async {
        guard scheduledGeneration == self.generation else { return }
        self.finishNaturally()
      }
    }
    return true
  }

  /// Discards whatever is scheduled and makes its completion handler a no-op.
  private func invalidateSchedule() {
    generation &+= 1
    player.stop()
  }

  private func finishNaturally() {
    // Before `stop()`, so the callback that stop itself triggers is already stale.
    generation &+= 1
    player.stop()
    stopTicker()
    if let opened = file {
      segmentStartFrame = opened.length
      lastFrame = opened.length
    }
    emitPosition()
    setState(.ended)
    onEnded?()
  }

  // MARK: - Position

  private func currentFrame() -> AVAudioFramePosition {
    guard let opened = file else { return 0 }
    guard
      let nodeTime = player.lastRenderTime,
      let playerTime = player.playerTime(forNodeTime: nodeTime)
    else {
      return lastFrame
    }
    return clampFrames(segmentStartFrame + playerTime.sampleTime, in: opened)
  }

  private func startTicker() {
    stopTicker()
    // The contract promises roughly 4 updates a second while playing.
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + .milliseconds(250), repeating: .milliseconds(250))
    timer.setEventHandler { [weak self] in
      guard let self, self.state == .playing else { return }
      self.lastFrame = self.currentFrame()
      self.emitPosition()
    }
    timer.resume()
    ticker = timer
  }

  private func stopTicker() {
    ticker?.cancel()
    ticker = nil
  }

  /// Position as last established, which every transport path sets before reporting. The caller
  /// must already hold `queue`, so callbacks firing from inside it cannot deadlock on the way out.
  private func snapshotLocked() -> PlayerPosition {
    guard let opened = file else { return PlayerPosition(positionMs: 0, durationMs: 0) }
    return PlayerPosition(
      positionMs: msFromFrames(lastFrame, in: opened),
      durationMs: msFromFrames(opened.length, in: opened)
    )
  }

  private func emitPosition() {
    guard file != nil else { return }
    onPosition?(snapshotLocked())
  }

  private func emitNowPlaying() {
    onNowPlaying?(state, snapshotLocked())
  }

  private func msFromFrames(_ frames: AVAudioFramePosition, in opened: AVAudioFile) -> Double {
    let sampleRate = opened.processingFormat.sampleRate
    guard sampleRate > 0 else { return 0 }
    return Double(frames) / sampleRate * 1000
  }

  private func framesFromMs(_ ms: Double, in opened: AVAudioFile) -> AVAudioFramePosition {
    AVAudioFramePosition((ms / 1000) * opened.processingFormat.sampleRate)
  }

  private func clampFrames(_ frames: AVAudioFramePosition, in opened: AVAudioFile) -> AVAudioFramePosition {
    min(max(0, frames), opened.length)
  }

  // MARK: - Session and files

  /// Setting the category does not take audio focus, so it is safe at init. Only `setActive`
  /// interrupts whatever else is playing, and that waits until the user actually presses play.
  private func configureSessionCategory() {
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
  }

  private func activateSession() throws {
    guard !sessionActive else { return }
    do {
      try AVAudioSession.sharedInstance().setActive(true)
      sessionActive = true
    } catch {
      throw AudioSessionException(error.localizedDescription)
    }
  }

  private func deactivateSession() {
    guard sessionActive else { return }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    sessionActive = false
  }

  private func openFile(_ url: URL) throws -> AVAudioFile {
    do {
      return try AVAudioFile(forReading: url)
    } catch {
      throw AudioFileException("\(url.lastPathComponent): \(error.localizedDescription)")
    }
  }

  private func setState(_ next: PlayerState) {
    guard next != state else { return }
    state = next
    onState?(next)
    emitNowPlaying()
  }
}
