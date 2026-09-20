Pod::Spec.new do |s|
  s.name           = 'MelodifyAudio'
  s.version        = '0.1.0'
  s.summary        = 'AVAudioEngine playback for Melodify'
  s.description    = 'Background audio, lock screen and remote commands for Melodify.'
  s.author         = 'Yeabsira'
  s.homepage       = 'https://github.com/itsyaba/melodify'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: 'https://github.com/itsyaba/melodify.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
