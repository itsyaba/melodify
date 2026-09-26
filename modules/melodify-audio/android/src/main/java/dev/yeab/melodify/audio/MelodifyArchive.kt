package dev.yeab.melodify.audio

import java.io.IOException
import java.security.MessageDigest
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.Inflater
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

/**
 * The byte work of a backup (src/backup/codec.ts): Musicolet's Blowfish, MD5 checksums, and the
 * zip's deflate and CRC-32, off the JS thread. Mirrors ios/MelodifyArchive.swift. The JS side
 * checks every function against known answers before it trusts them.
 */
internal object MelodifyArchive {
  /** Blowfish in ECB mode with PKCS5 padding, as Musicolet uses it. */
  fun blowfish(data: ByteArray, key: ByteArray, encrypt: Boolean): ByteArray {
    if (key.size !in 8..56) throw IOException("a Blowfish key is 8 to 56 bytes")
    val cipher = Cipher.getInstance("Blowfish/ECB/PKCS5Padding")
    cipher.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(key, "Blowfish"))
    return try {
      cipher.doFinal(data)
    } catch (error: Exception) {
      throw IOException(if (encrypt) "encrypting failed (${error.message})" else "bad padding: wrong key, or damaged data")
    }
  }

  fun md5(data: ByteArray): String = MessageDigest.getInstance("MD5").digest(data).joinToString("") { "%02x".format(it) }

  /** Malformed sequences become U+FFFD, as a non-fatal TextDecoder does. */
  fun utf8(data: ByteArray): String = String(data, Charsets.UTF_8)

  fun crc32(data: ByteArray): Double = CRC32().apply { update(data) }.value.toDouble()

  /** Raw DEFLATE, as a zip entry holds it; null when it would not come out smaller. */
  fun deflate(data: ByteArray): ByteArray? {
    if (data.isEmpty()) return null
    val deflater = Deflater(6, true)
    try {
      deflater.setInput(data)
      deflater.finish()
      val out = ByteArray(data.size)
      var written = 0
      while (!deflater.finished()) {
        if (written == out.size) return null
        written += deflater.deflate(out, written, out.size - written)
      }
      return if (written < data.size) out.copyOf(written) else null
    } finally {
      deflater.end()
    }
  }

  /** Raw DEFLATE back to the `size` bytes the zip says it holds. */
  fun inflate(data: ByteArray, size: Int): ByteArray {
    if (size <= 0) return ByteArray(0)
    if (data.isEmpty()) throw IOException("nothing to inflate")
    val inflater = Inflater(true)
    try {
      // A raw stream wants one byte past its end to be sure it has ended.
      inflater.setInput(data + ByteArray(1))
      val out = ByteArray(size)
      var written = 0
      while (written < size && !inflater.finished()) {
        val n = inflater.inflate(out, written, size - written)
        if (n == 0 && (inflater.needsInput() || inflater.needsDictionary())) break
        written += n
      }
      if (written != size) throw IOException("the data is damaged")
      return out
    } catch (error: java.util.zip.DataFormatException) {
      throw IOException("the data is damaged")
    } finally {
      inflater.end()
    }
  }
}
