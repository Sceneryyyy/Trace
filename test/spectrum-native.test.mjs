import assert from 'node:assert/strict'
import test from 'node:test'
import {engine, waveFixture, tone, near} from './native-wave-fixture.mjs'

test('Trace N-API exposes its actual capture, file and instrument contract', () => {
  for (const name of ['devices', 'start', 'stop', 'reset', 'snapshot', 'recordStart', 'recordStop', 'recordStatus', 'analyzeWaves', 'instrumentAnalyze', 'spectrogramTile']) {
    assert.equal(typeof engine[name], 'function', name)
  }
  assert.equal(engine.snapshot().active, false)
  assert.throws(() => engine.instrumentAnalyze({}), /INVALID_INSTRUMENT_CONFIG/)
})

test('Trace FFT preserves calibrated bin-centered amplitude at every supported rate and FFT size', async t => {
  for (const rate of [44100, 48000, 88200, 96000]) for (const fftSize of [512, 1024, 2048, 4096, 8192, 16384]) {
    for (const amplitude of [1, 0.5, 0.1]) {
      const f = waveFixture([tone(23 * rate / fftSize, fftSize, rate, amplitude)], rate); t.after(f.cleanup)
      const result = await engine.instrumentAnalyze(f.request({fftSize, channel: 'left'}))
      assert.equal(result.status, 'ready'); assert.equal(result.positionFrame, String(fftSize))
      near(result.binHz, rate / fftSize, 1e-12, 'actual bin Hz')
      near(10 * Math.log10(result.current[23]), 20 * Math.log10(amplitude), 0.05, `${rate} Hz / ${fftSize} / ${amplitude}`)
    }
  }
})

function directPower(samples, fftSize, bin) {
  let real = 0, imaginary = 0, sum = 0
  for (let n = 0; n < fftSize; n++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * n / fftSize)), phase = -2 * Math.PI * bin * n / fftSize
    sum += window; real += samples[n] * window * Math.cos(phase); imaginary += samples[n] * window * Math.sin(phase)
  }
  const gain = (bin === 0 || bin === fftSize / 2 ? 1 : 2) / sum
  return (real * real + imaginary * imaginary) * gain * gain
}

test('Trace off-bin leakage and noise agree with an independent direct DFT', async t => {
  for (const fftSize of [512, 1024, 2048, 4096]) {
    let seed = 7
    const pcm = Float32Array.from({length: fftSize}, (_, n) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return 0.5 * Math.sin(2 * Math.PI * 37.37 * n / fftSize) + (seed / 2 ** 32 - 0.5) * 0.1
    })
    const f = waveFixture([pcm]); t.after(f.cleanup)
    const result = await engine.instrumentAnalyze(f.request({fftSize, channel: 'left'}))
    for (const bin of [0, 1, 36, 37, 38, 93, fftSize / 2]) {
      const expected = directPower(pcm, fftSize, bin)
      near(result.current[bin], expected, Math.max(1e-8, expected * 2e-4), `DFT ${fftSize}/${bin}`)
    }
  }
})

test('Trace channel selection preserves L/R, Mid/Side and anti-phase energy', async t => {
  const n = 2048, full = tone(23 * 48000 / n, n), half = Float32Array.from(full, x => x * 0.5), zero = new Float32Array(n), negative = Float32Array.from(full, x => -x)
  for (const [left, right, channel, expected] of [
    [full, zero, 'left', 1], [zero, full, 'right', 1], [half, full, 'stereo', 0.625],
    [full, zero, 'mid', 0.25], [full, zero, 'side', 0.25],
    [full, negative, 'stereo', 1], [full, negative, 'mid', 0], [full, negative, 'side', 1],
  ]) {
    const f = waveFixture([left, right]); t.after(f.cleanup)
    const result = await engine.instrumentAnalyze(f.request({channel}))
    near(result.current[23], expected, 1e-6, channel)
  }
})

test('Trace rejects malformed FFT, windows, frames, channels and source requests before scheduling native work', t => {
  const f = waveFixture([tone(1000, 2048)]); t.after(f.cleanup)
  for (const fftSize of [0, 3, 1000, 12345, 2 ** 31, NaN, Infinity]) assert.throws(() => engine.instrumentAnalyze(f.request({fftSize})), /INVALID_INSTRUMENT_CONFIG/)
  for (const config of [{averageMs: 2001}, {holdMs: -1}, {fieldMs: 0}, {channel: 'other'}]) assert.throws(() => engine.instrumentAnalyze(f.request(config)), /INVALID_INSTRUMENT_CONFIG/)
  for (const positionFrame of ['-1', '1.5', '', '18446744073709551616', Infinity]) assert.throws(() => engine.instrumentAnalyze({...f.request(), positionFrame}))
  assert.throws(() => engine.instrumentAnalyze({...f.request(), sampleRate: 192000}), /INVALID_INSTRUMENT_CONFIG/)
  assert.throws(() => engine.instrumentAnalyze({...f.request(), sources: ['relative.wav']}), /INVALID_INSTRUMENT_FILES/)
})
