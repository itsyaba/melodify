package dev.yeab.melodify.audio

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import expo.modules.kotlin.services.FilePermissionService
import java.io.File
import java.io.IOException
import java.util.EnumSet

/**
 * The music lives in shared storage on Android (/storage/emulated/0), not in the app's own folder
 * as on iOS. With "All files access" the app reads and writes it like any folder: scanning, `.lrc`
 * files beside songs, tag writing, backups in Melodify/Backups.
 */
internal object MelodifyStorage {
  /** The primary shared storage, the root every library path is relative to. */
  fun root(): String = Environment.getExternalStorageDirectory().absolutePath

  /**
   * "full": everything can be read and written. "read": audio can be read, which is enough to play
   * but not for folder covers, `.lrc` files, tag editing or deleting. "none".
   */
  fun access(context: Context): String {
    fun granted(permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    return when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager() -> "full"
      Build.VERSION.SDK_INT < Build.VERSION_CODES.R &&
        granted(Manifest.permission.READ_EXTERNAL_STORAGE) && granted(Manifest.permission.WRITE_EXTERNAL_STORAGE) -> "full"
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && granted(Manifest.permission.READ_MEDIA_AUDIO) -> "read"
      Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && granted(Manifest.permission.READ_EXTERNAL_STORAGE) -> "read"
      else -> "none"
    }
  }

  /** Android 11 and later: the system's All files access page for this app. */
  fun openAllFilesSettings(activity: Activity) {
    val app = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${activity.packageName}"))
    try {
      activity.startActivity(app)
    } catch (_: Exception) {
      activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
    }
  }

  /**
   * The runtime permissions to ask for where All files access does not exist or was refused. Audio
   * alone from Android 13: asking for photos too, for folder covers, is more than a music player
   * should want; embedded artwork needs nothing more, and All files access brings the covers.
   */
  fun runtimePermissions(): Array<String> = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> arrayOf(Manifest.permission.READ_MEDIA_AUDIO)
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)
  }

  /** Tells the system's media index about changed, new or deleted files, so other apps agree. */
  fun scan(context: Context, uris: List<String>) {
    val paths = uris.map { fileFrom(it).absolutePath }
    if (paths.isNotEmpty()) MediaScannerConnection.scanFile(context, paths.toTypedArray(), null, null)
  }

  /** The system share sheet with the file itself. */
  fun share(activity: Activity, uri: String, mimeType: String?, title: String?) {
    val file = fileFrom(uri)
    if (!file.isFile) throw IOException("${file.name}: no such file")
    val content = FileProvider.getUriForFile(activity, "${activity.packageName}.melodify.files", file)
    val type = mimeType
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())
      ?: "application/octet-stream"
    val send = Intent(Intent.ACTION_SEND)
      .setType(type)
      .putExtra(Intent.EXTRA_STREAM, content)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    title?.let { send.putExtra(Intent.EXTRA_TITLE, it) }
    activity.startActivity(Intent.createChooser(send, title))
  }

  /** Android 12's wallpaper colors, as hex for light and dark themes; null before Android 12. */
  fun systemAccent(context: Context): Map<String, String>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    fun hex(id: Int) = String.format("#%06x", ContextCompat.getColor(context, id) and 0xffffff)
    return mapOf("light" to hex(android.R.color.system_accent1_600), "dark" to hex(android.R.color.system_accent1_200))
  }
}

/**
 * expo-file-system asks `File.canWrite()` before writing, which is false for a file that does not
 * exist yet, so no new file could be made in shared storage: not a `.lrc` beside a song, not a
 * backup. This asks the nearest existing folder instead, which is what creating the file needs.
 * Nothing is granted that the system would refuse.
 */
internal class SharedStoragePermissions : FilePermissionService() {
  override fun getExternalPathPermissions(path: String): EnumSet<Permission> {
    val permissions = super.getExternalPathPermissions(path)
    if (permissions.contains(Permission.READ) && permissions.contains(Permission.WRITE)) return permissions
    val target = File(path)
    if (target.exists()) return permissions
    var parent: File? = target.parentFile
    while (parent != null && !parent.exists()) parent = parent.parentFile
    if (parent != null && parent.isDirectory) {
      if (parent.canRead()) permissions.add(Permission.READ)
      if (parent.canWrite()) permissions.add(Permission.WRITE)
    }
    return permissions
  }
}
