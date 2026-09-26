package dev.yeab.melodify.audio

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.security.MessageDigest

/**
 * Tag reading for the library, and the tag editor's writes, both through TagLib. It reads every
 * container the scanner indexes on Android (ID3, MP4 atoms, Vorbis comments in FLAC, Ogg and
 * Opus), ReplayGain and lyrics included. MediaMetadataRetriever stands in for anything TagLib
 * cannot open (raw AAC, say) and for a length TagLib could not work out.
 *
 * Mirrors ios/MelodifyTags.swift and ios/MelodifyTagEditor.swift: the records have the same keys.
 */
internal object MelodifyTags {
  /** Pictures past this size are scaled down: embedded art is read on every scan of the file. */
  private const val MAX_ARTWORK_SIDE = 1400

  fun read(uris: List<String>, artCacheDirectory: String): List<Map<String, Any?>> {
    val cache = fileFrom(artCacheDirectory)
    cache.mkdirs()
    return uris.map { readOne(it, cache) }
  }

  /** Embedded lyrics, or null: ID3 USLT, the iTunes lyrics atom and Vorbis LYRICS all read as LYRICS. */
  fun lyrics(uri: String): String? {
    val file = fileFrom(uri)
    if (!file.isFile || TagLibNative.loadError != null) return null
    val raw = TagLibNative.read(file.path.toByteArray()) ?: return null
    val props = JSONObject(String(raw[0] as ByteArray, Charsets.UTF_8)).optJSONObject("props") ?: return null
    for (key in listOf("LYRICS", "UNSYNCEDLYRICS", "UNSYNCED LYRICS")) {
      first(props, key)?.let { return it }
    }
    return null
  }

  private fun readOne(uri: String, cache: File): Map<String, Any?> {
    val out = HashMap<String, Any?>()
    for (key in RECORD_KEYS) out[key] = null
    out["uri"] = uri
    val file = fileFrom(uri)
    if (!file.isFile) {
      out["error"] = "no such file"
      return out
    }
    try {
      val raw = if (TagLibNative.loadError == null) TagLibNative.read(file.path.toByteArray()) else null
      if (raw != null) applyTagLib(raw, out, cache)
      if (raw == null || out["durationMs"] == null) applyRetriever(file, out, cache, tagsToo = raw == null)
    } catch (error: Throwable) {
      out["error"] = error.message ?: error.toString()
    }
    return out
  }

  private fun applyTagLib(raw: Array<Any?>, out: HashMap<String, Any?>, cache: File) {
    val root = JSONObject(String(raw[0] as ByteArray, Charsets.UTF_8))
    val props = root.optJSONObject("props") ?: JSONObject()
    out["title"] = first(props, "TITLE")
    out["artist"] = joined(props, "ARTIST")
    out["album"] = first(props, "ALBUM")
    out["albumArtist"] = joined(props, "ALBUMARTIST") ?: joined(props, "ALBUM ARTIST")
    out["genre"] = first(props, "GENRE")
    out["composer"] = joined(props, "COMPOSER")
    out["year"] = year(first(props, "DATE")) ?: year(first(props, "ORIGINALDATE")) ?: year(first(props, "YEAR"))
    out["trackNo"] = number(first(props, "TRACKNUMBER"))
    out["discNo"] = number(first(props, "DISCNUMBER"))
    out["trackGainDb"] = decibels(first(props, "REPLAYGAIN_TRACK_GAIN"))
    out["albumGainDb"] = decibels(first(props, "REPLAYGAIN_ALBUM_GAIN"))
    out["trackPeak"] = decibels(first(props, "REPLAYGAIN_TRACK_PEAK"))?.takeIf { it > 0 }
    out["albumPeak"] = decibels(first(props, "REPLAYGAIN_ALBUM_PEAK"))?.takeIf { it > 0 }
    root.optInt("lengthMs", 0).takeIf { it > 0 }?.let { out["durationMs"] = it }
    // TagLib reports kb/s; the iOS reader, and so the database, holds bits per second.
    root.optInt("bitrate", 0).takeIf { it > 0 }?.let { out["bitrate"] = it * 1000 }
    root.optInt("sampleRate", 0).takeIf { it > 0 }?.let { out["sampleRate"] = it }
    (raw[1] as? ByteArray)?.let { out["artKey"] = writeArtwork(it, cache) }
  }

  /** For files TagLib cannot open, and for a length it could not work out. */
  private fun applyRetriever(file: File, out: HashMap<String, Any?>, cache: File, tagsToo: Boolean) {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(file.path)
      fun text(key: Int) = retriever.extractMetadata(key)?.trim()?.takeIf { it.isNotEmpty() }
      text(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.takeIf { it > 0 }?.let {
        out["durationMs"] = it.toInt()
      }
      if (out["bitrate"] == null) {
        text(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()?.takeIf { it > 0 }?.let { out["bitrate"] = it }
      }
      if (out["sampleRate"] == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        text(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE)?.toIntOrNull()?.takeIf { it > 0 }?.let { out["sampleRate"] = it }
      }
      if (!tagsToo) return
      out["title"] = text(MediaMetadataRetriever.METADATA_KEY_TITLE)
      out["artist"] = text(MediaMetadataRetriever.METADATA_KEY_ARTIST)
      out["album"] = text(MediaMetadataRetriever.METADATA_KEY_ALBUM)
      out["albumArtist"] = text(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST)
      out["genre"] = text(MediaMetadataRetriever.METADATA_KEY_GENRE)
      out["composer"] = text(MediaMetadataRetriever.METADATA_KEY_COMPOSER)
      out["year"] = year(text(MediaMetadataRetriever.METADATA_KEY_YEAR))
      out["trackNo"] = number(text(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER))
      out["discNo"] = number(text(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER))
      retriever.embeddedPicture?.let { out["artKey"] = writeArtwork(it, cache) }
    } catch (error: Throwable) {
      if (tagsToo) out["error"] = error.message ?: "the file could not be read"
    } finally {
      try {
        retriever.release()
      } catch (_: Throwable) {
      }
    }
  }

  // Tag editing.

  /** Keys are TagLib property names; an empty value removes the field. */
  fun write(uri: String, fields: Map<String, String>) {
    requireLibrary()
    val path = existing(uri).path
    val keys = fields.keys.toList()
    TagLibNative.write(
      path.toByteArray(),
      keys.map { it.toByteArray() }.toTypedArray(),
      keys.map { (fields[it] ?: "").toByteArray() }.toTypedArray(),
    )
  }

  /**
   * Embeds the image as the only picture, or with null removes every picture. The picker hands
   * over a content:// URI on Android, which only the content resolver can open.
   */
  fun setArtwork(context: Context, uri: String, imageUri: String?) {
    requireLibrary()
    val path = existing(uri).path
    if (imageUri == null) {
      TagLibNative.setPicture(path.toByteArray(), null, null)
      return
    }
    val image = try {
      if (imageUri.startsWith("content:")) {
        context.contentResolver.openInputStream(Uri.parse(imageUri))?.use { it.readBytes() }
          ?: throw IOException("the picked image cannot be opened")
      } else {
        existing(imageUri).readBytes()
      }
    } catch (error: IOException) {
      throw IOException("cannot read the image: ${error.message}")
    }
    val (data, mime) = encodedArtwork(image)
    TagLibNative.setPicture(path.toByteArray(), data, mime.toByteArray())
  }

  fun readAll(uri: String): Map<String, Any> {
    requireLibrary()
    val json = JSONObject(String(TagLibNative.readAll(existing(uri).path.toByteArray()), Charsets.UTF_8))
    val out = HashMap<String, Any>()
    for (key in json.keys()) {
      val value = json.get(key)
      out[key] = if (value is JSONArray) List(value.length()) { value.optString(it) } else (value as? Number)?.toInt() ?: value.toString()
    }
    return out
  }

  /** JPEG and PNG go in as they are unless huge; anything else is converted to JPEG. */
  private fun encodedArtwork(data: ByteArray): Pair<ByteArray, String> {
    val isPng = data.size > 4 && data[0] == 0x89.toByte() && data[1] == 0x50.toByte() && data[2] == 0x4E.toByte()
    val isJpeg = data.size > 3 && data[0] == 0xFF.toByte() && data[1] == 0xD8.toByte() && data[2] == 0xFF.toByte()
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("that file is not an image")
    val side = maxOf(bounds.outWidth, bounds.outHeight)
    if ((isPng || isJpeg) && side <= MAX_ARTWORK_SIDE) return data to (if (isPng) "image/png" else "image/jpeg")
    val decoded = BitmapFactory.decodeByteArray(data, 0, data.size) ?: throw IOException("that file is not an image")
    val factor = minOf(1.0, MAX_ARTWORK_SIDE.toDouble() / side)
    val scaled = if (factor < 1) {
      Bitmap.createScaledBitmap(decoded, (decoded.width * factor).toInt().coerceAtLeast(1), (decoded.height * factor).toInt().coerceAtLeast(1), true)
    } else {
      decoded
    }
    val out = ByteArrayOutputStream()
    if (!scaled.compress(Bitmap.CompressFormat.JPEG, 90, out)) throw IOException("cannot convert the image")
    return out.toByteArray() to "image/jpeg"
  }

  private fun requireLibrary() {
    TagLibNative.loadError?.let { throw IOException("TagLib is not in this build ($it)") }
  }

  private fun existing(uri: String): File {
    val file = fileFrom(uri)
    if (!file.isFile) throw IOException("${file.name}: no such file")
    return file
  }

  // Parsing.

  private val RECORD_KEYS = listOf(
    "title", "artist", "album", "albumArtist", "genre", "composer", "year", "trackNo", "discNo",
    "durationMs", "bitrate", "sampleRate", "artKey", "trackGainDb", "albumGainDb", "trackPeak",
    "albumPeak", "error",
  )

  private fun values(props: JSONObject, key: String): List<String> {
    val array = props.optJSONArray(key) ?: return emptyList()
    return List(array.length()) { array.optString(it).trim() }.filter { it.isNotEmpty() }
  }

  private fun first(props: JSONObject, key: String): String? = values(props, key).firstOrNull()

  /** Several artists in one tag (ID3v2.4, Vorbis comments) read as one name, as iOS shows them. */
  private fun joined(props: JSONObject, key: String): String? =
    values(props, key).distinct().takeIf { it.isNotEmpty() }?.joinToString(", ")

  /** "3" or "3/12". */
  private fun number(value: String?): Int? = value?.trim()?.takeWhile { it.isDigit() }?.toIntOrNull()?.takeIf { it > 0 }

  /** "2011", "2011-05-03" or a full timestamp; only the year is kept. */
  private fun year(value: String?): Int? {
    if (value == null || value.length < 4) return null
    return value.substring(0, 4).toIntOrNull()?.takeIf { it in 1001..2999 }
  }

  private val NUMBER = Regex("[-+]?[0-9]*\\.?[0-9]+")

  /** "-6.48 dB" or "0.988525": the first number in it. */
  private fun decibels(value: String?): Double? =
    value?.let { NUMBER.find(it)?.value?.toDoubleOrNull() }?.takeIf { it.isFinite() }

  /** Named by a hash of the image, so every track on an album shares one cached file. */
  private fun writeArtwork(data: ByteArray, cache: File): String? {
    if (data.isEmpty()) return null
    val digest = MessageDigest.getInstance("SHA-256").digest(data)
    val name = digest.take(8).joinToString("") { "%02x".format(it) }
    val isPng = data.size > 4 && data[0] == 0x89.toByte() && data[1] == 0x50.toByte()
    val filename = "$name.${if (isPng) "png" else "jpg"}"
    val file = File(cache, filename)
    if (!file.exists()) {
      try {
        file.writeBytes(data)
      } catch (_: IOException) {
        return null
      }
    }
    return "${cache.name}/$filename"
  }
}

/** `expo-file-system` hands over percent-encoded `file://` URIs; a bare path is accepted too. */
internal fun fileFrom(uri: String): File {
  if (uri.startsWith("file:")) {
    Uri.parse(uri).path?.let { return File(it) }
  }
  return File(uri)
}
