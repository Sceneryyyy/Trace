// Original generated PCM reaches Trace's production WavReader/N-API paths.
// The helper neither normalizes nor resamples samples and creates no device.
import {createRequire} from 'node:module'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export const engine = createRequire(import.meta.url)('../build/trace-engine/Release/trace_engine.node')
export const instrumentConfig = {fftSize: 2048, averageMs: 0, holdMs: 0, fieldMs: 100, channel: 'stereo'}

export function waveFixture(channels, sampleRate = 48000) {
  const frames = channels[0].length
  if (!channels.length || channels.length > 2 || channels.some(c => c.length !== frames)) throw Error('INVALID_TEST_PCM')
  const directory = mkdtempSync(join(tmpdir(), 'trace-native-pcm-'))
  const blockAlign = channels.length * 4
  const bytes = Buffer.alloc(58 + frames * blockAlign)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(18, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(channels.length, 22)
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * blockAlign, 28)
  bytes.writeUInt16LE(blockAlign, 32); bytes.writeUInt16LE(32, 34)
  bytes.write('fact', 38); bytes.writeUInt32LE(4, 42); bytes.writeUInt32LE(frames, 46)
  bytes.write('data', 50); bytes.writeUInt32LE(frames * blockAlign, 54)
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels.length; channel++) bytes.writeFloatLE(channels[channel][frame], 58 + frame * blockAlign + channel * 4)
  }
  const file = join(directory, 'signal.wav'); writeFileSync(file, bytes)
  return {directory, file, frames, sampleRate, channels: channels.length,
    request: (config = {}) => ({kind: 'file', sources: [file], sampleRate, positionFrame: String(frames), config: {...instrumentConfig, ...config}}),
    cleanup: () => rmSync(directory, {recursive: true, force: true})}
}

export function tone(frequency, frames, sampleRate = 48000, amplitude = 1, phase = 0) {
  return Float32Array.from({length: frames}, (_, n) => amplitude * Math.sin(2 * Math.PI * frequency * n / sampleRate + phase))
}

export function near(actual, expected, tolerance, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) throw Error(`${label}: expected ${expected} +/- ${tolerance}, got ${actual}`)
}
