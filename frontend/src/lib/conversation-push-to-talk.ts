import { getLogger } from '@/lib/logger'

/**
 * Hold-to-talk capture for voice conversation ("push to talk" input mode).
 *
 * While the mode is active the learner's press — not silence — defines the
 * utterance boundary. A hold captures mono PCM from the already-acquired
 * microphone stream and `stop()` returns it resampled to 16 kHz so it can be
 * encoded with `float32ToWav` and sent exactly like a VAD utterance.
 */

const pttLogger = getLogger('conversation-push-to-talk')

const TARGET_SAMPLE_RATE = 16000

export interface PushToTalkCapture {
  /** Begin buffering microphone audio. */
  start: () => void
  /** End buffering and return the held utterance resampled to 16 kHz, or null. */
  stop: () => Float32Array | null
  isCapturing: () => boolean
  /** Release the audio graph. The capture cannot be restarted afterwards. */
  dispose: () => void
}

/**
 * Builds a capture over the session's Web Audio context and mic stream.
 * A muted gain keeps the processor node pumping without echoing the mic back
 * to the speakers; playback through the same context is unaffected.
 */
export function createPushToTalkCapture(
  ctx: AudioContext,
  stream: MediaStream
): PushToTalkCapture {
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(2048, 1, 1)
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(processor)
  processor.connect(mute)
  mute.connect(ctx.destination)

  const chunks: Float32Array[] = []
  let active = false
  let disposed = false

  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!active || disposed) return
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
  }

  function concatChunks(): Float32Array | null {
    if (!chunks.length) return null
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Float32Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return merged
  }

  function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
    if (fromRate === TARGET_SAMPLE_RATE) return input
    const ratio = fromRate / TARGET_SAMPLE_RATE
    const length = Math.max(1, Math.floor(input.length / ratio))
    const output = new Float32Array(length)
    for (let i = 0; i < length; i += 1) {
      const position = i * ratio
      const lower = Math.floor(position)
      const upper = Math.min(input.length - 1, lower + 1)
      const fraction = position - lower
      output[i] = input[lower] * (1 - fraction) + input[upper] * fraction
    }
    return output
  }

  return {
    start() {
      if (disposed) return
      if (active) return
      chunks.length = 0
      active = true
    },
    stop() {
      if (!active) return null
      active = false
      const raw = concatChunks()
      chunks.length = 0
      if (!raw || raw.length === 0) return null
      return resampleTo16k(raw, ctx.sampleRate)
    },
    isCapturing: () => active && !disposed,
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      chunks.length = 0
      try {
        processor.disconnect()
        mute.disconnect()
        source.disconnect()
      } catch (error) {
        pttLogger.warn('push to talk dispose failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}