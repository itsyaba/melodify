cmake_minimum_required(VERSION 3.22.1)

project(melodify-tags CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# TagLib and the C tag writer are shared with the iOS build, which keeps them under ios/ because a
# pod can only compile sources inside its own folder. See ios/Vendor/README.md.
set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ios/Vendor")
set(TAGWRITER_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ios/TagWriter")

file(GLOB_RECURSE TAGLIB_SOURCES "${VENDOR_DIR}/taglib/*.cpp")

# TagLib's sources include each other's headers by bare name from every subdirectory, as its own
# CMake build arranges, so every one of those directories goes on the include path.
file(GLOB_RECURSE TAGLIB_ENTRIES LIST_DIRECTORIES true "${VENDOR_DIR}/taglib/*")
set(TAGLIB_INCLUDE_DIRS "${VENDOR_DIR}/taglib")
foreach(entry ${TAGLIB_ENTRIES})
  if(IS_DIRECTORY "${entry}")
    list(APPEND TAGLIB_INCLUDE_DIRS "${entry}")
  endif()
endforeach()

add_library(
  melodify-tags
  SHARED
  ${TAGLIB_SOURCES}
  "${TAGWRITER_DIR}/MelodifyTagWriter.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/melodify_tags_jni.cpp"
)

target_include_directories(
  melodify-tags
  PRIVATE
  ${TAGLIB_INCLUDE_DIRS}
  "${VENDOR_DIR}/utfcpp"
  "${TAGWRITER_DIR}"
)

target_compile_definitions(melodify-tags PRIVATE TAGLIB_STATIC=1)
# TagLib's warnings are not ours to fix, and would bury ours in the build log.
set_source_files_properties(${TAGLIB_SOURCES} PROPERTIES COMPILE_OPTIONS "-w")
target_compile_options(melodify-tags PRIVATE -O2 -fvisibility=hidden)

find_library(LOG_LIB log)
target_link_libraries(melodify-tags z ${LOG_LIB})
