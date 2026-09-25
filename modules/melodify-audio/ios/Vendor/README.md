# Vendored libraries

Compiled into `melodify-audio` for tag writing (see `../TagLib/`). Kept exactly as released apart
from the two hand-written config headers and the dropped CMake files.

| Library | Version | License | Source |
| --- | --- | --- | --- |
| TagLib | 2.1.1 | LGPL 2.1 or MPL 1.1 (used under MPL 1.1) | https://github.com/taglib/taglib |
| utfcpp | df857ef (the commit TagLib 2.1.1 pins) | Boost Software License 1.0 | https://github.com/nemtrif/utfcpp |

- `taglib/` is TagLib's `taglib/` source directory. `config.h` and `taglib_config.h` stand in
  for the headers its CMake build generates.
- `utfcpp/` is utfcpp's `source/` directory (header only).
- `licenses/` holds both TagLib licenses and utfcpp's.

To update, replace the two directories with a newer release's and check that the defines in the
two config headers still match TagLib's `config.h.cmake` and `taglib/taglib_config.h.cmake`.
