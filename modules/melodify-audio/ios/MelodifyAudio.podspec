Pod::Spec.new do |s|
  s.name           = 'MelodifyAudio'
  s.version        = '0.8.0'
  s.summary        = 'AVAudioEngine playback for Melodify'
  s.description    = 'Background audio, lock screen, remote commands, gapless, crossfade, EQ and tag writing for Melodify.'
  s.author         = 'Yeabsira'
  s.homepage       = 'https://github.com/itsyaba/melodify'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: 'https://github.com/itsyaba/melodify.git' }
  # Pinned rather than inherited: the module is written for Swift 5 language mode, which is
  # what CocoaPods happens to default this target to today. ExpoModulesCore is on 6.0.
  s.swift_version  = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # TagLib (Vendor/, see its README) is compiled in for tag writing. Its sources include each
  # other's headers by bare name from every subdirectory, as its CMake build arranges, so every
  # one of those directories goes on the header search path. TagLib's headers must stay out of
  # the module's public headers: they are C++, and the umbrella header Swift imports is not.
  taglib_dirs = Dir.glob(File.join(__dir__, 'Vendor', 'taglib', '**', '')).sort.map do |dir|
    "\"$(PODS_TARGET_SRCROOT)/#{dir.delete_prefix("#{__dir__}/").chomp('/')}\""
  end

  s.pod_target_xcconfig = {
    # Swift/Objective-C compatibility
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'HEADER_SEARCH_PATHS' => (taglib_dirs + ['"$(PODS_TARGET_SRCROOT)/Vendor/utfcpp"']).join(' '),
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) TAGLIB_STATIC=1',
    # C and C++ only (clang's -w); Swift warnings still show. TagLib's are not ours to fix, and
    # would bury ours in the build log.
    'GCC_WARN_INHIBIT_ALL_WARNINGS' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.public_header_files = 'TagWriter/MelodifyTagWriter.h'
  # TagLib's templates are .tcc files its headers include; they are not compiled on their own.
  s.preserve_paths = 'Vendor/**/*'
  s.libraries = 'z', 'c++'
  # The default cover, for tracks with no art of their own. The app shows the same file
  # (src/components/artwork.tsx), so the lock screen and the app cannot drift apart.
  s.resource_bundles = { 'MelodifyAudioResources' => ['Resources/*.jpg'] }
end
