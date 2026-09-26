package dev.yeab.melodify.audio

import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/** The session the module made, for the service; the module and the service share one process. */
internal object MelodifyPlayback {
  @Volatile var session: MediaSession? = null
  /** Sends a `remote` command to JS; null while the app is not running. The widget uses it. */
  @Volatile var remote: ((Map<String, Any?>) -> Unit)? = null
}

/**
 * Keeps music going with the app in the background: Media3 puts it in the foreground with the
 * media notification while something plays, and lets it go when playback stops. The session and
 * player belong to the module (MelodifyAudioModule), which binds this service when a track is
 * first loaded; the service only hosts them.
 */
@OptIn(UnstableApi::class)
class MelodifyPlaybackService : MediaSessionService() {
  override fun onCreate() {
    super.onCreate()
    setMediaNotificationProvider(
      DefaultMediaNotificationProvider.Builder(this).build().apply { setSmallIcon(R.drawable.melodify_notification) }
    )
    MelodifyPlayback.session?.let { addSession(it) }
  }

  // Without the app (a Bluetooth play button after the process was killed, say) there is nothing
  // to play: the queue lives in JS. Null makes Media3 let the request go.
  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = MelodifyPlayback.session

  /** Swiping the app away while paused ends it; while playing, the notification keeps it going. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = MelodifyPlayback.session?.player
    if (player == null || !player.playWhenReady) stopSelf()
  }
}
