import assert from 'node:assert/strict'
import test from 'node:test'

import {engine, waveFixture, tone, near} from './native-wave-fixture.mjs'
import {join} from 'node:path'

const EBU_SAMPLE_RATE = 48000
const EBU_TOLERANCE_BELOW_DB = 0.4
const EBU_TOLERANCE_ABOVE_DB = 0.2

function assertEbuTolerance(actual, expected, label) {
  assert.ok(
    actual >= expected - EBU_TOLERANCE_BELOW_DB
      && actual <= expected + EBU_TOLERANCE_ABOVE_DB,
    `${label}: expected ${expected} dBTP (+${EBU_TOLERANCE_ABOVE_DB}/-${EBU_TOLERANCE_BELOW_DB}), got ${actual}`,
  )
}

function createPhaseTone(
  sampleRate,
  frequency,
  amplitude,
  phaseDegrees,
  durationSeconds = 0.1,
) {
  const length = Math.max(1, Math.round(sampleRate * durationSeconds))
  const taperSamples = Math.max(1, Math.round(sampleRate * 0.01))
  const phaseRadians = phaseDegrees * Math.PI / 180
  const samples = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const fadeIn = Math.min(1, index / taperSamples)
    const fadeOut = Math.min(1, (length - 1 - index) / taperSamples)
    const taper = Math.max(0, Math.min(fadeIn, fadeOut))
    samples[index] = amplitude
      * Math.sin((2 * Math.PI * frequency * index) / sampleRate + phaseRadians)
      * taper
  }
  return samples
}

function measure(sampleRate, left, right = left, blockFrames = 2048) {
  const f = waveFixture([left, right], sampleRate)
  try {
    const result = engine.analyzeWaves([f.file], join(f.directory, 'analysis'), blockFrames)
    assert.equal(result.frames, String(left.length))
    assert.equal(result.summary.levelIndexFrame, result.frames)
    assert.equal(result.summary.loudnessIndexFrame, result.frames)
    return result.summary
  } finally { f.cleanup() }
}

function besselI0(value) {
  let sum = 1
  let term = 1
  const squaredQuarter = value * value / 4
  for (let index = 1; index < 40; index += 1) {
    term *= squaredQuarter / (index * index)
    sum += term
    if (term < sum * 1e-15) break
  }
  return sum
}

function createTransientReferenceAt4x(sampleRate = EBU_SAMPLE_RATE) {
  const oversample = 4
  const highRate = sampleRate * oversample
  const durationSeconds = 0.12
  const length = Math.round(highRate * durationSeconds)
  const source = new Float64Array(length)
  const taperSamples = Math.round(highRate * 0.01)

  for (let index = 0; index < length; index += 1) {
    const taper = Math.max(0, Math.min(
      1,
      index / taperSamples,
      (length - 1 - index) / taperSamples,
    ))
    source[index] = 0.5 * Math.sin((2 * Math.PI * (sampleRate / 6) * index) / highRate) * taper
  }

  const transientStart = Math.floor(length / 2) - 8
  for (let index = 0; index < 16; index += 1) {
    source[transientStart + index] += Math.sin(Math.PI * index / 8)
  }

  const tapCount = 129
  const half = (tapCount - 1) / 2
  const cutoff = 0.5 / oversample
  const beta = 8.6
  const inverseI0Beta = 1 / besselI0(beta)
  const coefficients = new Float64Array(tapCount)
  let coefficientSum = 0
  for (let tap = 0; tap < tapCount; tap += 1) {
    const distance = tap - half
    const sincArgument = 2 * cutoff * distance
    const sinc = Math.abs(sincArgument) < 1e-12
      ? 1
      : Math.sin(Math.PI * sincArgument) / (Math.PI * sincArgument)
    const ratio = distance / half
    const window = besselI0(beta * Math.sqrt(Math.max(0, 1 - ratio * ratio))) * inverseI0Beta
    coefficients[tap] = 2 * cutoff * sinc * window
    coefficientSum += coefficients[tap]
  }
  for (let tap = 0; tap < tapCount; tap += 1) coefficients[tap] /= coefficientSum

  const filtered = new Float64Array(length)
  for (let index = half; index < length - half; index += 1) {
    let value = 0
    for (let tap = 0; tap < tapCount; tap += 1) {
      value += coefficients[tap] * source[index + tap - half]
    }
    filtered[index] = value
  }

  let maximum = 0
  for (const value of filtered) maximum = Math.max(maximum, Math.abs(value))
  for (let index = 0; index < filtered.length; index += 1) filtered[index] /= maximum
  return filtered
}

function downsample4x(reference, offset) {
  const length = Math.floor((reference.length - offset) / 4)
  const samples = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    samples[index] = reference[index * 4 + offset]
  }
  return samples
}

test('Trace file Meter passes unchanged EBU Tech 3341 generated phase tones 15–19', () => {
  for (const vector of [
    {number: 15, divisor: 4, amplitude: 0.5, phase: 0, expected: -6},
    {number: 16, divisor: 4, amplitude: 0.5, phase: 45, expected: -6},
    {number: 17, divisor: 6, amplitude: 0.5, phase: 60, expected: -6},
    {number: 18, divisor: 8, amplitude: 0.5, phase: 67.5, expected: -6},
    {number: 19, divisor: 4, amplitude: 1.41, phase: 45, expected: 3},
  ]) {
    const input = createPhaseTone(48000, 48000 / vector.divisor, vector.amplitude, vector.phase)
    const summary = measure(48000, input)
    assert.equal(summary.maxTruePeak.status, 'ready')
    assertEbuTolerance(summary.maxTruePeak.value, vector.expected, `EBU case ${vector.number}`)
  }
})

test('Trace file Meter passes all four phase offsets of the unchanged independent filtered transient', () => {
  const reference = createTransientReferenceAt4x()
  for (let offset = 0; offset < 4; offset++) assertEbuTolerance(measure(48000, downsample4x(reference, offset)).maxTruePeak.value, 0, `EBU transient ${20 + offset}`)
})

test('Trace file analysis readout is independent of read block boundaries', () => {
  const input = createPhaseTone(48000, 12000, 1.41, 45)
  const regular = measure(48000, input, input, 2048)
  for (const blockFrames of [1, 7, 113, 509]) assert.deepEqual(measure(48000, input, input, blockFrames), regular)
})

test('Trace true peak remains calibrated at every supported product rate', () => {
  for (const rate of [44100, 48000, 88200, 96000]) assertEbuTolerance(measure(rate, createPhaseTone(rate, rate / 4, 1.41, 45)).maxTruePeak.value, 3, `${rate} Hz`)
})

test('Trace preserves polarity and channel silence without inventing a finite silence reading', () => {
  const positive = createPhaseTone(48000, 12000, 1.41, 45), zero = new Float32Array(positive.length)
  const a = measure(48000, positive, zero), b = measure(48000, Float32Array.from(positive, x => -x), zero)
  assertEbuTolerance(a.maxTruePeak.value, 3, 'left channel')
  near(b.maxTruePeak.value, a.maxTruePeak.value, 1e-6, 'polarity')
  for (const summary of [a, b]) {assert.equal(summary.channels[1].truePeak.status, 'silence'); assert.equal(summary.channels[1].truePeak.value, null)}
})

test('Trace maximum true peak includes earlier loud input and is independent for a new file', () => {
  const loud = createPhaseTone(48000, 12000, 1.41, 45), quiet = createPhaseTone(48000, 12000, 0.1, 45)
  const program = new Float32Array(loud.length + quiet.length); program.set(loud); program.set(quiet, loud.length)
  near(measure(48000, program).maxTruePeak.value, measure(48000, loud).maxTruePeak.value, 1e-6, 'earlier peak persists')
  assert(measure(48000, quiet).maxTruePeak.value < -19)
  const silence = measure(48000, new Float32Array(4800))
  assert.equal(silence.maxTruePeak.status, 'silence'); assert.equal(silence.maxTruePeak.value, null)
})

test('Trace generated -23 LUFS programme reaches real M/S/I with the unchanged 0.1 LU tolerance', () => {
  const summary = measure(48000, tone(1000, 48000 * 4, 48000, 10 ** (-23 / 20)))
  for (const key of ['momentary', 'shortTerm', 'integratedToCursor']) {assert.equal(summary[key].status, 'ready'); near(summary[key].value, -23, 0.1, key)}
})
