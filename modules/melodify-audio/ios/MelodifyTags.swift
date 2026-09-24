import AVFoundation
import CryptoKit
import ExpoModulesCore

/// One file's tags, mirroring the columns of `tracks` in src/db/schema.ts.
internal struct TrackTagsRecord: Record {
  /// Echoed back so JS matches results to rows by path rather than by array position.
  @Field var uri: String = ""
  @Field var title: String? = nil
  @Field var artist: String? = nil
  @Field var album: String? = nil
  @Field var albumArtist: String? = nil
  @Field var genre: String? = nil
  @Field var composer: String? = nil
  @Field var year: Int? = nil
  @Field var trackNo: Int? = nil
  @Field var discNo: Int? = nil
  @Field var durationMs: Int? = nil
  @Field var bitrate: Int? = nil
  @Field var sampleRate: Int? = nil
  /// Relative to Documents/, e.g. ".artcache/ab12cd34.jpg". Null when there is no embedded art.
  @Field var artKey: String? = nil
  /// Set when this one file failed. The rest of the batch still comes back.
  @Field var error: String? = nil
}

/**
 Tag reading through AVAsset: ID3, iTunes atoms and Vorbis comments in FLAC, whatever Core Audio
 parses. Static throughout, so the module's async closure captures nothing and does not drag a
 non-Sendable module across a concurrency boundary.

 Reading is sequential. It happens once per file — the row is marked tagged afterwards — and the
 JS side batches the work so progress keeps moving, which matters more here than raw throughput.
 */
internal enum MelodifyTags {
  static func read(uris: [String], artCacheDirectory: String) async -> [TrackTagsRecord] {
    let cacheURL = fileURL(from: artCacheDirectory)
    try? FileManager.default.createDirectory(at: cacheURL, withIntermediateDirectories: true)

    var results: [TrackTagsRecord] = []
    results.reserveCapacity(uris.count)
    for uri in uris {
      results.append(await readOne(uri: uri, cacheURL: cacheURL))
    }
    return results
  }

  private static func readOne(uri: String, cacheURL: URL) async -> TrackTagsRecord {
    var record = TrackTagsRecord()
    record.uri = uri

    let url = fileURL(from: uri)
    guard FileManager.default.fileExists(atPath: url.path) else {
      record.error = "no such file"
      return record
    }

    let asset = AVURLAsset(url: url)
    do {
      let duration = try await asset.load(.duration)
      if duration.isNumeric {
        let seconds = CMTimeGetSeconds(duration)
        if seconds.isFinite, seconds > 0 {
          record.durationMs = Int((seconds * 1000).rounded())
        }
      }

      if let track = try await asset.loadTracks(withMediaType: .audio).first {
        let rate = try await track.load(.estimatedDataRate)
        if rate > 0 {
          record.bitrate = Int(rate)
        }
        let formats = try await track.load(.formatDescriptions)
        if let description = formats.first,
           let basic = CMAudioFormatDescriptionGetStreamBasicDescription(description),
           basic.pointee.mSampleRate > 0 {
          record.sampleRate = Int(basic.pointee.mSampleRate)
        }
      }

      let metadata = try await asset.load(.metadata)
      record = await apply(metadata: metadata, to: record, cacheURL: cacheURL)
    } catch {
      record.error = error.localizedDescription
    }
    return record
  }

  /// Returns a modified copy rather than taking `inout`: the body mutates across `await`
  /// boundaries, and an exclusive borrow held over a suspension is a trap worth not setting.
  private static func apply(
    metadata: [AVMetadataItem], to record: TrackTagsRecord, cacheURL: URL
  ) async -> TrackTagsRecord {
    var result = record

    for item in metadata {
      // Common keys first: they are the format-independent spelling and cover most files.
      switch item.commonKey {
      case .some(.commonKeyTitle):
        result.title = await text(item) ?? result.title
      case .some(.commonKeyArtist):
        result.artist = await text(item) ?? result.artist
      case .some(.commonKeyAlbumName):
        result.album = await text(item) ?? result.album
      case .some(.commonKeyCreationDate):
        if result.year == nil {
          result.year = year(from: await text(item))
        }
      case .some(.commonKeyArtwork):
        if result.artKey == nil, let data = try? await item.load(.dataValue) {
          result.artKey = writeArtwork(data, to: cacheURL)
        }
      default:
        break
      }

      // Then the fields with no common key, which have to be spelled per container.
      switch item.identifier {
      case .some(.id3MetadataBand), .some(.iTunesMetadataAlbumArtist):
        result.albumArtist = await text(item) ?? result.albumArtist
      case .some(.id3MetadataContentType), .some(.iTunesMetadataUserGenre),
           .some(.iTunesMetadataPredefinedGenre):
        result.genre = await text(item) ?? result.genre
      case .some(.id3MetadataComposer), .some(.iTunesMetadataComposer):
        result.composer = await text(item) ?? result.composer
      case .some(.id3MetadataTrackNumber), .some(.iTunesMetadataTrackNumber):
        if result.trackNo == nil {
          result.trackNo = await number(item)
        }
      case .some(.id3MetadataPartOfASet), .some(.iTunesMetadataDiscNumber):
        if result.discNo == nil {
          result.discNo = await number(item)
        }
      case .some(.id3MetadataYear), .some(.id3MetadataRecordingTime),
           .some(.iTunesMetadataReleaseDate):
        if result.year == nil {
          result.year = year(from: await text(item))
        }
      default:
        break
      }

      // Vorbis comments (FLAC) have no identifier constants, so they are matched on their plain
      // key, uppercased because taggers disagree on case. ID3 and iTunes keys are four-character
      // codes, so nothing here can collide with them. Only fills what the switches above left empty.
      guard let key = (item.key as? String)?.uppercased() else { continue }
      switch key {
      case "TITLE" where result.title == nil:
        result.title = await text(item)
      case "ARTIST" where result.artist == nil:
        result.artist = await text(item)
      case "ALBUM" where result.album == nil:
        result.album = await text(item)
      case "ALBUMARTIST" where result.albumArtist == nil, "ALBUM ARTIST" where result.albumArtist == nil:
        result.albumArtist = await text(item)
      case "GENRE" where result.genre == nil:
        result.genre = await text(item)
      case "COMPOSER" where result.composer == nil:
        result.composer = await text(item)
      case "TRACKNUMBER" where result.trackNo == nil:
        result.trackNo = await number(item)
      case "DISCNUMBER" where result.discNo == nil:
        result.discNo = await number(item)
      case "DATE" where result.year == nil, "YEAR" where result.year == nil:
        result.year = year(from: await text(item))
      default:
        break
      }
    }
    return result
  }

  private static func text(_ item: AVMetadataItem) async -> String? {
    guard let value = try? await item.load(.stringValue) else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  /// ID3 writes track numbers as "3" or "3/12"; iTunes writes a binary pair whose number sits in
  /// bytes 2 and 3. Both are read here so the two containers land on the same integer.
  private static func number(_ item: AVMetadataItem) async -> Int? {
    if let string = await text(item) {
      let leading = string.prefix { $0.isNumber }
      if let value = Int(leading), value > 0 {
        return value
      }
    }
    if let data = try? await item.load(.dataValue), data.count >= 4 {
      let value = Int(data[2]) << 8 | Int(data[3])
      if value > 0 {
        return value
      }
    }
    if let number = try? await item.load(.numberValue), number.intValue > 0 {
      return number.intValue
    }
    return nil
  }

  /// Dates arrive as "2011", "2011-05-03" or a full timestamp; only the year is kept.
  private static func year(from value: String?) -> Int? {
    guard let value, value.count >= 4 else { return nil }
    guard let year = Int(value.prefix(4)), year > 1000, year < 3000 else { return nil }
    return year
  }

  /// Named by a hash of the image itself, so every track on an album points at one cached file
  /// instead of one copy per track.
  private static func writeArtwork(_ data: Data, to cacheURL: URL) -> String? {
    guard !data.isEmpty else { return nil }
    let name = SHA256.hash(data: data).prefix(8).map { String(format: "%02x", $0) }.joined()
    let filename = "\(name).\(imageExtension(for: data))"
    let file = cacheURL.appendingPathComponent(filename)
    if !FileManager.default.fileExists(atPath: file.path) {
      do {
        try data.write(to: file)
      } catch {
        return nil
      }
    }
    return "\(cacheURL.lastPathComponent)/\(filename)"
  }

  /// `expo-file-system` hands JS a percent-encoded `file://` URI; accept a bare path too. The art
  /// cache directory arrives the same way, so it goes through here as well.
  private static func fileURL(from uri: String) -> URL {
    URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
  }

  private static func imageExtension(for data: Data) -> String {
    data.starts(with: [0x89, 0x50, 0x4E, 0x47]) ? "png" : "jpg"
  }
}
