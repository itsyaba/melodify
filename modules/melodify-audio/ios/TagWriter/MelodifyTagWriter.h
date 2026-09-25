#ifndef MELODIFY_TAG_WRITER_H
#define MELODIFY_TAG_WRITER_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 Tag writing through TagLib (Vendor/taglib), behind plain C so the Swift module can call it
 without C++ interop. Paths are UTF-8 file system paths. Functions that can fail return 1 on
 success, and 0 with a message written to `error` otherwise.

 Keys are TagLib's format-independent property names, mapped by TagLib to each container's own
 fields (ID3v2 frames, MP4 atoms, Vorbis comments): TITLE, ARTIST, ALBUM, ALBUMARTIST, GENRE,
 COMPOSER, DATE, TRACKNUMBER, DISCNUMBER, COMMENT, LYRICS, and any other TagLib knows.
 */

/** Sets `keys[i]` to `values[i]`; an empty value removes the key. Other properties are kept. */
int melodify_tags_write(const char *path, const char *const *keys, const char *const *values, size_t count,
                        char *error, size_t error_size);

/**
 Replaces every embedded picture with one front cover of `length` bytes of `mime_type` (image/jpeg
 or image/png), or removes them all when `length` is 0.
 */
int melodify_tags_set_picture(const char *path, const void *data, size_t length, const char *mime_type,
                              char *error, size_t error_size);

/**
 Every property the file carries, as a JSON object of string arrays, plus "_pictures": the number
 of embedded pictures. For example {"ARTIST":["Band"],"TITLE":["Song"],"_pictures":1}. Free the
 result with `melodify_tags_free`. NULL on failure, with the reason in `error`.
 */
char *melodify_tags_read_json(const char *path, char *error, size_t error_size);

void melodify_tags_free(char *json);

#ifdef __cplusplus
}
#endif

#endif
