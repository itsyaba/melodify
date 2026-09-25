import CommonCrypto
import Compression
import CryptoKit
import Foundation

/**
 The byte work of a backup (src/backup/codec.ts): Musicolet's Blowfish, MD5 checksums, and the
 zip's deflate and CRC-32. The same in JS runs 20 to 40 times slower on Hermes and holds the JS
 thread the whole time; here it runs on the module's queue.

 The JS side checks every function against known answers before it trusts this, and keeps its
 own implementation for builds without it.
 */
internal enum MelodifyArchive {
  /// Blowfish in ECB mode with PKCS5 padding (PKCS7 over 8-byte blocks), as Musicolet uses it.
  static func blowfish(_ data: Data, key: Data, encrypt: Bool) throws -> Data {
    guard key.count >= kCCKeySizeMinBlowfish, key.count <= kCCKeySizeMaxBlowfish else {
      throw ArchiveException("a Blowfish key is 8 to 56 bytes")
    }
    // A whole block of padding at most is added; decrypting only ever shrinks.
    var out = Data(count: data.count + kCCBlockSizeBlowfish)
    var moved = 0
    let input = data.isEmpty ? Data([0]) : data
    let status = out.withUnsafeMutableBytes { (outBytes: UnsafeMutableRawBufferPointer) in
      input.withUnsafeBytes { (inBytes: UnsafeRawBufferPointer) in
        key.withUnsafeBytes { (keyBytes: UnsafeRawBufferPointer) in
          CCCrypt(
            CCOperation(encrypt ? kCCEncrypt : kCCDecrypt),
            CCAlgorithm(kCCAlgorithmBlowfish),
            CCOptions(kCCOptionECBMode | kCCOptionPKCS7Padding),
            keyBytes.baseAddress, key.count,
            nil,
            inBytes.baseAddress, data.count,
            outBytes.baseAddress, outBytes.count,
            &moved
          )
        }
      }
    }
    guard status == Int32(kCCSuccess) else {
      throw ArchiveException(encrypt ? "encrypting failed (\(status))" : "bad padding: wrong key, or damaged data")
    }
    out.count = moved
    return out
  }

  /// UTF-8 to a string, bad sequences as U+FFFD, as a non-fatal TextDecoder does. Hermes has no
  /// TextDecoder of its own, and the JS one takes over a second for the few MB a backup holds.
  static func utf8(_ data: Data) -> String {
    String(decoding: data, as: UTF8.self)
  }

  static func md5(_ data: Data) -> String {
    Insecure.MD5.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static let crcTable: [UInt32] = (0..<256).map { n -> UInt32 in
    var c = UInt32(n)
    for _ in 0..<8 { c = c & 1 != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
    return c
  }

  static func crc32(_ data: Data) -> UInt32 {
    var c: UInt32 = 0xFFFF_FFFF
    crcTable.withUnsafeBufferPointer { table in
      data.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) in
        for b in bytes { c = table[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
      }
    }
    return c ^ 0xFFFF_FFFF
  }

  /// Raw DEFLATE (RFC 1951), as a zip entry holds it; nil when it would not come out smaller.
  static func deflate(_ data: Data) -> Data? {
    guard !data.isEmpty else { return nil }
    var out = Data(count: data.count)
    let written = out.withUnsafeMutableBytes { (o: UnsafeMutableRawBufferPointer) in
      data.withUnsafeBytes { (i: UnsafeRawBufferPointer) in
        // COMPRESSION_ZLIB is raw DEFLATE, without zlib's header and checksum.
        compression_encode_buffer(
          o.bindMemory(to: UInt8.self).baseAddress!, data.count,
          i.bindMemory(to: UInt8.self).baseAddress!, data.count,
          nil, COMPRESSION_ZLIB
        )
      }
    }
    // 0 means it did not fit in the input's own size: better stored.
    guard written > 0, written < data.count else { return nil }
    out.count = written
    return out
  }

  /// Raw DEFLATE back to the `size` bytes the zip says it holds.
  static func inflate(_ data: Data, size: Int) throws -> Data {
    guard size > 0 else { return Data() }
    guard !data.isEmpty else { throw ArchiveException("nothing to inflate") }
    var out = Data(count: size)
    let written = out.withUnsafeMutableBytes { (o: UnsafeMutableRawBufferPointer) in
      data.withUnsafeBytes { (i: UnsafeRawBufferPointer) in
        compression_decode_buffer(
          o.bindMemory(to: UInt8.self).baseAddress!, size,
          i.bindMemory(to: UInt8.self).baseAddress!, data.count,
          nil, COMPRESSION_ZLIB
        )
      }
    }
    guard written == size else { throw ArchiveException("the data is damaged") }
    return out
  }
}
