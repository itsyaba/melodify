package dev.yeab.melodify.audio

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * App shortcuts (holding the launcher icon): Resume, Shuffle all, Favorites and Search, as the iOS
 * quick actions. Each opens the app with the shortcut's type in an extra, which the module hands
 * to JS: at launch through `takeLaunchShortcut`, while running as the `shortcut` event.
 */
internal object MelodifyShortcuts {
  const val EXTRA = "dev.yeab.melodify.SHORTCUT"

  /** Mirrors `QuickAction` in src/utils/quick-actions.ts; `symbol` is the SF Symbol iOS shows. */
  data class Item(val type: String, val title: String, val subtitle: String?, val symbol: String?)

  fun set(context: Context, items: List<Item>) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    val max = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context).coerceAtLeast(1)
    val shortcuts = items.take(max).mapIndexed { rank, item ->
      val intent = Intent(launch)
        .setAction(Intent.ACTION_VIEW)
        .putExtra(EXTRA, item.type)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      ShortcutInfoCompat.Builder(context, item.type)
        .setShortLabel(item.title)
        .setLongLabel(item.subtitle?.let { "${item.title}: $it" }?.take(MAX_LONG_LABEL) ?: item.title)
        .setIcon(IconCompat.createWithResource(context, icon(item.symbol)))
        .setIntent(intent)
        .setRank(rank)
        .build()
    }
    ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
  }

  private fun icon(symbol: String?): Int = when (symbol) {
    "shuffle" -> R.drawable.melodify_shortcut_shuffle
    "heart.fill", "heart" -> R.drawable.melodify_shortcut_favorite
    "magnifyingglass" -> R.drawable.melodify_shortcut_search
    else -> R.drawable.melodify_shortcut_play
  }

  private const val MAX_LONG_LABEL = 25
}
