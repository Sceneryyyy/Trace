import assert from 'node:assert/strict'
import test from 'node:test'
import {engine, waveFixture, tone, near} from './native-wave-fixture.mjs'

test('Trace sound field retains high-frequency stereo samples at every product rate', async t => {
  for (const rate of [44100, 48000, 88200, 96000]) {
    const left = tone(12000, 2048, rate, 0.75), right = tone(12000, 2048, rate, -0.4, Math.PI / 2)
    const f = waveFixture([left, right], rate); t.after(f.cleanup)
    const result = await engine.instrumentAnalyze(f.request())
    assert.equal(result.field.points.length, 2048 * 4)
    for (let i = 0; i < 2048; i++) {
      near(result.field.points[i * 4], (right[i] - left[i]) / 2, 1e-7, 'scope side X')
      near(result.field.points[i * 4 + 1], (right[i] + left[i]) / 2, 1e-7, 'scope mid Y')
      near(result.field.points[i * 4 + 2], (2048 - i) / rate, 1e-8, 'real point age')
      assert.equal(result.field.points[i * 4 + 3], 0)
    }
  }
})

test('Trace field reports phase, balance, silence and clipping through its actual API', async t => {
  const full = tone(1000, 4800, 48000, 0.5), negative = Float32Array.from(full, x => -x), zero = new Float32Array(4800)
  for (const [left, right, correlation, balance] of [[full, full, 1, 0], [full, negative, -1, 0], [full, zero, null, -1]]) {
    const f = waveFixture([left, right]); t.after(f.cleanup)
    const r = await engine.instrumentAnalyze(f.request())
    if (correlation === null) assert.equal(r.field.correlation.status, 'insufficient')
    else near(r.field.correlation.value, correlation, 1e-8, 'correlation')
    near(r.field.balance.value, balance, 1e-8, 'balance')
    assert(r.field.points.length <= 2048 * 4); assert.equal(r.field.polarRms.length, 181)
  }
  const silence = waveFixture([zero, zero]); t.after(silence.cleanup)
  assert.equal((await engine.instrumentAnalyze(silence.request())).field.balance.status, 'silence')
  const over = waveFixture([new Float32Array(2048).fill(2), new Float32Array(2048).fill(2)]); t.after(over.cleanup)
  assert.equal((await engine.instrumentAnalyze(over.request())).field.points[3], 1)
})
