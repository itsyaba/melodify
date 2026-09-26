package dev.yeab.melodify.audio

import android.content.ComponentName
import android.content.Context
import android.os.Build
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.services.FilePermissionService

/** Mirrors `NowPlayingMeta` in src/player/engine.ts. */
class NowPlayingMetaRecord : Record {
  @Field var title: String = ""
  @Field var artist: String? = null
  @Field var album: String? = null
  @Field var durationMs: Double? = null
  @Field var artUri: String? = null
  @Field var favorite: Boolean? = null

  internal fun toMeta() = NowPlayingMeta(title, artist, album, durationMs, artUri, favorite == true)
}

/** A partial `NowPlayingMeta`: the fields present are applied, the rest are left alone. */
class NowPlayingPatchRecord : Record {
  @Field var title: String? = null
  @Field var artist: String? = null
  @Field var album: String? = null
  @Field var durationMs: Double? = null
  @Field var artUri: String? = null
  @Field var favorite: Boolean? = null
}

class LoadOptionsRecord : Record {
  @Field var autoplay: Boolean = false
  @Field var startMs: Double = 0.0
  @Field var gainDb: Double = 0.0
}

/** Mirrors `NextTrack` in src/player/engine.ts. */
class NextTrackRecord : Record {
  @Field var uri: String = ""
  @Field var meta: NowPlayingMetaRecord = NowPlayingMetaRecord()
  @Field var gainDb: Double = 0.0
  @Field var key: String = ""
}

/** Mirrors `EqualizerSettings` in src/player/engine.ts. */
class EqualizerRecord : Record {
  @Field var enabled: Boolean = false
  @Field var preampDb: Double = 0.0
  @Field var gains: List<Double> = emptyList()
  @Field var bassBoost: Double = 0.0
}

/** Mirrors `TransitionSettings` in src/player/engine.ts. */
class TransitionRecord : Record {
  @Field var crossfadeMs: Double = 0.0
  @Field var gapless: Boolean = true
}

/** Mirrors `QuickAction` in src/utils/quick-actions.ts. */
class ShortcutRecord : Record {
  @Field var type: String = ""
  @Field var title: String = ""
  @Field var subtitle: String? = null
  @Field var symbol: String? = null
}

internal class AudioFileException(message: String) : CodedException("ERR_AUDIO_FILE", "Cannot open audio file ($message)", null)
internal class TagWriteException(message: String) : CodedException("ERR_TAG_WRITE", "Could not write the tags ($message)", null)
internal class ArchiveException(message: String) : CodedException("ERR_ARCHIVE", "Backup data could not be processed ($message)", null)
internal class NoActivityException : CodedException("ERR_NO_ACTIVITY", "Melodify is not in the foreground", null)

/**
 * The native half of `PlayerEngine` (src/player/engine.ts) on Android, with the same functions and
 * events as the Swift module (ios/MelodifyAudioModule.swift), so the JS side is one program for
 * both. FakeEngine is the reference for what each one is expected to do.
 *
 * Android adds: shared-storage access (`storageAccess`, `requestStorageAccess`), the system's media
 * index (`scanMediaFiles`), the share sheet (`shareFile`), and the wallpaper accent.
 */
class MelodifyAudioModule : Module() {
  private var player: MelodifyPlayer? = null
  private var session: MelodifySession? = null
  private var controller: ListenableFuture<MediaController>? = null
  /** A request for All files access, answered when the app comes back from the settings page. */
  private var pendingAccess: Promise? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun engine(): MelodifyPlayer = player ?: throw CodedException("ERR_NO_PLAYER", "The player is not running", null)

  override fun definition() = ModuleDefinition {
    Name("MelodifyAudio")

    // Distinguishes a real native module from any JS fallback, so the Settings diagnostic cannot
    // report success just because something answered.
    Constant("implementation") { "native-kotlin" }
    Constant("version") { "0.11.0" }
    // What `readTags` reads; see src/scan/read-tags.ts. TagLib reads ReplayGain too, as iOS 2 does.
    Constant("tagVersion") { 2 }
    Constant("storageRoot") { MelodifyStorage.root() }
    Constant("systemAccent") { MelodifyStorage.systemAccent(context) }
    Constant("sdkVersion") { Build.VERSION.SDK_INT }

    Events("state", "position", "ended", "advanced", "remote", "routeChange", "error", "shortcut")

    OnCreate {
      // Lets expo-file-system create files in shared storage; see SharedStoragePermissions.
      appContext.services.register(FilePermissionService::class.java, SharedStoragePermissions())
      val created = MelodifyPlayer(context)
      attach(created)
      player = created
      val made = MelodifySession(context, created) { command -> sendEvent("remote", command) }
      session = made
      MelodifyPlayback.session = made.session
      MelodifyPlayback.remote = { command -> sendEvent("remote", command) }
    }

    OnDestroy {
      controller?.let { future -> future.addListener({ runCatching { future.get().release() } }, Runnable::run) }
      controller = null
      MelodifyPlayback.session = null
      MelodifyPlayback.remote = null
      session?.release()
      session = null
      player?.teardown()
      player = null
    }

    AsyncFunction("load") { uri: String, meta: NowPlayingMetaRecord, options: LoadOptionsRecord, promise: Promise ->
      val file = fileFrom(uri)
      if (!file.isFile) throw AudioFileException("${file.name}: no such file")
      bindService()
      engine().load(uri, meta.toMeta(), options.startMs, options.autoplay, options.gainDb) { error ->
        if (error == null) promise.resolve(null) else promise.reject(AudioFileException(error.message ?: "unknown error"))
      }
    }

    // The track to move on to without a gap, or with a crossfade. Null disarms.
    AsyncFunction("setNext") { next: NextTrackRecord? ->
      val item = next?.takeIf { fileFrom(it.uri).isFile }?.let { NextTrackItem(it.uri, it.meta.toMeta(), it.gainDb, it.key) }
      engine().setNext(item)
    }

    AsyncFunction("setTransition") { settings: TransitionRecord ->
      engine().setTransition(settings.crossfadeMs, settings.gapless)
    }

    AsyncFunction("setEqualizer") { settings: EqualizerRecord ->
      engine().setEqualizer(EqualizerConfig(settings.enabled, settings.preampDb, settings.gains, settings.bassBoost))
    }

    AsyncFunction("setPitch") { semitones: Double -> engine().setPitch(semitones) }

    AsyncFunction("setSkipSilence") { enabled: Boolean -> engine().setSkipSilence(enabled) }

    AsyncFunction("updateNowPlaying") { patch: NowPlayingPatchRecord ->
      engine().updateNowPlaying { meta ->
        meta.copy(
          title = patch.title ?: meta.title,
          artist = patch.artist ?: meta.artist,
          album = patch.album ?: meta.album,
          durationMs = patch.durationMs ?: meta.durationMs,
          artUri = patch.artUri ?: meta.artUri,
          favorite = patch.favorite ?: meta.favorite,
        )
      }
    }

    // ExoPlayer opens a local file in a few milliseconds; there is nothing to gain from opening
    // the next one early, as the Swift module does.
    AsyncFunction("preload") { _: String -> }

    AsyncFunction("play") { engine().play() }
    AsyncFunction("pause") { engine().pause() }
    AsyncFunction("stop") { engine().stop() }
    AsyncFunction("seek") { positionMs: Double -> engine().seek(positionMs) }
    AsyncFunction("setRate") { rate: Double -> engine().setRate(rate) }
    AsyncFunction("setVolume") { volume: Double -> engine().setVolume(volume) }

    AsyncFunction("getPosition") {
      val (position, duration) = engine().currentPosition()
      mapOf("positionMs" to position, "durationMs" to duration)
    }

    // Synchronous so the Settings diagnostic can read the engine without awaiting.
    Function("getState") { player?.currentState()?.raw ?: "idle" }

    // Tags, through TagLib. Independent of playback, so a scan can run while music plays.
    AsyncFunction("readTags") { uris: List<String>, artCacheDirectory: String ->
      MelodifyTags.read(uris, artCacheDirectory)
    }

    AsyncFunction("readLyrics") { uri: String -> MelodifyTags.lyrics(uri) }

    AsyncFunction("writeTags") { uri: String, fields: Map<String, String> ->
      try {
        MelodifyTags.write(uri, fields)
      } catch (error: Exception) {
        throw TagWriteException(error.message ?: "unknown error")
      }
      MelodifyStorage.scan(context, listOf(uri))
    }

    AsyncFunction("setArtwork") { uri: String, imageUri: String? ->
      try {
        MelodifyTags.setArtwork(context, uri, imageUri)
      } catch (error: Exception) {
        throw TagWriteException(error.message ?: "unknown error")
      }
      MelodifyStorage.scan(context, listOf(uri))
    }

    AsyncFunction("readAllTags") { uri: String ->
      try {
        MelodifyTags.readAll(uri)
      } catch (error: Exception) {
        throw TagWriteException(error.message ?: "unknown error")
      }
    }

    // App shortcuts on the launcher icon.
    AsyncFunction("setShortcuts") { items: List<ShortcutRecord> ->
      MelodifyShortcuts.set(context, items.map { MelodifyShortcuts.Item(it.type, it.title, it.subtitle, it.symbol) })
    }

    Function("takeLaunchShortcut") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      val type = intent.getStringExtra(MelodifyShortcuts.EXTRA)
      intent.removeExtra(MelodifyShortcuts.EXTRA)
      type
    }

    OnNewIntent { intent ->
      val type = intent.getStringExtra(MelodifyShortcuts.EXTRA) ?: return@OnNewIntent
      intent.removeExtra(MelodifyShortcuts.EXTRA)
      sendEvent("shortcut", mapOf("type" to type))
    }

    // The byte work of a backup, off the JS thread (src/backup/codec.ts).
    AsyncFunction("blowfish") { data: ByteArray, key: ByteArray, encrypt: Boolean ->
      try {
        MelodifyArchive.blowfish(data, key, encrypt)
      } catch (error: Exception) {
        throw ArchiveException(error.message ?: "unknown error")
      }
    }
    AsyncFunction("md5") { data: ByteArray -> MelodifyArchive.md5(data) }
    AsyncFunction("utf8") { data: ByteArray -> MelodifyArchive.utf8(data) }
    AsyncFunction("crc32") { data: ByteArray -> MelodifyArchive.crc32(data) }
    AsyncFunction("deflate") { data: ByteArray -> MelodifyArchive.deflate(data) }
    AsyncFunction("inflate") { data: ByteArray, size: Int ->
      try {
        MelodifyArchive.inflate(data, size)
      } catch (error: Exception) {
        throw ArchiveException(error.message ?: "unknown error")
      }
    }

    // Android only: shared storage.
    Function("storageAccess") { MelodifyStorage.access(context) }

    /**
     * "full" opens the system's All files access page (Android 11 and later) and answers when the
     * app is back; before Android 11, and for "read", it asks for the runtime permissions.
     */
    AsyncFunction("requestStorageAccess") { kind: String, promise: Promise ->
      val activity = appContext.currentActivity ?: throw NoActivityException()
      if (kind == "full" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        pendingAccess?.resolve(MelodifyStorage.access(context))
        pendingAccess = promise
        MelodifyStorage.openAllFilesSettings(activity)
        return@AsyncFunction
      }
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(MelodifyStorage.access(context))
        return@AsyncFunction
      }
      permissions.askForPermissions({ promise.resolve(MelodifyStorage.access(context)) }, *MelodifyStorage.runtimePermissions())
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersForeground {
      pendingAccess?.let {
        pendingAccess = null
        it.resolve(MelodifyStorage.access(context))
      }
    }

    AsyncFunction("scanMediaFiles") { uris: List<String> -> MelodifyStorage.scan(context, uris) }

    AsyncFunction("shareFile") { uri: String, mimeType: String?, title: String? ->
      val activity = appContext.currentActivity ?: throw NoActivityException()
      MelodifyStorage.share(activity, uri, mimeType, title)
    }.runOnQueue(Queues.MAIN)
  }

  /** Events originate on the player's audio thread, including a 4 Hz position tick. */
  private fun attach(p: MelodifyPlayer) {
    p.onState = { state -> sendEvent("state", mapOf("state" to state.raw)) }
    p.onPosition = { position, duration -> sendEvent("position", mapOf("positionMs" to position, "durationMs" to duration)) }
    p.onEnded = { sendEvent("ended", emptyMap<String, Any?>()) }
    p.onAdvanced = { item -> sendEvent("advanced", mapOf("key" to item.key)) }
    p.onError = { message -> sendEvent("error", mapOf("message" to message)) }
    p.onRouteChange = { reason, wasPlaying -> sendEvent("routeChange", mapOf("reason" to reason, "wasPlaying" to wasPlaying)) }
    p.onNowPlaying = { session?.refresh() }
  }

  /**
   * Connecting a controller starts the playback service and keeps it bound while the app runs;
   * Media3 moves it to the foreground, with the notification, whenever something plays.
   */
  private fun bindService() {
    if (controller != null) return
    val p = player ?: return
    val token = SessionToken(context, ComponentName(context, MelodifyPlaybackService::class.java))
    controller = MediaController.Builder(context, token).setApplicationLooper(p.looper).buildAsync()
  }
}
