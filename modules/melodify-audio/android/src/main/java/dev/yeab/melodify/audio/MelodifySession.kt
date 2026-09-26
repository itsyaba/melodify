package dev.yeab.melodify.audio

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.view.KeyEvent
import androidx.annotation.OptIn
import androidx.core.content.IntentCompat
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executors

/** Mirrors the `RemoteCommand` union in src/player/engine.ts, as it crosses the bridge. */
internal typealias RemoteSink = (Map<String, Any?>) -> Unit

/**
 * The notification, lock screen, Bluetooth and headset side of playback: the Android twin of
 * ios/MelodifyNowPlaying.swift.
 *
 * Nothing here decides anything. What the session is asked to do is forwarded to JS as a `remote`
 * command, where the queue store already knows what "next" means, and what it shows is read from
 * the player. The session therefore wraps a stand-in player (`NowPlayingPlayer`) with a one-track
 * playlist rather than ExoPlayer itself: the queue lives in JS, and the two decks behind a
 * crossfade are one track as far as the notification is concerned.
 */
@OptIn(UnstableApi::class)
internal class MelodifySession(private val context: Context, private val player: MelodifyPlayer, private val remote: RemoteSink) {
  private val handler = Handler(player.looper)
  private val stand = NowPlayingPlayer(player, remote, ::artworkFor)
  private val clicks = HeadsetClicks(handler) { count -> remote(mapOf("type" to "headset", "clicks" to count)) }
  private val artLoader = Executors.newSingleThreadExecutor()
  /** The art bytes for one uri at a time: the tracks of an album share a folder image. */
  private var art: Pair<String?, ByteArray?>? = null
  private val defaultArt: ByteArray? by lazy {
    try {
      context.resources.openRawResource(R.raw.melodify_default_art).use { it.readBytes() }
    } catch (_: Exception) {
      null
    }
  }
  private var lastFavorite: Boolean? = null
  /** Set on release (a JS reload): art loads still in flight then find nothing to update. */
  @Volatile private var released = false

  val session: MediaSession = player.runSync {
    MediaSession.Builder(context, CommandForwarder(stand, remote))
      .setId("melodify")
      .setCallback(Callback())
      .also { builder -> launchIntent()?.let { builder.setSessionActivity(it) } }
      .setMediaButtonPreferences(buttons(false))
      .build()
  }

  /** Called on the audio thread whenever the picture of playback changes. */
  fun refresh() {
    if (released) return
    val snap = player.snapshot()
    val favorite = snap.meta?.favorite ?: false
    if (favorite != lastFavorite) {
      lastFavorite = favorite
      session.setMediaButtonPreferences(buttons(favorite))
    }
    stand.refresh()
    refreshWidget(snap)
  }

  /** What the widget last drew, so position ticks and seeks do not redraw it. */
  private var widgetKey: String? = null

  private fun refreshWidget(snap: NowPlayingSnapshot) {
    val meta = snap.meta?.takeIf { snap.state != PlayerState.IDLE }
    val playing = snap.state == PlayerState.PLAYING
    val loaded = art?.let { it.first == meta?.artUri && it.second != null } == true
    val key = meta?.let { "${it.title}|${it.artist}|${it.artUri}|$playing|$loaded" }
    if (key == widgetKey) return
    widgetKey = key
    if (meta == null) {
      artLoader.execute { MelodifyWidget.update(context, null) }
      return
    }
    val bytes = artworkFor(meta.artUri)
    if (released) return
    artLoader.execute {
      MelodifyWidget.update(context, MelodifyWidget.Face(meta.title, meta.artist, playing, MelodifyWidget.cover(bytes)))
    }
  }

  fun release() {
    player.runSync {
      released = true
      session.release()
    }
    artLoader.shutdown()
  }

  /** The heart beside the transport buttons, filled for a favorite. */
  private fun buttons(favorite: Boolean): List<CommandButton> = listOf(
    CommandButton.Builder(if (favorite) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
      .setDisplayName(if (favorite) "Remove from favorites" else "Add to favorites")
      .setSessionCommand(LIKE)
      .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
      .build()
  )

  /** Read off the audio thread; the session asks again once it is in. Null while loading. */
  private fun artworkFor(uri: String?): ByteArray? {
    val cached = art
    if (cached != null && cached.first == uri) return cached.second ?: defaultArt
    if (uri == null) {
      art = null to null
      return defaultArt
    }
    art = uri to null
    if (released) return defaultArt
    artLoader.execute {
      val bytes = try {
        fileFrom(uri).takeIf { it.isFile && it.length() < MAX_ART_BYTES }?.readBytes()
      } catch (_: Exception) {
        null
      }
      handler.post {
        if (art?.first != uri) return@post
        art = uri to bytes
        refresh()
      }
    }
    return defaultArt
  }

  private fun launchIntent(): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private inner class Callback : MediaSession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(LIKE).build())
        .build()
    }

    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      if (customCommand.customAction == LIKE.customAction) remote(mapOf("type" to "like"))
      return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }

    /**
     * A headset's one button, or a Bluetooth play/pause, counted into clicks as Musicolet does:
     * the queue maps one, two and three clicks to what Settings says. The notification's own
     * buttons and everything else go the usual way, to the session's player.
     */
    override fun onMediaButtonEvent(session: MediaSession, controllerInfo: MediaSession.ControllerInfo, intent: Intent): Boolean {
      if (session.isMediaNotificationController(controllerInfo)) return false
      val event = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_KEY_EVENT, KeyEvent::class.java) ?: return false
      if (event.keyCode != KeyEvent.KEYCODE_HEADSETHOOK && event.keyCode != KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) return false
      if (controllerInfo.controllerVersion != MediaSession.ControllerInfo.LEGACY_CONTROLLER_VERSION) return false
      // Held down, a headset button repeats; only the first press counts.
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) clicks.click()
      return true
    }
  }

  companion object {
    val LIKE = SessionCommand("dev.yeab.melodify.LIKE", Bundle.EMPTY)
    private const val MAX_ART_BYTES = 8L * 1024 * 1024
  }
}

/** Presses of one button, handed on as a count once they stop coming. */
internal class HeadsetClicks(private val handler: Handler, private val emit: (Int) -> Unit) {
  private var count = 0
  private val flush = Runnable {
    val n = count
    count = 0
    if (n > 0) emit(n)
  }

  fun click() {
    count += 1
    handler.removeCallbacks(flush)
    if (count >= MAX_CLICKS) flush.run() else handler.postDelayed(flush, WINDOW_MS)
  }

  companion object {
    private const val WINDOW_MS = 400L
    private const val MAX_CLICKS = 3
  }
}

/**
 * The player the session sees: the current track as a one-item playlist, its state and position
 * from MelodifyPlayer. Commands become `remote` events; nothing changes here until JS acts on them
 * and the player reports back.
 */
@OptIn(UnstableApi::class)
private class NowPlayingPlayer(
  private val player: MelodifyPlayer,
  private val remote: RemoteSink,
  private val artwork: (String?) -> ByteArray?,
) : SimpleBasePlayer(player.looper) {
  fun refresh() = invalidateState()

  override fun getState(): SimpleBasePlayer.State {
    val snap = player.snapshot()
    val builder = SimpleBasePlayer.State.Builder().setAvailableCommands(COMMANDS)
    val meta = snap.meta
    if (meta == null || snap.state == PlayerState.IDLE) return builder.setPlaybackState(Player.STATE_IDLE).build()
    val metadata = MediaMetadata.Builder()
      .setTitle(meta.title)
      .setArtist(meta.artist)
      .setAlbumTitle(meta.album)
      .setIsPlayable(true)
      .setIsBrowsable(false)
      .also { b -> artwork(meta.artUri)?.let { b.setArtworkData(it, MediaMetadata.PICTURE_TYPE_FRONT_COVER) } }
      .build()
    val durationMs = snap.durationMs.takeIf { it > 0 } ?: meta.durationMs?.toLong() ?: 0
    val item = SimpleBasePlayer.MediaItemData.Builder(snap.trackId)
      .setMediaItem(MediaItem.Builder().setMediaId(snap.trackId.toString()).setMediaMetadata(metadata).build())
      .setMediaMetadata(metadata)
      .setDurationUs(if (durationMs > 0) durationMs * 1000 else C.TIME_UNSET)
      .setIsSeekable(true)
      .build()
    val playing = snap.playing
    return builder
      .setPlaylist(listOf(item))
      .setCurrentMediaItemIndex(0)
      .setPlaybackState(
        when (snap.state) {
          PlayerState.ENDED -> Player.STATE_ENDED
          PlayerState.LOADING -> Player.STATE_BUFFERING
          else -> Player.STATE_READY
        }
      )
      .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setContentPositionMs(
        if (playing) SimpleBasePlayer.PositionSupplier.getExtrapolating(snap.positionMs, snap.rate) else SimpleBasePlayer.PositionSupplier.getConstant(snap.positionMs)
      )
      .setPlaybackParameters(PlaybackParameters(snap.rate))
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    remote(mapOf("type" to if (playWhenReady) "play" else "pause"))
    return Futures.immediateVoidFuture()
  }

  override fun handleStop(): ListenableFuture<*> {
    remote(mapOf("type" to "pause"))
    return Futures.immediateVoidFuture()
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    when (seekCommand) {
      Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> remote(mapOf("type" to "previous"))
      Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> remote(mapOf("type" to "next"))
      else -> if (positionMs != C.TIME_UNSET) remote(mapOf("type" to "seek", "positionMs" to positionMs.toDouble()))
    }
    return Futures.immediateVoidFuture()
  }

  companion object {
    private val COMMANDS = Player.Commands.Builder()
      .addAll(
        Player.COMMAND_PLAY_PAUSE,
        Player.COMMAND_STOP,
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_NEXT,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_METADATA,
        Player.COMMAND_GET_TIMELINE,
      )
      .build()
  }
}

/**
 * With a one-track playlist there is never a next item, so the base player would drop "next"
 * before it reached `handleSeek`. The queue has one, so both directions go to JS from here.
 */
private class CommandForwarder(player: Player, private val remote: RemoteSink) : ForwardingPlayer(player) {
  override fun seekToNext() = remote(mapOf("type" to "next"))
  override fun seekToNextMediaItem() = remote(mapOf("type" to "next"))
  override fun seekToPrevious() = remote(mapOf("type" to "previous"))
  override fun seekToPreviousMediaItem() = remote(mapOf("type" to "previous"))
  override fun hasNextMediaItem() = true
  override fun hasPreviousMediaItem() = true
}
