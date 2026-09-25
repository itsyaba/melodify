Pod::Spec.new do |s|
  s.name           = 'MelodifyAudio'
  s.version        = '0.7.0'
  s.summary        = 'AVAudioEngine playback for Melodify'
  s.description    = 'Background audio, lock screen, remote commands, gapless, crossfade and EQ for Melodify.'
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

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  # The default cover, for tracks with no art of their own. The app shows the same file
  # (src/components/artwork.tsx), so the lock screen and the app cannot drift apart.
  s.resource_bundles = { 'MelodifyAudioResources' => ['Resources/*.jpg'] }
end
