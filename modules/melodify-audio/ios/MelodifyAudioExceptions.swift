import ExpoModulesCore

internal final class AudioFileException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Cannot open audio file (\(param))"
  }
}

internal final class EngineStartException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Audio engine failed to start (\(param))"
  }
}

internal final class AudioSessionException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Audio session could not be activated (\(param))"
  }
}
