import assert from 'node:assert/strict'
import test from 'node:test'
import {engine, waveFixture, tone, near} from './native-wave-fixture.mjs'

// Trace stores raw dBFS bins. Its logarithmic raster and pixel aggregation
// are covered by the portable presentation suite; Prism modes stay archived.
test('Trace spectrogram preserves calibrated raw dBFS, anti-phase content and exact hop frames', async t => {
  for (const rate of [44100, 48000, 88200, 96000]) for (const fftSize of [512, 2048, 8192, 16384]) {
    const hop = Math.min(fftSize / 4, Math.max(1, Math.floor(rate / 50))), frames = fftSize + 3 * hop
    const left = tone(23 * rate / fftSize, frames, rate, 0.1), right = Float32Array.from(left, x => -x)
    const f = waveFixture([left, right], rate); t.after(f.cleanup)
    const tile = await engine.spectrogramTile({...f.request({fftSize}), firstFrame: String(fftSize), columns: 4})
    assert.equal(tile.firstFrame, String(fftSize)); assert.equal(tile.hop, hop)
    assert.equal(tile.bins, fftSize / 2 + 1); assert.equal(tile.columns, 4); assert.equal(tile.channels, 2)
    for (let col = 0; col < 4; col++) {
      assert.equal(tile.status[col], 1)
      near(tile.decibels[col * tile.bins + 23], -20, 0.05, `${rate}Hz/${fftSize}/${col}`)
      const direct = await engine.instrumentAnalyze({...f.request({fftSize}), positionFrame: String(fftSize + col * hop)})
      near(tile.decibels[col * tile.bins + 23], 10 * Math.log10(direct.current[23]), 0.0001, 'tile and real instrument agree')
    }
  }
})

test('Trace spectrogram distinguishes actual silence, missing windows and extremely quiet finite PCM', async t => {
  const f = waveFixture([new Float32Array(2048)]); t.after(f.cleanup)
  const valid = await engine.spectrogramTile({...f.request(), firstFrame: '2048', columns: 1})
  assert.equal(valid.status[0], 1); assert.equal(valid.decibels[23], -Infinity)
  const missing = await engine.spectrogramTile({...f.request(), positionFrame: '1000', firstFrame: '1000', columns: 1})
  assert.equal(missing.status[0], 0)
  const quiet = waveFixture([tone(23 * 48000 / 2048, 2048, 48000, 1e-30)]); t.after(quiet.cleanup)
  const tile = await engine.spectrogramTile({...quiet.request(), firstFrame: '2048', columns: 1})
  assert.equal(tile.status[0], 1); near(tile.decibels[23], -600, 0.001, 'quiet finite dBFS')
})

test('Trace bounds spectrogram payloads and rejects malformed ranges', async t => {
  const fftSize = 16384, columns = 64, hop = 96000 / 50, frames = fftSize + (columns - 1) * hop
  const f = waveFixture([tone(1000, frames, 96000)], 96000); t.after(f.cleanup)
  const request = {...f.request({fftSize}), firstFrame: String(fftSize), columns}
  const tile = await engine.spectrogramTile(request)
  assert(tile.decibels.byteLength < 4 * 1024 * 1024)
  for (const bad of [{columns: 0}, {columns: 65}, {firstFrame: '-1'}, {firstFrame: '0'}, {positionFrame: '0'}]) assert.throws(() => engine.spectrogramTile({...request, ...bad}), /INVALID_/)
})
