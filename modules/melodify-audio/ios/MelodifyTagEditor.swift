import Foundation
import ExpoModulesCore
import UIKit

internal final class TagWriteException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Could not write the tags (\(param))"
  }
}

/**
 Tag writing, through TagLib behind the C functions in TagWriter/MelodifyTagWriter.h. Reading
 for the library stays with AVAsset (MelodifyTags); this is for the tag editor, which writes, and
 for the full dump the song details show, which AVAsset cannot give.

 Static and synchronous: the module's async functions run it off the main thread, and each call
 is one file.
 */
internal enum MelodifyTagEditor {
  private static let errorSize = 512
  /// Pictures past this size are scaled down: embedded art is read on every scan of the file.
  private static let maxArtworkSide: CGFloat = 1400

  /// Sets each field; an empty value removes it. Keys are TagLib property names (TITLE, ARTIST...).
  static func write(path: String, fields: [String: String]) throws {
    let keys = Array(fields.keys)
    let values = keys.map { fields[$0] ?? "" }
    var error = [CChar](repeating: 0, count: errorSize)
    let ok = withCStrings(keys) { keyPointers in
      withCStrings(values) { valuePointers in
        melodify_tags_write(path, keyPointers, valuePointers, keys.count, &error, errorSize)
      }
    }
    guard ok == 1 else { throw TagWriteException(String(cString: error)) }
  }

  /// Embeds the image at `imageURL` as the only picture, or removes every picture when nil.
  static func setArtwork(path: String, imageURL: URL?) throws {
    var error = [CChar](repeating: 0, count: errorSize)
    let ok: Int32
    if let imageURL {
      let (data, mime) = try encodedArtwork(imageURL)
      ok = data.withUnsafeBytes { bytes in
        melodify_tags_set_picture(path, bytes.baseAddress, data.count, mime, &error, errorSize)
      }
    } else {
      ok = melodify_tags_set_picture(path, nil, 0, nil, &error, errorSize)
    }
    guard ok == 1 else { throw TagWriteException(String(cString: error)) }
  }

  /// Every property in the file, name to values, plus `_pictures`: how many are embedded.
  static func readAll(path: String) throws -> [String: Any] {
    var error = [CChar](repeating: 0, count: errorSize)
    guard let raw = melodify_tags_read_json(path, &error, errorSize) else {
      throw TagWriteException(String(cString: error))
    }
    defer { melodify_tags_free(raw) }
    let data = Data(bytes: raw, count: strlen(raw))
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw TagWriteException("unreadable tag dump")
    }
    return object
  }

  /// JPEG and PNG go in as they are unless they are huge; anything else UIKit can open (HEIC from
  /// the Photos app, say) is converted to JPEG, which every player can show.
  private static func encodedArtwork(_ url: URL) throws -> (Data, String) {
    let data: Data
    do {
      data = try Data(contentsOf: url)
    } catch {
      throw TagWriteException("cannot read the image: \(error.localizedDescription)")
    }
    let isPNG = data.starts(with: [0x89, 0x50, 0x4E, 0x47])
    let isJPEG = data.starts(with: [0xFF, 0xD8, 0xFF])
    guard let image = UIImage(data: data) else {
      throw TagWriteException("that file is not an image")
    }
    let side = max(image.size.width * image.scale, image.size.height * image.scale)
    if (isPNG || isJPEG) && side <= maxArtworkSide {
      return (data, isPNG ? "image/png" : "image/jpeg")
    }
    let factor = min(1, maxArtworkSide / max(side, 1))
    let size = CGSize(width: image.size.width * image.scale * factor, height: image.size.height * image.scale * factor)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let scaled = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    guard let jpeg = scaled.jpegData(compressionQuality: 0.9) else {
      throw TagWriteException("cannot convert the image")
    }
    return (jpeg, "image/jpeg")
  }

  /// C strings for the duration of `body`, as the `const char *const *` the C functions take.
  private static func withCStrings<R>(_ strings: [String], _ body: ([UnsafePointer<CChar>?]) -> R) -> R {
    let copies = strings.map { strdup($0) }
    defer { copies.forEach { free($0) } }
    return body(copies.map { UnsafePointer($0) })
  }
}
