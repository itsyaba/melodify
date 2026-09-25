/* config.h, written by hand for the Melodify build (TagLib's CMake would generate it). */

#ifndef TAGLIB_CONFIG_H
#define TAGLIB_CONFIG_H

/* Byte swapping: the compiler builtins exist on both clang (iOS) and gcc (the Linux test build). */
#define HAVE_GCC_BYTESWAP 1

/* zlib ships with iOS; it decompresses compressed ID3v2 frames. */
#define HAVE_ZLIB 1

#endif
