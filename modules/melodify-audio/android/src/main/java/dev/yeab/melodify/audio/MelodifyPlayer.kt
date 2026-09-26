package dev.yeab.melodify.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.RenderersFactory
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.MediaCodecAudioRenderer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** Mirrors `PlaybackState` in src/player/engine.ts. The raw values cross the bridge as-is. */
internal enum class PlayerState(val raw: String) {
  IDLE("idle"), LOADING("loading"), PLAYING("playing"), PAUSED("paused"), ENDED("ended"), ERROR("error")
}

/** Mirrors `NowPlayingMeta` in src/player/engine.ts, plus the favorite the notification shows. */
internal data class NowPlayingMeta(
  val title: String = "",
  val artist: String? = null,
  val album: String? = null,
  val durationMs: Double? = null,
  val artUri: String? = null,
  val favorite: Boolean = false,
)

/** What `setNext` armed. Mirrors `NextTrack` in src/player/engine.ts. */
internal data class NextTrackItem(val uri: String, val meta: NowPlayingMeta, val gainDb: Double, val key: String)

/** What the notification and lock screen show, read on the audio thread. */
internal data class NowPlayingSnapshot(
  val meta: NowPlayingMeta?,
  val state: PlayerState,
  val positionMs: Long,
  val durationMs: Long,
  val rate: Float,
  /** Changes with every new track, so the session can tell one track from the next. */
  val trackId: Long,
  /** Playing, or opening a file that will play once ready: the notification keeps its pause button. */
  val playing: Boolean,
)

/**
 * ExoPlayer behind the `PlayerEngine` contract, the Android twin of ios/MelodifyPlayer.swift.
 *
 * Two decks, each an ExoPlayer with its own audio sink and equalizer (GainEqProcessor). One is
 * active at a time. When the queue arms a next track (`setNext`), the end of the current one moves
 * straight on to it, without a round trip to JS:
 *
 * - Gapless: the next file is added to the active deck's playlist, and ExoPlayer runs from one into
 *   the other sample-accurately, trimming the encoder delay and padding MP3 and AAC files carry.
 * - Gapless, where the next file needs a different ReplayGain raise: that raise is applied to
 *   audio decoded ahead of what is heard, so it cannot change at the join. The file waits on the
 *   other deck instead, which starts the moment the active one runs out.
 * - Crossfade: the other deck starts under the end of the active one and the two are ramped.
 *
 * `advanced` then tells JS which track is now current; with nothing armed the end is `ended`.
 *
 * ReplayGain that lowers a track is the deck's volume, which acts on what is being heard, so it
 * changes exactly at a gapless join; a raise, up to 6 dB, is the equalizer's gain.
 *
 * Every ExoPlayer call happens on one audio thread. The module's functions post to it; the few
 * that answer synchronously (`state`, `position`) wait for it.
 */
@OptIn(UnstableApi::class)
internal class MelodifyPlayer(private val context: Context) {
  private val thread = HandlerThread("MelodifyAudio", Process.THREAD_PRIORITY_AUDIO).apply { start() }
  val looper: Looper = thread.looper
  private val handler = Handler(looper)
  private val equalizer = EqualizerState()
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private lateinit var decks: Array<Deck>
  private var active = 0

  @Volatile private var state = PlayerState.IDLE
  /** Armed by `setNext`. */
  private var next: NextTrackItem? = null
  private var arming = Arming.NONE
  private var fade: Fade? = null
  private var crossfadeMs = 0.0
  private var gapless = true
  private var rate = 1f
  private var pitchSemitones = 0.0
  private var skipSilence = false
  private var userVolume = 1f
  /** Lowered while another app briefly talks over the music, on the versions that do not duck for us. */
  private var duck = 1f
  private var pendingLoad: PendingLoad? = null
  /** The file was played to the end (or sought there); the position reads as its length. */
  private var atEnd = false
  private var trackId = 0L

  private var hasFocus = false
  /** Whether the interruption in progress stopped running playback, which decides if its end resumes. */
  private var interruptedWhilePlaying = false
  private var devicesPrimed = false

  // Called on the audio thread.
  var onState: ((PlayerState) -> Unit)? = null
  var onPosition: ((Double, Double) -> Unit)? = null
  var onEnded: (() -> Unit)? = null
  var onAdvanced: ((NextTrackItem) -> Unit)? = null
  var onError: ((String) -> Unit)? = null
  var onRouteChange: ((String, Boolean) -> Unit)? = null
  /** The notification's picture of playback changed: a state, a track, a seek, the speed. */
  var onNowPlaying: (() -> Unit)? = null

  private enum class Arming { NONE, PLAYLIST, OTHER_DECK }

  private class Fade(val outgoing: Int, val startedAt: Long, val durationMs: Double)

  private class PendingLoad(val deck: Int, var autoplay: Boolean, val done: (Throwable?) -> Unit, val timeout: Runnable)

  private inner class Deck(val index: Int) {
    val processor = GainEqProcessor(equalizer)
    val exo: ExoPlayer = buildExo(processor)
    var meta: NowPlayingMeta? = null
    var gainDb = 0.0
    var fadeLevel = 1f

    fun setGain(db: Double) {
      gainDb = db
      processor.boostDb = boostOf(db)
      applyVolume()
    }

    fun applyVolume() {
      val cut = 10.0.pow(min(gainDb, 0.0) / 20).toFloat()
      exo.volume = (cut * fadeLevel * userVolume * duck).coerceIn(0f, 1f)
    }

    fun clear() {
      exo.stop()
      exo.clearMediaItems()
      meta = null
      fadeLevel = 1f
    }

    init {
      exo.addListener(object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) = deckStateChanged(this@Deck, playbackState)

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
          if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) deckAdvancedInPlaylist(this@Deck)
        }

        override fun onPlayerError(error: PlaybackException) = deckFailed(this@Deck, error)
      })
    }
  }

  /** Playing, or opening a file that will play once ready. */
  private fun isPlayingLocked(): Boolean = state == PlayerState.PLAYING || pendingLoad?.autoplay == true

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != AudioManager.ACTION_AUDIO_BECOMING_NOISY) return
      // Headphones pulled or Bluetooth gone: Android carries on through the speaker unless the
      // app stops, and a music player is expected to stop.
      val wasPlaying = isPlayingLocked()
      pauseLocked()
      onRouteChange?.invoke("unplugged", wasPlaying)
    }
  }

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      // The first call lists what was already connected when the callback was registered.
      if (!devicesPrimed) {
        devicesPrimed = true
        return
      }
      if (addedDevices.any { it.isSink && it.type in HEADPHONES }) {
        // Resuming on plug is a Musicolet setting, off by default, so it is the queue's call.
        onRouteChange?.invoke("connected", state == PlayerState.PLAYING)
      }
    }
  }

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change -> handler.post { focusChanged(change) } }

  private val focusRequest: AudioFocusRequest? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      // Android ducks the music under a navigation prompt by itself; it only asks the app to act
      // on losses that should pause.
      .setWillPauseWhenDucked(false)
      .setOnAudioFocusChangeListener(focusListener, handler)
      .build()
  } else {
    null
  }

  private val ticker = object : Runnable {
    override fun run() {
      if (state != PlayerState.PLAYING) return
      emitPosition()
      crossfadeIfDue()
      handler.postDelayed(this, TICK_MS)
    }
  }

  private val fadeStep = object : Runnable {
    override fun run() {
      val current = fade ?: return
      val t = min(1.0, (SystemClock.elapsedRealtime() - current.startedAt) / current.durationMs)
      // Equal power, so the overlap does not dip in loudness halfway.
      decks[current.outgoing].fadeLevel = cos(t * PI / 2).toFloat()
      decks[current.outgoing].applyVolume()
      decks[active].fadeLevel = sin(t * PI / 2).toFloat()
      decks[active].applyVolume()
      if (t >= 1) endFadeLocked() else handler.postDelayed(this, FADE_STEP_MS)
    }
  }

  init {
    runSync {
      decks = arrayOf(Deck(0), Deck(1))
      ContextCompat.registerReceiver(
        context, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), null, handler,
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      audioManager.registerAudioDeviceCallback(deviceCallback, handler)
    }
  }

  private fun buildExo(processor: GainEqProcessor): ExoPlayer {
    // Audio only: one renderer, whose sink runs this deck's equalizer before the speed change.
    val renderers = RenderersFactory { eventHandler, _, audioListener, _, _ ->
      val sink = DefaultAudioSink.Builder(context).setAudioProcessors(arrayOf<AudioProcessor>(processor)).build()
      arrayOf(MediaCodecAudioRenderer(context, MediaCodecSelector.DEFAULT, eventHandler, audioListener, sink))
    }
    // Seeking in VBR MP3s without a table of contents is otherwise slow, or refused.
    val extractors = DefaultExtractorsFactory().setConstantBitrateSeekingEnabled(true)
    return ExoPlayer.Builder(context, renderers, DefaultMediaSourceFactory(context, extractors))
      .setLooper(looper)
      .setAudioAttributes(
        AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
        // Focus is taken once for both decks, below; each deck asking would interrupt the other.
        false,
      )
      .setHandleAudioBecomingNoisy(false)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build()
  }

  // Transport.

  fun load(uri: String, meta: NowPlayingMeta, startMs: Double, autoplay: Boolean, gainDb: Double, done: (Throwable?) -> Unit) {
    handler.post {
      endFadeLocked()
      finishPendingLoad(null)
      for (deck in decks) deck.clear()
      next = null
      arming = Arming.NONE
      atEnd = false
      stopTicker()
      trackId += 1
      val deck = decks[active]
      deck.meta = meta
      deck.fadeLevel = 1f
      deck.setGain(gainDb)
      deck.exo.playbackParameters = parameters()
      deck.exo.setMediaItem(mediaItem(uri, "current"), startMs.toLong().coerceAtLeast(0))
      val play = autoplay && requestFocus()
      deck.exo.playWhenReady = play
      setState(PlayerState.LOADING)
      val timeout = Runnable { finishPendingLoad(null) }
      pendingLoad = PendingLoad(deck.index, play, done, timeout)
      // A file that never becomes ready still lets the queue carry on.
      handler.postDelayed(timeout, LOAD_TIMEOUT_MS)
      deck.exo.prepare()
    }
  }

  /** Arms, or with null disarms, the track that follows the current one. */
  fun setNext(item: NextTrackItem?) {
    handler.post {
      val armed = next
      // The same file armed again under a new key, which is what a queue edit before it looks
      // like, keeps its arming; the key, meta and gain are taken from the new one.
      if (item != null && armed != null && item.uri == armed.uri && boostOf(item.gainDb) == boostOf(armed.gainDb)) {
        next = item
        return@post
      }
      next = item
      armLocked()
    }
  }

  fun setTransition(crossfadeMs: Double, gapless: Boolean) {
    handler.post {
      val fadeMs = crossfadeMs.coerceAtLeast(0.0)
      if (fadeMs == this.crossfadeMs && gapless == this.gapless) return@post
      this.crossfadeMs = fadeMs
      this.gapless = gapless
      armLocked()
    }
  }

  fun play() {
    handler.post {
      val deck = decks[active]
      // Nothing loaded is not a fault: a lock screen command can land just as the queue empties.
      if (deck.exo.mediaItemCount == 0 || state == PlayerState.PLAYING) return@post
      if (!requestFocus()) return@post
      // Still opening: it starts once ready, which is when the load reports playing.
      pendingLoad?.let {
        it.autoplay = true
        deck.exo.play()
        return@post
      }
      // Playing after the file ran out starts it over rather than resuming at the end.
      if (state == PlayerState.ENDED || atEnd) {
        atEnd = false
        deck.exo.seekTo(0, 0)
      }
      if (deck.exo.playbackState == Player.STATE_IDLE) deck.exo.prepare()
      deck.exo.play()
      setState(PlayerState.PLAYING)
      startTicker()
    }
  }

  fun pause() {
    handler.post { pauseLocked() }
  }

  fun stop() {
    handler.post {
      endFadeLocked()
      finishPendingLoad(null)
      for (deck in decks) deck.clear()
      next = null
      arming = Arming.NONE
      atEnd = false
      stopTicker()
      abandonFocus()
      setState(PlayerState.IDLE)
    }
  }

  fun seek(ms: Double) {
    handler.post {
      val deck = decks[active]
      if (deck.exo.mediaItemCount == 0) return@post
      endFadeLocked()
      val duration = durationOf(deck)
      // Dragging the seek bar to the far right lands here: the track reports as finished rather
      // than resuming into silence, as it does on iOS.
      if (duration > 0 && ms >= duration) {
        finishNaturally()
        return@post
      }
      atEnd = false
      deck.exo.seekTo(0, ms.toLong().coerceAtLeast(0))
      if (state == PlayerState.ENDED) setState(PlayerState.PAUSED)
      onPosition?.invoke(ms.coerceAtLeast(0.0), duration.toDouble())
      // Seeking while playing leaves the state alone, so `setState` did not report this.
      onNowPlaying?.invoke()
    }
  }

  fun setRate(rate: Double) {
    handler.post {
      this.rate = rate.coerceIn(0.25, 4.0).toFloat()
      for (deck in decks) deck.exo.playbackParameters = parameters()
      onNowPlaying?.invoke()
    }
  }

  fun setPitch(semitones: Double) {
    handler.post {
      pitchSemitones = semitones.coerceIn(-24.0, 24.0)
      for (deck in decks) deck.exo.playbackParameters = parameters()
    }
  }

  fun setSkipSilence(enabled: Boolean) {
    handler.post {
      skipSilence = enabled
      for (deck in decks) deck.exo.skipSilenceEnabled = enabled
    }
  }

  fun setEqualizer(config: EqualizerConfig) {
    equalizer.set(config)
  }

  fun setVolume(volume: Double) {
    handler.post {
      userVolume = volume.coerceIn(0.0, 1.0).toFloat()
      for (deck in decks) deck.applyVolume()
    }
  }

  /** Fields present replace the current track's; the rest are kept. */
  fun updateNowPlaying(patch: (NowPlayingMeta) -> NowPlayingMeta) {
    handler.post {
      val deck = decks[active]
      val meta = deck.meta ?: return@post
      deck.meta = patch(meta)
      onNowPlaying?.invoke()
    }
  }

  fun currentState(): PlayerState = state

  fun currentPosition(): Pair<Double, Double> = runSync {
    val deck = decks[active]
    positionOf(deck).toDouble() to durationOf(deck).toDouble()
  }

  /** On the audio thread only: the session reads it from there. */
  fun snapshot(): NowPlayingSnapshot {
    val deck = decks[active]
    return NowPlayingSnapshot(deck.meta, state, positionOf(deck), durationOf(deck), rate, trackId, isPlayingLocked())
  }

  /** Playing or about to, readable from any thread: the service asks when the app is swiped away. */
  fun isActive(): Boolean = state == PlayerState.PLAYING || state == PlayerState.LOADING

  fun teardown() {
    runSync {
      endFadeLocked()
      finishPendingLoad(null)
      stopTicker()
      for (deck in decks) deck.exo.release()
      abandonFocus()
      try {
        context.unregisterReceiver(noisyReceiver)
      } catch (_: IllegalArgumentException) {
      }
      audioManager.unregisterAudioDeviceCallback(deviceCallback)
    }
    onState = null
    onPosition = null
    onEnded = null
    onAdvanced = null
    onError = null
    onRouteChange = null
    onNowPlaying = null
    thread.quitSafely()
  }

  /** Runs `body` on the audio thread and waits for it; runs it at once if already there. */
  fun <T> runSync(body: () -> T): T {
    if (Looper.myLooper() == looper) return body()
    var result: Result<T>? = null
    val latch = CountDownLatch(1)
    handler.post {
      result = runCatching(body)
      latch.countDown()
    }
    if (!latch.await(5, TimeUnit.SECONDS)) throw IOException("the audio thread did not answer")
    return result!!.getOrThrow()
  }

  fun post(body: () -> Unit) {
    handler.post(body)
  }

  // Deck events, on the audio thread.

  private fun deckStateChanged(deck: Deck, playbackState: Int) {
    val pending = pendingLoad
    if (pending != null && pending.deck == deck.index) {
      when (playbackState) {
        Player.STATE_READY -> {
          setState(if (pending.autoplay) PlayerState.PLAYING else PlayerState.PAUSED)
          if (pending.autoplay) startTicker()
          emitPosition()
          finishPendingLoad(null)
        }
        // A start position at or past the end has nothing to play; the track is reported finished.
        Player.STATE_ENDED -> {
          finishPendingLoad(null)
          finishNaturally()
        }
      }
      return
    }
    if (deck.index != active) return
    // Ready at last after the load gave up waiting (a slow card, a big file): the state catches up.
    if (playbackState == Player.STATE_READY && state == PlayerState.LOADING) {
      val playing = deck.exo.playWhenReady
      setState(if (playing) PlayerState.PLAYING else PlayerState.PAUSED)
      if (playing) startTicker()
      emitPosition()
      return
    }
    if (playbackState != Player.STATE_ENDED) return
    // The active file ran out by itself. A crossfade still sounding is finished off first.
    endFadeLocked()
    val armed = next
    if (armed != null && arming == Arming.OTHER_DECK) {
      val other = decks[1 - active]
      if (other.exo.mediaItemCount > 0) {
        // The armed file may have been armed again under a new key since the deck was made ready.
        other.meta = armed.meta
        other.setGain(armed.gainDb)
        other.exo.play()
        deck.clear()
        active = other.index
        arming = Arming.NONE
        advanced(armed)
        return
      }
    }
    // Armed, but nothing was scheduled in time (a crossfade whose moment the ticker missed, a
    // length that proved wrong): start it on the other deck now rather than stop, as iOS does.
    if (armed != null && (gapless || crossfadeMs > 0)) {
      val other = decks[1 - active]
      other.clear()
      other.meta = armed.meta
      other.setGain(armed.gainDb)
      other.exo.playbackParameters = parameters()
      other.exo.setMediaItem(mediaItem(armed.uri, armed.key))
      other.exo.prepare()
      other.exo.play()
      deck.clear()
      active = other.index
      arming = Arming.NONE
      advanced(armed)
      return
    }
    finishNaturally()
  }

  /** ExoPlayer moved into the armed file on the same deck, without a gap. */
  private fun deckAdvancedInPlaylist(deck: Deck) {
    if (deck.index != active) return
    val armed = next
    if (armed == null || arming != Arming.PLAYLIST) return
    // The finished file leaves the playlist, so the playing one is always the first.
    if (deck.exo.mediaItemCount > 1) deck.exo.removeMediaItem(0)
    arming = Arming.NONE
    deck.meta = armed.meta
    deck.setGain(armed.gainDb)
    advanced(armed)
  }

  private fun deckFailed(deck: Deck, error: PlaybackException) {
    val message = error.cause?.message ?: error.message ?: "playback failed"
    val pending = pendingLoad
    if (pending != null && pending.deck == deck.index) {
      setState(PlayerState.ERROR)
      finishPendingLoad(IOException("Cannot open audio file ($message)"))
      return
    }
    if (deck.index != active) {
      // The armed file on the other deck cannot be played: the end is then reported as `ended`.
      if (arming == Arming.OTHER_DECK) {
        deck.clear()
        arming = Arming.NONE
      }
      return
    }
    stopTicker()
    setState(PlayerState.ERROR)
    onError?.invoke(message)
  }

  // Arming and transitions.

  /** Sets up whatever `next`, the crossfade and gapless settings call for, dropping what was there. */
  private fun armLocked() {
    // The idle deck is the outgoing side of a crossfade until it ends; it cannot be armed over.
    endFadeLocked()
    val deck = decks[active]
    if (deck.exo.mediaItemCount > 1) deck.exo.removeMediaItems(1, deck.exo.mediaItemCount)
    if (arming == Arming.OTHER_DECK) decks[1 - active].clear()
    arming = Arming.NONE
    val armed = next ?: return
    // A crossfade is started by the ticker near the end; without gapless the end is `ended`.
    if (crossfadeMs > 0 || !gapless || deck.exo.mediaItemCount == 0) return
    if (boostOf(armed.gainDb) == boostOf(deck.gainDb)) {
      deck.exo.addMediaItem(mediaItem(armed.uri, armed.key))
      arming = Arming.PLAYLIST
      return
    }
    val other = decks[1 - active]
    other.clear()
    other.meta = armed.meta
    other.setGain(armed.gainDb)
    other.exo.playbackParameters = parameters()
    other.exo.setMediaItem(mediaItem(armed.uri, armed.key))
    other.exo.playWhenReady = false
    other.exo.prepare()
    arming = Arming.OTHER_DECK
  }

  private fun crossfadeIfDue() {
    val armed = next ?: return
    if (crossfadeMs <= 0 || fade != null || state != PlayerState.PLAYING) return
    val deck = decks[active]
    val duration = durationOf(deck)
    if (duration <= 0) return
    val remainingMs = (duration - positionOf(deck)).coerceAtLeast(0) / rate
    if (remainingMs > crossfadeMs) return
    val outgoing = active
    val incoming = decks[1 - outgoing]
    incoming.clear()
    incoming.meta = armed.meta
    incoming.fadeLevel = 0f
    incoming.setGain(armed.gainDb)
    incoming.exo.playbackParameters = parameters()
    incoming.exo.setMediaItem(mediaItem(armed.uri, armed.key))
    incoming.exo.prepare()
    incoming.exo.play()
    // Never longer than what is left of this track, nor more than half of the next.
    val nextMs = armed.meta.durationMs?.takeIf { it > 0 } ?: Double.MAX_VALUE
    val durationMs = minOf(crossfadeMs, remainingMs.toDouble(), nextMs / rate / 2).coerceAtLeast(1.0)
    fade = Fade(outgoing, SystemClock.elapsedRealtime(), durationMs)
    active = incoming.index
    handler.post(fadeStep)
    advanced(armed)
  }

  /** Ends a crossfade at once: the outgoing deck stops and the incoming one plays at full level. */
  private fun endFadeLocked() {
    val current = fade ?: return
    fade = null
    handler.removeCallbacks(fadeStep)
    decks[current.outgoing].clear()
    decks[active].fadeLevel = 1f
    decks[active].applyVolume()
  }

  private fun advanced(item: NextTrackItem) {
    next = null
    atEnd = false
    trackId += 1
    onPosition?.invoke(0.0, item.meta.durationMs ?: 0.0)
    onAdvanced?.invoke(item)
    onNowPlaying?.invoke()
  }

  private fun finishNaturally() {
    val deck = decks[active]
    stopTicker()
    if (deck.exo.mediaItemCount > 1) deck.exo.removeMediaItems(1, deck.exo.mediaItemCount)
    if (arming == Arming.OTHER_DECK) decks[1 - active].clear()
    arming = Arming.NONE
    deck.exo.pause()
    atEnd = true
    emitPosition()
    setState(PlayerState.ENDED)
    onEnded?.invoke()
  }

  private fun pauseLocked() {
    pendingLoad?.let {
      it.autoplay = false
      decks[active].exo.pause()
      return
    }
    if (state != PlayerState.PLAYING) return
    // A crossfade is finished off rather than paused halfway: resuming two ramps is not worth it.
    endFadeLocked()
    decks[active].exo.pause()
    stopTicker()
    setState(PlayerState.PAUSED)
    emitPosition()
  }

  private fun finishPendingLoad(error: Throwable?) {
    val pending = pendingLoad ?: return
    pendingLoad = null
    handler.removeCallbacks(pending.timeout)
    pending.done(error)
  }

  // Audio focus.

  private fun requestFocus(): Boolean {
    if (hasFocus) return true
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioManager.requestAudioFocus(focusRequest!!)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
    hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (hasFocus && duck != 1f) {
      duck = 1f
      for (deck in decks) deck.applyVolume()
    }
    return hasFocus
  }

  private fun abandonFocus() {
    if (!hasFocus) return
    hasFocus = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioManager.abandonAudioFocusRequest(focusRequest!!)
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusListener)
    }
  }

  /**
   * A call, an alarm, or another app playing. A permanent loss (the user started music elsewhere)
   * pauses for good; a brief one pauses and resumes afterwards if the music was running.
   */
  private fun focusChanged(change: Int) {
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasFocus = false
        duck = 1f
        for (deck in decks) deck.applyVolume()
        val wasPlaying = isPlayingLocked()
        interruptedWhilePlaying = false
        pauseLocked()
        onRouteChange?.invoke("interruptionBegan", wasPlaying)
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        hasFocus = false
        val wasPlaying = isPlayingLocked()
        interruptedWhilePlaying = wasPlaying
        pauseLocked()
        onRouteChange?.invoke("interruptionBegan", wasPlaying)
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        duck = DUCK_LEVEL
        for (deck in decks) deck.applyVolume()
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        hasFocus = true
        duck = 1f
        for (deck in decks) deck.applyVolume()
        val wasPlaying = interruptedWhilePlaying
        interruptedWhilePlaying = false
        val pending = pendingLoad
        if (wasPlaying && pending != null) {
          // Still opening: it plays once ready, which is when the load reports playing.
          pending.autoplay = true
          decks[active].exo.play()
        } else if (wasPlaying && state == PlayerState.PAUSED) {
          decks[active].exo.play()
          setState(PlayerState.PLAYING)
          startTicker()
        }
        onRouteChange?.invoke("interruptionEnded", wasPlaying)
      }
    }
  }

  // Helpers.

  private fun parameters(): PlaybackParameters = PlaybackParameters(rate, 2.0.pow(pitchSemitones / 12).toFloat())

  private fun mediaItem(uri: String, id: String): MediaItem =
    MediaItem.Builder().setUri(fileUri(uri)).setMediaId(id).build()

  private fun fileUri(uri: String): Uri = if (uri.startsWith("file:") || uri.startsWith("content:")) Uri.parse(uri) else Uri.fromFile(java.io.File(uri))

  private fun durationOf(deck: Deck): Long {
    val duration = deck.exo.duration
    if (duration != C.TIME_UNSET && duration > 0) return duration
    return deck.meta?.durationMs?.toLong() ?: 0
  }

  private fun positionOf(deck: Deck): Long {
    if (deck.exo.mediaItemCount == 0) return 0
    if (atEnd && deck.index == active) return durationOf(deck)
    return deck.exo.currentPosition.coerceAtLeast(0)
  }

  private fun emitPosition() {
    val deck = decks[active]
    if (deck.exo.mediaItemCount == 0) return
    onPosition?.invoke(positionOf(deck).toDouble(), durationOf(deck).toDouble())
  }

  private fun startTicker() {
    handler.removeCallbacks(ticker)
    handler.postDelayed(ticker, TICK_MS)
  }

  private fun stopTicker() {
    handler.removeCallbacks(ticker)
  }

  private fun setState(next: PlayerState) {
    if (next == state) return
    state = next
    onState?.invoke(next)
    onNowPlaying?.invoke()
  }

  companion object {
    /** The contract promises roughly 4 position updates a second while playing. */
    private const val TICK_MS = 250L
    private const val FADE_STEP_MS = 30L
    private const val LOAD_TIMEOUT_MS = 8000L
    private const val DUCK_LEVEL = 0.2f

    private val HEADPHONES = buildSet {
      add(AudioDeviceInfo.TYPE_WIRED_HEADSET)
      add(AudioDeviceInfo.TYPE_WIRED_HEADPHONES)
      add(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP)
      add(AudioDeviceInfo.TYPE_USB_HEADSET)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) add(AudioDeviceInfo.TYPE_HEARING_AID)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        add(AudioDeviceInfo.TYPE_BLE_HEADSET)
        add(AudioDeviceInfo.TYPE_BLE_SPEAKER)
      }
    }

    /** The part of a ReplayGain value that raises the track; the rest is the deck's volume. */
    fun boostOf(gainDb: Double): Double = gainDb.coerceIn(0.0, GainEqProcessor.MAX_BOOST_DB)
  }
}
