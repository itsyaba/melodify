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

/// Mirrors the `routeChange` reasons in src/player/engine.ts. The raw values cross the bridge as-is.
internal enum PlayerRouteEvent: String {
  case unplugged, connected, interruptionBegan, interruptionEnded
}

/// What `setNext` armed. Mirrors `NextTrack` in src/player/engine.ts.
internal struct NextTrackItem {
  let url: URL
  let meta: NowPlayingMetadata
  let gainDb: Double
  let key: String
}

/// Mirrors `EqualizerSettings` in src/player/engine.ts.
internal struct EqualizerConfig {
  var enabled = false
  var preampDb: Double = 0
  var gains: [Double] = []
  var bassBoost: Double = 0
}

/**
 One player node and the file it is playing. There are two, so a crossfade can overlap the end of
 one track with the start of the next, and so the next track can be made ready on the idle one.
 */
private final class Deck {
  let node = AVAudioPlayerNode()
  /// Input bus on the sources mixer.
  let bus: AVAudioNodeBus
  var file: AVAudioFile?
  /// The format the node is connected with. A file in the same format can follow on this node.
  var format: AVAudioFormat?
  /// File frame the current segment was scheduled from.
  var startFrame: AVAudioFramePosition = 0
  /// Node sample time at which the current file began: 0, until a gapless successor takes over
  /// on the same node, when it is where the previous file's segment ended.
  var nodeOffset: AVAudioFramePosition = 0
  /// Length of the current segment, in frames.
  var segmentFrames: AVAudioFramePosition = 0
  /// Token of the segment playing now. A completion carrying any other token is stale.
  var current: UInt64?
  /// A gapless successor scheduled on this node right after the current segment.
  var queued: (token: UInt64, file: AVAudioFile)?
  /// ReplayGain as a node volume, with the engine's fixed headroom already taken off.
  var gain: Float = 1

  init(bus: AVAudioNodeBus) {
    self.bus = bus
  }
}

/// A crossfade in progress: the outgoing deck fading down while the active one fades up.
private struct Fade {
  let outgoing: Int
  let startNs: UInt64
  let durationMs: Double
  let timer: DispatchSourceTimer
}

/**
 AVAudioEngine playback behind the `PlayerEngine` contract.

 The graph:

     deck A ─┐
             ├─ sources (mixer) ─ timePitch ─ eq ─ main mixer ─ output
     deck B ─┘

 One deck is active at a time. When the queue arms a next track (`setNext`), the end of the
 current one moves straight on to it, without a round trip to JS:

 - Gapless, same format: the next file is scheduled on the active node right behind the current
   one, so the change is sample-accurate. Scheduling happens only in the last few seconds, because
   the one way to take a segment back off a node is to stop it, which would be audible mid-song.
 - Gapless, different format: the next file waits on the other deck, which starts the moment the
   active one runs dry.
 - Crossfade: the other deck starts under the end of the active one and the two are ramped.

 `advanced` then tells JS which track is now current. With nothing armed, the end is reported as
 `ended` and the queue loads what comes next itself, as before.

 ReplayGain is the node volume, which cannot go above 1, so the EQ adds a fixed 6 dB of gain and
 every node gives it back: a track may then be raised by up to 6 dB as well as lowered.

 Interruptions and route changes are handled here rather than in JS, because they are the cases
 where waiting a bridge round trip is audible: unplugging pauses at once instead of leaking a
 moment through the speaker. The queue still hears about each one through `onRouteChange`.
 */
internal final class MelodifyPlayer {
  /// Every mutation below happens here. AVAudioEngine is not thread safe, the position ticker
  /// touches the same state the module's functions do, and segment completions arrive on an
  /// engine-internal thread.
  private let queue = DispatchQueue(label: "dev.yeab.melodify.audio")

  private let engine = AVAudioEngine()
  private let decks = [Deck(bus: 0), Deck(bus: 1)]
  private var active = 0
  private let sources = AVAudioMixerNode()
  /// Speed and pitch. Bypassed at 1x with no shift, where it would only add latency.
  private let timePitch = AVAudioUnitTimePitch()
  /// Ten bands, then a low shelf for bass boost.
  private let eq = AVAudioUnitEQ(numberOfBands: MelodifyPlayer.frequencies.count + 1)

  private static let frequencies: [Float] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  private static let bandRangeDb = 12.0
  private static let bassShelfHz: Float = 90
  private static let bassBoostMaxDb: Float = 12
  /// See the class comment: what lets ReplayGain raise a track as well as lower it.
  private static let headroomDb = 6.0
  /// How far ahead of the end a gapless successor is scheduled, in wall-clock time.
  private static let armAheadMs = 3000.0
  private static let fadeStepMs = 30

  /// Opened ahead of time by `preload` and handed to `load` when the URL matches.
  private var preloaded: (url: URL, file: AVAudioFile)?
  /// Armed by `setNext`, already opened.
  private var next: (item: NextTrackItem, file: AVAudioFile)?
  /// The armed track is scheduled on the idle deck, waiting for the active one to run out.
  private var otherDeckArmed = false
  private var fade: Fade?
  private var crossfadeMs: Double = 0
  private var gapless = true
  private var rate: Double = 1
  private var equalizer = EqualizerConfig()

  private var tokens: UInt64 = 0
  /// Last position computed. Used while paused and whenever the render clock is unavailable.
  private var lastFrame: AVAudioFramePosition = 0

  private var state: PlayerState = .idle
  private var ticker: DispatchSourceTimer?
  private var sessionActive = false
  /// Whether the interruption in progress stopped running playback, which is what decides if its
  /// end resumes. Pausing is the system's doing; resuming something the user had paused is not.
  private var interruptedWhilePlaying = false
  private var observers: [NSObjectProtocol] = []

  // Called on the audio queue. The module marshals them to the JS side.
  var onState: ((PlayerState) -> Void)?
  var onPosition: ((PlayerPosition) -> Void)?
  var onEnded: (() -> Void)?
  /// The engine moved on to the armed track by itself.
  var onAdvanced: ((NextTrackItem) -> Void)?
  /// Fired when the lock screen's picture of playback changes: a new state, or a seek that moved
  /// the position out from under iOS's own extrapolation. Deliberately not driven by the position
  /// ticker — MPNowPlayingInfoCenter works out elapsed time from the rate on its own, and only
  /// needs telling when that arithmetic would be wrong.
  var onNowPlaying: ((PlayerState, PlayerPosition) -> Void)?
  /// Fired after the player has already reacted to an interruption or route change, to say why
  /// playback moved without a command.
  var onRouteChange: ((PlayerRouteEvent) -> Void)?

  init() {
    for deck in decks {
      engine.attach(deck.node)
    }
    engine.attach(sources)
    engine.attach(timePitch)
    engine.attach(eq)
    // Each deck is connected again with its file's own processing format on every load, which is
    // what keeps mono and 48 kHz files at the right speed; the sources mixer converts them all to
    // one format for the effects after it.
    let seed = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2)!
    for deck in decks {
      engine.connect(deck.node, to: sources, fromBus: 0, toBus: deck.bus, format: seed)
      deck.format = seed
    }
    let outputRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
    let graph = AVAudioFormat(standardFormatWithSampleRate: outputRate > 0 ? outputRate : 44_100, channels: 2)!
    engine.connect(sources, to: timePitch, format: graph)
    engine.connect(timePitch, to: eq, format: graph)
    engine.connect(eq, to: engine.mainMixerNode, format: graph)
    timePitch.bypass = true
    applyEqualizerLocked()
    configureSessionCategory()
    observeSystemEvents()
  }

  // MARK: - Transport

  /// Opening the file is the only slow step, so it happens before taking the queue: that keeps
  /// every queue-held critical section short enough for `currentState()` never to block JS.
  func load(url: URL, startMs: Double, autoplay: Bool, gainDb: Double) throws {
    let cached: AVAudioFile? = queue.sync { () -> AVAudioFile? in
      guard let pre = preloaded, pre.url == url else { return nil }
      return pre.file
    }
    let opened = try cached ?? openFile(url)

    try queue.sync {
      endFadeLocked()
      for deck in decks {
        invalidate(deck)
        deck.file = nil
      }
      next = nil
      otherDeckArmed = false
      stopTicker()
      preloaded = nil
      setState(.loading)

      let deck = decks[active]
      deck.file = opened
      deck.gain = Self.nodeGain(gainDb)
      connect(deck, opened.processingFormat)
      deck.node.volume = deck.gain

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
  /// work.
  func preload(url: URL) {
    queue.async { [weak self] in
      guard let self, let opened = try? AVAudioFile(forReading: url) else { return }
      self.preloaded = (url, opened)
    }
  }

  /// Arms (or with nil, disarms) the track that follows the current one. The same file armed again
  /// under a new key, which is what a queue edit before it looks like, keeps its arming.
  func setNext(_ item: NextTrackItem?) {
    let sameFile: Bool = queue.sync { next != nil && next?.item.url == item?.url }
    let opened: AVAudioFile? = sameFile ? nil : item.flatMap { try? AVAudioFile(forReading: $0.url) }
    queue.sync {
      if let item, let armed = next, armed.item.url == item.url {
        next = (item, armed.file)
        return
      }
      disarmLocked()
      if let item, let opened {
        next = (item, opened)
        if state == .playing {
          armIfDueLocked()
        }
      }
    }
  }

  func setTransition(crossfadeMs: Double, gapless: Bool) {
    queue.sync {
      let fadeMs = max(0, crossfadeMs)
      guard fadeMs != self.crossfadeMs || gapless != self.gapless else { return }
      self.crossfadeMs = fadeMs
      self.gapless = gapless
      // Whatever was scheduled under the old rules is dropped; the ticker arms again under the new.
      dropArmingLocked()
    }
  }

  func play() throws {
    try queue.sync {
      // Nothing loaded is not a fault: a lock screen command can land just as the queue empties.
      // FakeEngine does nothing here too, and the two engines have to behave the same.
      guard decks[active].file != nil, state != .playing else { return }
      // Playing after the file ran out starts it over rather than resuming at the end.
      if state == .ended {
        invalidate(decks[active])
        guard schedule(from: 0) else { return }
      }
      try startPlayback()
    }
  }

  func pause() {
    queue.sync { pauseLocked() }
  }

  func stop() {
    queue.sync {
      endFadeLocked()
      for deck in decks {
        invalidate(deck)
        deck.file = nil
        deck.startFrame = 0
        deck.nodeOffset = 0
      }
      next = nil
      otherDeckArmed = false
      stopTicker()
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
      guard let opened = decks[active].file else { return }
      endFadeLocked()
      let wasPlaying = state == .playing
      let wasEnded = state == .ended
      // Stopping the node drops a gapless successor queued on it; it is scheduled again if the
      // new position is near the end. A successor waiting on the other deck is left where it is.
      invalidate(decks[active])
      // Dragging the seek bar to the far right lands here: nothing left to schedule, so the
      // track reports as finished rather than resuming into silence.
      guard schedule(from: clampFrames(framesFromMs(ms, in: opened), in: opened)) else { return }
      if wasPlaying {
        decks[active].node.play()
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
      self.rate = min(max(rate, 1.0 / 32.0), 32.0)
      timePitch.rate = Float(self.rate)
      updateTimePitchBypass()
    }
  }

  func setPitch(semitones: Double) {
    queue.sync {
      timePitch.pitch = Float(min(max(semitones, -24), 24) * 100)
      updateTimePitchBypass()
    }
  }

  func setEqualizer(_ config: EqualizerConfig) {
    queue.sync {
      equalizer = config
      applyEqualizerLocked()
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
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
    }
    observers = []
    queue.sync {
      endFadeLocked()
      for deck in decks {
        invalidate(deck)
        deck.file = nil
      }
      next = nil
      stopTicker()
      if engine.isRunning {
        engine.stop()
      }
      deactivateSession()
      preloaded = nil
    }
    onState = nil
    onPosition = nil
    onEnded = nil
    onAdvanced = nil
    onNowPlaying = nil
    onRouteChange = nil
  }

  // MARK: - Scheduling

  private func pauseLocked() {
    guard state == .playing else { return }
    // A crossfade is finished off rather than paused halfway: resuming two ramps is not worth it.
    endFadeLocked()
    lastFrame = currentFrame()
    // Only the node is paused; the engine keeps rendering silence. That preserves the node's
    // sample clock, so resuming is instant and the position stays correct across a pause.
    decks[active].node.pause()
    stopTicker()
    setState(.paused)
    emitPosition()
  }

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
    decks[active].node.play()
    setState(.playing)
    startTicker()
  }

  private func nextToken() -> UInt64 {
    tokens &+= 1
    return tokens
  }

  /// Connects a deck for a file's format, skipping the call when it already is. A stopped node
  /// may be reconnected while the engine runs: it sits upstream of a mixer.
  private func connect(_ deck: Deck, _ format: AVAudioFormat) {
    if let current = deck.format, Self.sameFormat(current, format) { return }
    engine.connect(deck.node, to: sources, fromBus: 0, toBus: deck.bus, format: format)
    deck.format = format
  }

  private static func sameFormat(_ a: AVAudioFormat, _ b: AVAudioFormat) -> Bool {
    a.sampleRate == b.sampleRate && a.channelCount == b.channelCount
      && a.commonFormat == b.commonFormat && a.isInterleaved == b.isInterleaved
  }

  /// Schedules the active deck's file from `startFrame`. Returns false when that left nothing to
  /// play, in which case the track has already been reported as finished.
  @discardableResult
  private func schedule(from startFrame: AVAudioFramePosition) -> Bool {
    lastFrame = startFrame
    guard scheduleFresh(decks[active], from: startFrame) else {
      finishNaturally()
      return false
    }
    return true
  }

  /// Schedules a stopped deck's file from `startFrame`, as its only segment. No side effects
  /// beyond the deck; false if there is nothing left to play.
  private func scheduleFresh(_ deck: Deck, from startFrame: AVAudioFramePosition) -> Bool {
    guard let file = deck.file else { return false }
    deck.startFrame = startFrame
    deck.nodeOffset = 0
    deck.queued = nil
    let remaining = file.length - startFrame
    guard remaining > 0 else {
      deck.current = nil
      deck.segmentFrames = 0
      return false
    }
    deck.segmentFrames = remaining
    let token = nextToken()
    deck.current = token
    scheduleSegment(on: deck, file: file, from: startFrame, frames: remaining, token: token)
    return true
  }

  private func scheduleSegment(
    on deck: Deck, file: AVAudioFile, from startFrame: AVAudioFramePosition,
    frames: AVAudioFramePosition, token: UInt64
  ) {
    let index = Int(deck.bus)
    deck.node.scheduleSegment(
      file,
      startingFrame: startFrame,
      frameCount: AVAudioFrameCount(min(frames, AVAudioFramePosition(AVAudioFrameCount.max))),
      at: nil,
      completionCallbackType: .dataPlayedBack
    ) { [weak self] _ in
      // Arrives on an engine-internal thread, and also fires when `stop()` discards the segment,
      // which is why every segment carries a token.
      guard let self else { return }
      self.queue.async { self.segmentFinished(deck: index, token: token) }
    }
  }

  /// Discards whatever a deck has scheduled and makes its completion handlers no-ops.
  private func invalidate(_ deck: Deck) {
    deck.current = nil
    deck.queued = nil
    deck.node.stop()
  }

  private func segmentFinished(deck index: Int, token: UInt64) {
    let deck = decks[index]
    guard deck.current == token else { return }
    guard index == active else {
      // The outgoing side of a crossfade ran out before the ramp did; the fade tidies up.
      deck.current = nil
      return
    }
    if let queued = deck.queued, let armed = next {
      // Gapless on this node: the successor is already playing. The node's clock carries on
      // counting, so the new file's frames start where the old segment's ended.
      deck.nodeOffset += deck.segmentFrames
      deck.file = queued.file
      deck.startFrame = 0
      deck.segmentFrames = queued.file.length
      deck.current = queued.token
      deck.queued = nil
      deck.gain = Self.nodeGain(armed.item.gainDb)
      deck.node.volume = deck.gain
      advanced(to: armed.item)
      return
    }
    if otherDeckArmed, let armed = next {
      otherDeckArmed = false
      invalidate(deck)
      active = 1 - index
      decks[active].node.play()
      advanced(to: armed.item)
      return
    }
    if let armed = next, gapless || crossfadeMs > 0 {
      // Armed, but the track ran out before the ticker got to it (a very short song, or a seek
      // to the last moment): start the next one on the other deck straight away.
      if startOnOtherDeck(armed, volume: nil) {
        advanced(to: armed.item)
        return
      }
    }
    finishNaturally()
  }

  /// Loads an armed track onto the idle deck and starts it, making it the active one. With a
  /// `volume` it starts at that level (0 for a crossfade), otherwise at its gain. The outgoing
  /// deck is stopped unless it is to keep playing under a crossfade.
  private func startOnOtherDeck(
    _ armed: (item: NextTrackItem, file: AVAudioFile), volume: Float?, keepOutgoing: Bool = false
  ) -> Bool {
    let outgoing = active
    let deck = decks[1 - outgoing]
    invalidate(deck)
    deck.file = armed.file
    deck.gain = Self.nodeGain(armed.item.gainDb)
    connect(deck, armed.file.processingFormat)
    deck.node.volume = volume ?? deck.gain
    guard scheduleFresh(deck, from: 0) else {
      deck.file = nil
      return false
    }
    if !keepOutgoing {
      invalidate(decks[outgoing])
    }
    active = 1 - outgoing
    deck.node.play()
    return true
  }

  private func advanced(to item: NextTrackItem) {
    next = nil
    lastFrame = 0
    emitPosition()
    onAdvanced?(item)
    emitNowPlaying()
  }

  /// Called from the ticker while playing: schedules the armed track once the end is near enough.
  private func armIfDueLocked() {
    guard state == .playing, fade == nil, let armed = next else { return }
    let deck = decks[active]
    guard let file = deck.file else { return }
    let sampleRate = file.processingFormat.sampleRate
    guard sampleRate > 0 else { return }
    let remainingMs = Double(max(0, file.length - lastFrame)) / sampleRate * 1000 / rate

    if crossfadeMs > 0 {
      if remainingMs <= crossfadeMs {
        startCrossfade(armed, remainingMs: remainingMs)
      }
      return
    }
    guard gapless, deck.queued == nil, !otherDeckArmed, remainingMs <= Self.armAheadMs else { return }
    if let format = deck.format, Self.sameFormat(format, armed.file.processingFormat), deck.current != nil {
      let token = nextToken()
      deck.queued = (token, armed.file)
      scheduleSegment(on: deck, file: armed.file, from: 0, frames: armed.file.length, token: token)
    } else {
      let other = decks[1 - active]
      invalidate(other)
      other.file = armed.file
      other.gain = Self.nodeGain(armed.item.gainDb)
      connect(other, armed.file.processingFormat)
      other.node.volume = other.gain
      if scheduleFresh(other, from: 0) {
        otherDeckArmed = true
      } else {
        other.file = nil
      }
    }
  }

  private func startCrossfade(_ armed: (item: NextTrackItem, file: AVAudioFile), remainingMs: Double) {
    let outgoing = active
    let incomingSeconds = Double(armed.file.length) / max(1, armed.file.processingFormat.sampleRate)
    // Never longer than what is left of this track, nor more than half of the next.
    let duration = min(crossfadeMs, remainingMs, incomingSeconds * 1000 / rate / 2)
    guard startOnOtherDeck(armed, volume: 0, keepOutgoing: true) else {
      next = nil
      return
    }
    let timer = DispatchSource.makeTimerSource(queue: queue)
    fade = Fade(outgoing: outgoing, startNs: DispatchTime.now().uptimeNanoseconds, durationMs: max(duration, 1), timer: timer)
    timer.schedule(deadline: .now(), repeating: .milliseconds(Self.fadeStepMs))
    timer.setEventHandler { [weak self] in
      self?.fadeStep()
    }
    timer.resume()
    advanced(to: armed.item)
  }

  private func fadeStep() {
    guard let fade else { return }
    let elapsedMs = Double(DispatchTime.now().uptimeNanoseconds - fade.startNs) / 1_000_000
    let t = min(1, elapsedMs / fade.durationMs)
    // Equal power, so the overlap does not dip in loudness halfway.
    let outgoing = decks[fade.outgoing]
    let incoming = decks[active]
    outgoing.node.volume = outgoing.gain * Float(cos(t * .pi / 2))
    incoming.node.volume = incoming.gain * Float(sin(t * .pi / 2))
    if t >= 1 {
      endFadeLocked()
    }
  }

  /// Ends a crossfade at once: the outgoing deck stops and the incoming one plays at full level.
  private func endFadeLocked() {
    guard let fade else { return }
    fade.timer.cancel()
    self.fade = nil
    let outgoing = decks[fade.outgoing]
    invalidate(outgoing)
    outgoing.file = nil
    decks[active].node.volume = decks[active].gain
  }

  /// Takes back whatever has been scheduled for the armed track, keeping it armed. A successor
  /// queued on the active node can only go by stopping the node, so what is playing is scheduled
  /// again from where it is; this only happens in a track's last seconds.
  private func dropArmingLocked() {
    let deck = decks[active]
    if deck.queued != nil {
      let wasPlaying = state == .playing
      if wasPlaying {
        lastFrame = currentFrame()
      }
      invalidate(deck)
      if scheduleFresh(deck, from: lastFrame) {
        if wasPlaying {
          deck.node.play()
        }
      } else {
        finishNaturally()
      }
    }
    if otherDeckArmed {
      let other = decks[1 - active]
      invalidate(other)
      other.file = nil
      otherDeckArmed = false
    }
  }

  private func disarmLocked() {
    dropArmingLocked()
    next = nil
  }

  /// Schedules again from the current position with the nodes stopped. For when the system stopped
  /// the engine underneath the nodes: after that neither their schedules nor their clocks can be
  /// trusted, and starting from a fresh segment is what `startPlayback` then expects. The armed
  /// track stays armed and is scheduled again by the ticker. Returns false if that left nothing
  /// to play, as `schedule` does.
  @discardableResult
  private func park() -> Bool {
    if state == .playing {
      lastFrame = currentFrame()
    }
    stopTicker()
    endFadeLocked()
    if otherDeckArmed {
      let other = decks[1 - active]
      invalidate(other)
      other.file = nil
      otherDeckArmed = false
    }
    invalidate(decks[active])
    let scheduled = schedule(from: lastFrame)
    if scheduled {
      emitPosition()
    }
    return scheduled
  }

  private func finishNaturally() {
    let deck = decks[active]
    // Before `stop()`, so the callback that stop itself triggers is already stale.
    invalidate(deck)
    stopTicker()
    if let opened = deck.file {
      deck.startFrame = opened.length
      deck.nodeOffset = 0
      lastFrame = opened.length
    }
    emitPosition()
    setState(.ended)
    onEnded?()
  }

  // MARK: - Effects

  private func updateTimePitchBypass() {
    timePitch.bypass = rate == 1 && timePitch.pitch == 0
  }

  /// ReplayGain as a node volume under the fixed headroom, capped at the most a node can give.
  private static func nodeGain(_ gainDb: Double) -> Float {
    Float(min(1, pow(10, (gainDb - headroomDb) / 20)))
  }

  private func applyEqualizerLocked() {
    let on = equalizer.enabled
    for (i, frequency) in Self.frequencies.enumerated() {
      let band = eq.bands[i]
      band.filterType = .parametric
      band.frequency = frequency
      band.bandwidth = 1
      let gain = i < equalizer.gains.count ? equalizer.gains[i] : 0
      band.gain = Float(min(max(gain, -Self.bandRangeDb), Self.bandRangeDb))
      band.bypass = !on || gain == 0
    }
    let shelf = eq.bands[Self.frequencies.count]
    shelf.filterType = .lowShelf
    shelf.frequency = Self.bassShelfHz
    shelf.gain = Float(min(max(equalizer.bassBoost, 0), 1)) * Self.bassBoostMaxDb
    shelf.bypass = !on || equalizer.bassBoost <= 0
    // The headroom stays whether or not the equalizer is on: ReplayGain relies on it.
    let preamp = on ? min(max(equalizer.preampDb, -Self.bandRangeDb), Self.bandRangeDb) : 0
    eq.globalGain = Float(preamp + Self.headroomDb)
  }

  // MARK: - Position

  private func currentFrame() -> AVAudioFramePosition {
    let deck = decks[active]
    guard let opened = deck.file else { return 0 }
    guard
      let nodeTime = deck.node.lastRenderTime,
      let playerTime = deck.node.playerTime(forNodeTime: nodeTime)
    else {
      return lastFrame
    }
    return clampFrames(deck.startFrame + playerTime.sampleTime - deck.nodeOffset, in: opened)
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
      self.armIfDueLocked()
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
    guard let opened = decks[active].file else { return PlayerPosition(positionMs: 0, durationMs: 0) }
    return PlayerPosition(
      positionMs: msFromFrames(lastFrame, in: opened),
      durationMs: msFromFrames(opened.length, in: opened)
    )
  }

  private func emitPosition() {
    guard decks[active].file != nil else { return }
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

  // MARK: - Interruptions and routes

  /// Notifications post on whatever thread the session or engine happens to use, so each observer
  /// reads its payload where it lands and hops onto `queue` before touching any state.
  private func observeSystemEvents() {
    let center = NotificationCenter.default
    let session = AVAudioSession.sharedInstance()
    observers = [
      center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: session, queue: nil
      ) { [weak self] note in
        guard
          let self,
          let rawType = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else { return }
        let rawOptions = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let shouldResume = AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
        self.queue.async {
          switch type {
          case .began: self.interruptionBegan()
          case .ended: self.interruptionEnded(shouldResume: shouldResume)
          @unknown default: break
          }
        }
      },
      center.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: session, queue: nil
      ) { [weak self] note in
        guard
          let self,
          let rawReason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason)
        else { return }
        self.queue.async { self.routeChanged(reason) }
      },
      center.addObserver(
        forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
      ) { [weak self] _ in
        guard let self else { return }
        self.queue.async { self.configurationChanged() }
      },
    ]
  }

  /// A call, Siri, an alarm, or another app taking the session. By the time this arrives the
  /// system has already stopped the engine and deactivated the session; what is left is to make
  /// the state say so, and to note that the next play has to activate the session again.
  private func interruptionBegan() {
    sessionActive = false
    interruptedWhilePlaying = state == .playing
    // Paused too: its node sat in an engine that has now been stopped. Never ended or idle, where
    // rescheduling at the end of the file would report the track finished a second time.
    if state == .playing || state == .paused, park() {
      setState(.paused)
    }
    onRouteChange?(.interruptionBegan)
  }

  /// iOS only sets `shouldResume` when resuming is appropriate: after a call, not after the user
  /// started music in another app. A failed restart leaves the player paused, which is also what
  /// the user sees, so there is nothing further to report.
  private func interruptionEnded(shouldResume: Bool) {
    let resume = shouldResume && interruptedWhilePlaying && state == .paused
    interruptedWhilePlaying = false
    if resume {
      try? startPlayback()
    }
    onRouteChange?(.interruptionEnded)
  }

  private func routeChanged(_ reason: AVAudioSession.RouteChangeReason) {
    switch reason {
    case .oldDeviceUnavailable:
      // Headphones pulled or Bluetooth gone. iOS carries on through the speaker unless the app
      // stops, and a music player is expected to stop.
      pauseLocked()
      onRouteChange?(.unplugged)
    case .newDeviceAvailable:
      // Resuming on plug is a Musicolet setting, off by default, so it is the queue's call.
      onRouteChange?(.connected)
    default:
      break
    }
  }

  /// A new output with a different sample rate or channel count, Bluetooth connecting for one,
  /// makes the engine stop itself. The graph survives but playback does not, and without this
  /// the state would still read playing over silence.
  private func configurationChanged() {
    guard state == .playing || state == .paused else { return }
    let wasPlaying = state == .playing
    guard park(), wasPlaying else { return }
    try? startPlayback()
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
