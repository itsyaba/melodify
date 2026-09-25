#include "MelodifyTagWriter.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include <fileref.h>
#include <id3v2header.h>
#include <id3v2tag.h>
#include <mpegfile.h>
#include <tbytevector.h>
#include <tlist.h>
#include <tpropertymap.h>
#include <tstring.h>
#include <tstringlist.h>
#include <tvariant.h>

namespace {

void fail(char *error, size_t size, const std::string &message) {
  if (!error || size == 0) return;
  std::snprintf(error, size, "%s", message.c_str());
}

TagLib::String utf8(const char *text) {
  return TagLib::String(text ? text : "", TagLib::String::UTF8);
}

/** Opens without reading audio properties: none of this needs the stream, only the tags. */
bool open(const char *path, TagLib::FileRef &file, char *error, size_t error_size) {
  if (!path || !*path) {
    fail(error, error_size, "no path");
    return false;
  }
  file = TagLib::FileRef(path, false);
  if (file.isNull() || !file.file()->isValid()) {
    fail(error, error_size, "TagLib cannot read this file");
    return false;
  }
  if (file.file()->readOnly()) {
    fail(error, error_size, "the file is read-only");
    return false;
  }
  return true;
}

/**
 MP3s are saved with as little change as possible: TagLib's default adds an ID3v1 tag when there
 was none and rewrites an ID3v2.3 tag as 2.4. Here an ID3v1 tag is only kept up to date if the
 file already had one, APE likewise, and the ID3v2 tag keeps its version.
 */
bool saveMpeg(TagLib::MPEG::File *mpeg) {
  int tags = TagLib::MPEG::File::ID3v2;
  if (mpeg->hasID3v1Tag()) tags |= TagLib::MPEG::File::ID3v1;
  if (mpeg->hasAPETag()) tags |= TagLib::MPEG::File::APE;
  const TagLib::ID3v2::Tag *id3v2 = mpeg->ID3v2Tag();
  const TagLib::ID3v2::Version version =
      id3v2 && id3v2->header() && id3v2->header()->majorVersion() == 3 ? TagLib::ID3v2::v3 : TagLib::ID3v2::v4;
  return mpeg->save(tags, TagLib::File::StripNone, version, TagLib::File::Duplicate);
}

bool save(TagLib::FileRef &file, char *error, size_t error_size) {
  auto *mpeg = dynamic_cast<TagLib::MPEG::File *>(file.file());
  if (mpeg ? saveMpeg(mpeg) : file.save()) return true;
  fail(error, error_size, "TagLib could not save the file");
  return false;
}

void appendJsonString(std::string &out, const std::string &text) {
  out += '"';
  for (unsigned char c : text) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char escaped[8];
          std::snprintf(escaped, sizeof escaped, "\\u%04x", c);
          out += escaped;
        } else {
          // UTF-8 bytes pass through: JSON text is UTF-8 already.
          out += static_cast<char>(c);
        }
    }
  }
  out += '"';
}

}  // namespace

extern "C" int melodify_tags_write(const char *path, const char *const *keys, const char *const *values, size_t count,
                                   char *error, size_t error_size) {
  TagLib::FileRef file;
  if (!open(path, file, error, error_size)) return 0;
  TagLib::PropertyMap properties = file.properties();
  for (size_t i = 0; i < count; ++i) {
    const TagLib::String key = utf8(keys[i]).upper();
    const TagLib::String value = utf8(values[i]);
    if (key.isEmpty()) continue;
    if (value.isEmpty()) {
      properties.erase(key);
    } else {
      properties.replace(key, TagLib::StringList(value));
    }
  }
  // What comes back is whatever this format has no place for; the rest was set.
  const TagLib::PropertyMap unsupported = file.setProperties(properties);
  (void)unsupported;
  return save(file, error, error_size) ? 1 : 0;
}

extern "C" int melodify_tags_set_picture(const char *path, const void *data, size_t length, const char *mime_type,
                                         char *error, size_t error_size) {
  TagLib::FileRef file;
  if (!open(path, file, error, error_size)) return 0;
  TagLib::List<TagLib::VariantMap> pictures;
  if (length > 0 && data) {
    TagLib::VariantMap picture;
    picture["data"] = TagLib::ByteVector(static_cast<const char *>(data), static_cast<unsigned int>(length));
    picture["mimeType"] = utf8(mime_type && *mime_type ? mime_type : "image/jpeg");
    picture["description"] = TagLib::String();
    picture["pictureType"] = TagLib::String("Front Cover");
    pictures.append(picture);
  }
  if (!file.setComplexProperties("PICTURE", pictures)) {
    fail(error, error_size, "this format cannot hold artwork");
    return 0;
  }
  return save(file, error, error_size) ? 1 : 0;
}

extern "C" char *melodify_tags_read_json(const char *path, char *error, size_t error_size) {
  if (!path || !*path) {
    fail(error, error_size, "no path");
    return nullptr;
  }
  TagLib::FileRef file(path, false);
  if (file.isNull() || !file.file()->isValid()) {
    fail(error, error_size, "TagLib cannot read this file");
    return nullptr;
  }
  std::string out = "{";
  const TagLib::PropertyMap properties = file.properties();
  for (auto it = properties.begin(); it != properties.end(); ++it) {
    appendJsonString(out, it->first.to8Bit(true));
    out += ":[";
    bool first = true;
    for (const auto &value : it->second) {
      if (!first) out += ',';
      first = false;
      appendJsonString(out, value.to8Bit(true));
    }
    out += "],";
  }
  out += "\"_pictures\":" + std::to_string(file.complexProperties("PICTURE").size()) + "}";
  char *result = static_cast<char *>(std::malloc(out.size() + 1));
  if (!result) {
    fail(error, error_size, "out of memory");
    return nullptr;
  }
  std::memcpy(result, out.c_str(), out.size() + 1);
  return result;
}

extern "C" void melodify_tags_free(char *json) {
  std::free(json);
}
