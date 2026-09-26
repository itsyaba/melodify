package dev.yeab.melodify.audio

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.RemoteViews

/**
 * The home screen widget: the playing song's cover, title and artist, and previous, play/pause
 * and next. Musicolet has one; iOS has no equivalent a LiveContainer guest could install.
 *
 * The buttons are broadcasts to this receiver, which hands them to JS as `remote` commands, as
 * the notification's are. Without the app running there is no queue to act on, so the widget
 * turns to its resting face, where a tap anywhere opens Melodify.
 */
class MelodifyWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    render(context, manager, appWidgetIds, last)
  }

  override fun onReceive(context: Context, intent: Intent) {
    val command = when (intent.action) {
      ACTION_PREVIOUS -> "previous"
      ACTION_TOGGLE -> "toggle"
      ACTION_NEXT -> "next"
      else -> null
    }
    if (command == null) {
      super.onReceive(context, intent)
      return
    }
    val remote = MelodifyPlayback.remote
    if (remote != null) {
      remote(mapOf("type" to command))
    } else {
      last = null
      update(context, null)
    }
  }

  /** What the widget shows. Null is the resting face: Melodify, tap to open. */
  internal data class Face(val title: String, val artist: String?, val playing: Boolean, val art: Bitmap?)

  companion object {
    private const val ACTION_PREVIOUS = "dev.yeab.melodify.widget.PREVIOUS"
    private const val ACTION_TOGGLE = "dev.yeab.melodify.widget.TOGGLE"
    private const val ACTION_NEXT = "dev.yeab.melodify.widget.NEXT"
    /** Covers are sent across to the launcher, whose limit for a widget is well under a megabyte. */
    private const val ART_SIDE = 256

    @Volatile private var last: Face? = null

    /** Redraws every Melodify widget on the home screen. Cheap when there are none. */
    internal fun update(context: Context, face: Face?) {
      last = face
      val manager = AppWidgetManager.getInstance(context) ?: return
      val ids = manager.getAppWidgetIds(ComponentName(context, MelodifyWidget::class.java))
      if (ids.isEmpty()) return
      render(context, manager, ids, face)
    }

    /** A cover scaled down for the widget; null for none, or bytes that are not an image. */
    internal fun cover(bytes: ByteArray?): Bitmap? {
      if (bytes == null || bytes.isEmpty()) return null
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= ART_SIDE && bounds.outHeight / (sample * 2) >= ART_SIDE) sample *= 2
      val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: return null
      if (decoded.width <= ART_SIDE && decoded.height <= ART_SIDE) return decoded
      val scale = ART_SIDE.toFloat() / maxOf(decoded.width, decoded.height)
      return Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt().coerceAtLeast(1), (decoded.height * scale).toInt().coerceAtLeast(1), true)
    }

    private fun render(context: Context, manager: AppWidgetManager, ids: IntArray, face: Face?) {
      val views = RemoteViews(context.packageName, R.layout.melodify_widget)
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      open?.let { views.setOnClickPendingIntent(R.id.melodify_widget_root, it) }
      if (face == null) {
        views.setTextViewText(R.id.melodify_widget_title, context.getString(R.string.melodify_widget_idle_title))
        views.setTextViewText(R.id.melodify_widget_artist, context.getString(R.string.melodify_widget_idle_subtitle))
        views.setImageViewResource(R.id.melodify_widget_art, R.drawable.melodify_widget_placeholder)
        views.setImageViewResource(R.id.melodify_widget_toggle, R.drawable.melodify_widget_play)
        // At rest every part of the widget opens the app: there is nothing to play without it.
        for (button in listOf(R.id.melodify_widget_previous, R.id.melodify_widget_toggle, R.id.melodify_widget_next)) {
          open?.let { views.setOnClickPendingIntent(button, it) }
        }
      } else {
        views.setTextViewText(R.id.melodify_widget_title, face.title)
        views.setTextViewText(R.id.melodify_widget_artist, face.artist ?: "")
        if (face.art != null) views.setImageViewBitmap(R.id.melodify_widget_art, face.art)
        else views.setImageViewResource(R.id.melodify_widget_art, R.drawable.melodify_widget_placeholder)
        views.setImageViewResource(R.id.melodify_widget_toggle, if (face.playing) R.drawable.melodify_widget_pause else R.drawable.melodify_widget_play)
        views.setContentDescription(
          R.id.melodify_widget_toggle,
          context.getString(if (face.playing) R.string.melodify_widget_pause else R.string.melodify_widget_play),
        )
        views.setOnClickPendingIntent(R.id.melodify_widget_previous, broadcast(context, ACTION_PREVIOUS))
        views.setOnClickPendingIntent(R.id.melodify_widget_toggle, broadcast(context, ACTION_TOGGLE))
        views.setOnClickPendingIntent(R.id.melodify_widget_next, broadcast(context, ACTION_NEXT))
      }
      manager.updateAppWidget(ids, views)
    }

    private fun broadcast(context: Context, action: String): PendingIntent {
      val intent = Intent(context, MelodifyWidget::class.java).setAction(action)
      return PendingIntent.getBroadcast(context, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
  }
}
