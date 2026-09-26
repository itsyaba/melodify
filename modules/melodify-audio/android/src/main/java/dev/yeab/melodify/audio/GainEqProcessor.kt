package dev.yeab.melodify.audio

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sinh
import kotlin.math.sqrt

/** Mirrors `EqualizerSettings` in src/player/engine.ts. */
internal data class EqualizerConfig(
  val enabled: Boolean = false,
  val preampDb: Double = 0.0,
  val gains: List<Double> = emptyList(),
  val bassBoost: Double = 0.0,
)

/** The equalizer both decks read, so a change reaches whichever one is playing. */
internal class EqualizerState {
  @Volatile var config = EqualizerConfig()
    private set
  @Volatile var version = 0
    private set

  fun set(next: EqualizerConfig) {
    config = next
    version += 1
  }
}

/**
 * The equalizer and the positive half of ReplayGain, as one step in each deck's audio sink:
 *
 *     pre-amp and boost -> ten peaking bands (31 Hz to 16 kHz, one octave wide) -> low shelf at 90 Hz
 *
 * the same filters AVAudioUnitEQ runs on iOS (ios/MelodifyPlayer.swift). Work is done in doubles and
 * clipped once on the way out. A flat equalizer with no boost copies the audio through untouched.
 *
 * ReplayGain that lowers a song is the player's volume instead, which acts on what is being heard
 * rather than on audio decoded ahead of it; only a raise, which the volume cannot give, lands here.
 */
@OptIn(UnstableApi::class)
internal class GainEqProcessor(private val eq: EqualizerState) : BaseAudioProcessor() {
  /** ReplayGain raise for the deck's current file, 0 to 6 dB. */
  @Volatile var boostDb = 0.0

  private var builtVersion = -1
  private var builtBoost = Double.NaN
  private var builtRate = -1
  private var builtChannels = -1
  private var gain = 1.0
  private var filters: Array<Biquad> = emptyArray()
  /** Per filter, per channel: the two delayed inputs and outputs (direct form I). */
  private var history = DoubleArray(0)
  private var bypass = true

  override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT && inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT) {
      throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
    }
    return inputAudioFormat
  }

  override fun onFlush() {
    history.fill(0.0)
  }

  override fun onReset() {
    builtVersion = -1
    filters = emptyArray()
    history = DoubleArray(0)
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val size = inputBuffer.remaining()
    if (size == 0) return
    rebuildIfNeeded()
    val out = replaceOutputBuffer(size)
    if (bypass) {
      out.put(inputBuffer)
      out.flip()
      return
    }
    val channels = inputAudioFormat.channelCount
    inputBuffer.order(ByteOrder.nativeOrder())
    if (inputAudioFormat.encoding == C.ENCODING_PCM_16BIT) {
      var channel = 0
      while (inputBuffer.remaining() >= 2) {
        val y = process(inputBuffer.short / 32768.0, channel)
        out.putShort((y * 32767.0).coerceIn(-32768.0, 32767.0).toInt().toShort())
        channel = if (channel + 1 == channels) 0 else channel + 1
      }
    } else {
      var channel = 0
      while (inputBuffer.remaining() >= 4) {
        val y = process(inputBuffer.float.toDouble(), channel)
        out.putFloat(y.coerceIn(-1.0, 1.0).toFloat())
        channel = if (channel + 1 == channels) 0 else channel + 1
      }
    }
    out.flip()
  }

  private fun process(sample: Double, channel: Int): Double {
    var x = sample * gain
    val stride = inputAudioFormat.channelCount * 4
    for (i in filters.indices) {
      val f = filters[i]
      val h = i * stride + channel * 4
      val y = f.b0 * x + f.b1 * history[h] + f.b2 * history[h + 1] - f.a1 * history[h + 2] - f.a2 * history[h + 3]
      history[h + 1] = history[h]
      history[h] = x
      history[h + 3] = history[h + 2]
      history[h + 2] = y
      x = y
    }
    return x
  }

  /** Coefficients follow the settings, the boost and the format; the filters' state is kept. */
  private fun rebuildIfNeeded() {
    val version = eq.version
    val boost = boostDb
    val rate = inputAudioFormat.sampleRate
    val channels = inputAudioFormat.channelCount
    if (version == builtVersion && boost == builtBoost && rate == builtRate && channels == builtChannels) return
    val config = eq.config
    builtVersion = version
    builtBoost = boost
    val on = config.enabled
    val preamp = if (on) config.preampDb.coerceIn(-RANGE_DB, RANGE_DB) else 0.0
    gain = 10.0.pow((preamp + boost.coerceIn(0.0, MAX_BOOST_DB)) / 20)
    val next = ArrayList<Biquad>()
    if (on) {
      FREQUENCIES.forEachIndexed { i, frequency ->
        val db = config.gains.getOrElse(i) { 0.0 }.coerceIn(-RANGE_DB, RANGE_DB)
        // A band at 0 dB passes the signal unchanged, so it is left out rather than computed.
        if (db != 0.0 && frequency < rate * 0.45) next.add(Biquad.peaking(frequency, db, rate.toDouble()))
      }
      val shelf = config.bassBoost.coerceIn(0.0, 1.0) * BASS_BOOST_MAX_DB
      if (shelf > 0) next.add(Biquad.lowShelf(BASS_SHELF_HZ, shelf, rate.toDouble()))
    }
    val sameShape = next.size == filters.size && channels == builtChannels
    filters = next.toTypedArray()
    if (!sameShape) history = DoubleArray(filters.size * channels * 4)
    builtRate = rate
    builtChannels = channels
    bypass = filters.isEmpty() && gain == 1.0
  }

  private class Biquad(val b0: Double, val b1: Double, val b2: Double, val a1: Double, val a2: Double) {
    companion object {
      /** RBJ's cookbook peaking filter, bandwidth in octaves, as AVAudioUnitEQ's parametric band. */
      fun peaking(frequency: Double, db: Double, rate: Double, octaves: Double = 1.0): Biquad {
        val a = 10.0.pow(db / 40)
        val w0 = 2 * PI * frequency / rate
        val alpha = sin(w0) * sinh(ln(2.0) / 2 * octaves * w0 / sin(w0))
        val a0 = 1 + alpha / a
        return Biquad(
          (1 + alpha * a) / a0,
          -2 * cos(w0) / a0,
          (1 - alpha * a) / a0,
          -2 * cos(w0) / a0,
          (1 - alpha / a) / a0,
        )
      }

      /** RBJ's low shelf with a slope of 1. */
      fun lowShelf(frequency: Double, db: Double, rate: Double): Biquad {
        val a = 10.0.pow(db / 40)
        val w0 = 2 * PI * frequency / rate
        val c = cos(w0)
        val alpha = sin(w0) / 2 * sqrt(2.0)
        val s = 2 * sqrt(a) * alpha
        val a0 = (a + 1) + (a - 1) * c + s
        return Biquad(
          a * ((a + 1) - (a - 1) * c + s) / a0,
          2 * a * ((a - 1) - (a + 1) * c) / a0,
          a * ((a + 1) - (a - 1) * c - s) / a0,
          -2 * ((a - 1) + (a + 1) * c) / a0,
          ((a + 1) + (a - 1) * c - s) / a0,
        )
      }
    }
  }

  companion object {
    private val FREQUENCIES = doubleArrayOf(31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)
    private const val RANGE_DB = 12.0
    private const val BASS_SHELF_HZ = 90.0
    private const val BASS_BOOST_MAX_DB = 12.0
    const val MAX_BOOST_DB = 6.0
  }
}
