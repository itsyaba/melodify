package dev.yeab.melodify.audio

import java.io.IOException

/**
 * TagLib, compiled from ios/Vendor by android/CMakeLists.txt into libmelodify-tags.so. The same
 * library and the same C writer the iOS build uses, so both platforms read and write tags alike.
 * Paths and text cross as UTF-8 bytes; see melodify_tags_jni.cpp for why.
 */
internal object TagLibNative {
  /** Null when the library failed to load; every caller then falls back or reports it. */
  val loadError: String? = try {
    System.loadLibrary("melodify-tags")
    null
  } catch (error: Throwable) {
    error.message ?: error.toString()
  }

  /** [UTF-8 JSON of properties and audio properties, the cover's bytes or null]; null if unreadable. */
  @JvmStatic external fun read(path: ByteArray): Array<Any?>?

  @JvmStatic @Throws(IOException::class)
  external fun write(path: ByteArray, keys: Array<ByteArray>, values: Array<ByteArray>)

  /** Null or empty `data` removes every picture. */
  @JvmStatic @Throws(IOException::class)
  external fun setPicture(path: ByteArray, data: ByteArray?, mime: ByteArray?)

  /** UTF-8 JSON: every property name to its values, plus `_pictures`. */
  @JvmStatic @Throws(IOException::class)
  external fun readAll(path: ByteArray): ByteArray
}
