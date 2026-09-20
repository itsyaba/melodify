import ExpoModulesCore

internal final class AudioFileException: GenericException<String> {
  override var reason: String {
    "Cannot open audio file (\(param))"
  }
}

internal final class NoTrackLoadedException: Exception {
  override var reason: String {
    "No track is loaded"
  }
}

internal final class EngineStartException: GenericException<String> {
  override var reason: String {
    "Audio engine failed to start (\(param))"
  }
}

internal final class AudioSessionException: GenericException<String> {
  override var reason: String {
    "Audio session could not be activated (\(param))"
  }
}
