// JNI side of TagLibNative.kt: tag reading for the library scan, and the tag editor's writes
// through the C functions shared with iOS (ios/TagWriter/MelodifyTagWriter.h).
//
// Paths and text cross as UTF-8 byte arrays rather than jstrings: JNI's string functions use
// "modified UTF-8", which spells characters outside the BMP (emoji in a file name) differently,
// so a path could not be opened and a tag could crash NewStringUTF.

#include <jni.h>

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include <audioproperties.h>
#include <fileref.h>
#include <tbytevector.h>
#include <tlist.h>
#include <tpropertymap.h>
#include <tstring.h>
#include <tstringlist.h>
#include <tvariant.h>

#include "MelodifyTagWriter.h"

namespace {

std::string bytes(JNIEnv *env, jbyteArray array) {
  if (!array) return std::string();
  const jsize length = env->GetArrayLength(array);
  std::string out(static_cast<size_t>(length), '\0');
  if (length > 0) env->GetByteArrayRegion(array, 0, length, reinterpret_cast<jbyte *>(&out[0]));
  return out;
}

jbyteArray toArray(JNIEnv *env, const char *data, size_t length) {
  jbyteArray array = env->NewByteArray(static_cast<jsize>(length));
  if (array && length > 0) env->SetByteArrayRegion(array, 0, static_cast<jsize>(length), reinterpret_cast<const jbyte *>(data));
  return array;
}

void throwIO(JNIEnv *env, const std::string &message) {
  jclass io = env->FindClass("java/io/IOException");
  if (io) env->ThrowNew(io, message.c_str());
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
          out += static_cast<char>(c);
        }
    }
  }
  out += '"';
}

/** The front cover if the file says which picture that is, otherwise the first one. */
TagLib::ByteVector frontCover(TagLib::FileRef &file) {
  const TagLib::List<TagLib::VariantMap> pictures = file.complexProperties("PICTURE");
  TagLib::ByteVector first;
  for (const auto &picture : pictures) {
    const auto data = picture.value("data").value<TagLib::ByteVector>();
    if (data.isEmpty()) continue;
    const auto type = picture.value("pictureType").value<TagLib::String>();
    if (type == "Front Cover") return data;
    if (first.isEmpty()) first = data;
  }
  return first;
}

}  // namespace

extern "C" {

/**
 Every property as a JSON object of string arrays under "props", with the audio properties beside
 it, and the cover's bytes: [json, picture or null]. Null when TagLib cannot read the file at all.
 */
JNIEXPORT jobjectArray JNICALL Java_dev_yeab_melodify_audio_TagLibNative_read(JNIEnv *env, jclass, jbyteArray pathBytes) {
  const std::string path = bytes(env, pathBytes);
  if (path.empty()) return nullptr;
  TagLib::FileRef file(path.c_str(), true, TagLib::AudioProperties::Average);
  if (file.isNull() || !file.file()->isValid()) return nullptr;

  std::string json = "{\"props\":{";
  const TagLib::PropertyMap properties = file.properties();
  bool firstKey = true;
  for (auto it = properties.begin(); it != properties.end(); ++it) {
    if (!firstKey) json += ',';
    firstKey = false;
    appendJsonString(json, it->first.to8Bit(true));
    json += ":[";
    bool firstValue = true;
    for (const auto &value : it->second) {
      if (!firstValue) json += ',';
      firstValue = false;
      appendJsonString(json, value.to8Bit(true));
    }
    json += ']';
  }
  json += '}';
  if (const TagLib::AudioProperties *audio = file.audioProperties()) {
    json += ",\"lengthMs\":" + std::to_string(audio->lengthInMilliseconds());
    json += ",\"bitrate\":" + std::to_string(audio->bitrate());
    json += ",\"sampleRate\":" + std::to_string(audio->sampleRate());
    json += ",\"channels\":" + std::to_string(audio->channels());
  }
  json += '}';

  jclass objectClass = env->FindClass("java/lang/Object");
  jobjectArray result = env->NewObjectArray(2, objectClass, nullptr);
  if (!result) return nullptr;
  jbyteArray jsonArray = toArray(env, json.data(), json.size());
  env->SetObjectArrayElement(result, 0, jsonArray);
  env->DeleteLocalRef(jsonArray);
  const TagLib::ByteVector cover = frontCover(file);
  if (!cover.isEmpty()) {
    jbyteArray picture = toArray(env, cover.data(), cover.size());
    env->SetObjectArrayElement(result, 1, picture);
    env->DeleteLocalRef(picture);
  }
  return result;
}

JNIEXPORT void JNICALL Java_dev_yeab_melodify_audio_TagLibNative_write(
    JNIEnv *env, jclass, jbyteArray pathBytes, jobjectArray keyArrays, jobjectArray valueArrays) {
  const std::string path = bytes(env, pathBytes);
  const jsize count = keyArrays ? env->GetArrayLength(keyArrays) : 0;
  std::vector<std::string> keys, values;
  keys.reserve(count);
  values.reserve(count);
  for (jsize i = 0; i < count; ++i) {
    auto key = static_cast<jbyteArray>(env->GetObjectArrayElement(keyArrays, i));
    auto value = static_cast<jbyteArray>(env->GetObjectArrayElement(valueArrays, i));
    keys.push_back(bytes(env, key));
    values.push_back(bytes(env, value));
    env->DeleteLocalRef(key);
    env->DeleteLocalRef(value);
  }
  std::vector<const char *> keyPointers, valuePointers;
  for (jsize i = 0; i < count; ++i) {
    keyPointers.push_back(keys[i].c_str());
    valuePointers.push_back(values[i].c_str());
  }
  char error[512] = {0};
  if (melodify_tags_write(path.c_str(), keyPointers.data(), valuePointers.data(), keys.size(), error, sizeof error) != 1) {
    throwIO(env, error);
  }
}

JNIEXPORT void JNICALL Java_dev_yeab_melodify_audio_TagLibNative_setPicture(
    JNIEnv *env, jclass, jbyteArray pathBytes, jbyteArray data, jbyteArray mimeBytes) {
  const std::string path = bytes(env, pathBytes);
  const std::string picture = bytes(env, data);
  const std::string mime = bytes(env, mimeBytes);
  char error[512] = {0};
  const int ok = picture.empty()
      ? melodify_tags_set_picture(path.c_str(), nullptr, 0, nullptr, error, sizeof error)
      : melodify_tags_set_picture(path.c_str(), picture.data(), picture.size(), mime.c_str(), error, sizeof error);
  if (ok != 1) throwIO(env, error);
}

JNIEXPORT jbyteArray JNICALL Java_dev_yeab_melodify_audio_TagLibNative_readAll(JNIEnv *env, jclass, jbyteArray pathBytes) {
  const std::string path = bytes(env, pathBytes);
  char error[512] = {0};
  char *json = melodify_tags_read_json(path.c_str(), error, sizeof error);
  if (!json) {
    throwIO(env, error);
    return nullptr;
  }
  jbyteArray result = toArray(env, json, std::char_traits<char>::length(json));
  melodify_tags_free(json);
  return result;
}

}  // extern "C"
