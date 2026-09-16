// Runs as an actual Electron main process, with no audio dependency on rendering.
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const artifacts = path.join(root, 'artifacts/m1')
fs.mkdirSync(artifacts, { recursive: true })
app.setPath('userData', path.join(artifacts, 'smoke-user-data'))
app.disableHardwareAcceleration()
const result = { stage: 'M1', electron: process.versions.electron, started: new Date().toISOString(), samples: [] }
const timeout = setTimeout(() => app.exit(3), 30000)
app.whenReady().then(async () => {
  let engine
  try {
    engine = require(path.join(root, 'build/trace-engine/Release/trace_engine.node'))
    const devices = engine.devices()
    result.devices = devices
    const selected = process.env.TRACE_TEST_DEVICE_INDEX === undefined
      ? devices.find(d => d.isDefault && d.supported)
      : devices[Number(process.env.TRACE_TEST_DEVICE_INDEX)]
    if (!selected?.supported) throw Error('No supported device')
    result.format = engine.start(selected.id)
    for (let i = 0; i < Math.min(1200, Number(process.env.TRACE_NATIVE_STEPS || 12)); i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const s = engine.snapshot(10, 300)
      if (s.error || !s.active) { result.failure = s; throw Error(s.error || 'Capture stopped') }
      const lag=BigInt(s.diagnostics.meterLagFrames),bound=BigInt(Math.ceil(s.format.sampleRate/100)+Number(s.diagnostics.truePeakLookaheadFrames))
      if(lag>bound||BigInt(s.levelIndexFrame)>BigInt(s.positionFrame))throw Error('Published meter frame/lag invalid')
      const { waveform, loudnessHistory, ...summary } = s
      result.samples.push({ ...summary, waveformPoints: waveform.length, loudnessPoints: loudnessHistory.length })
    }
    const before = engine.snapshot(10, 300)
    if (!BigInt(before.positionFrame) || !before.waveform.length) throw Error('No live timeline')
    if (BigInt(before.diagnostics.droppedFrames) !== 0n) throw Error('Queue dropped audio')
    // Block the JS main thread for 500 ms. Native capture/analysis must continue.
    const start = performance.now()
    while (performance.now() - start < 500) { /* deliberate test-only UI/main stall */ }
    const after = engine.snapshot(10, 300)
    if (BigInt(after.positionFrame) <= BigInt(before.positionFrame)) throw Error('Native analysis depended on JS polling')
    if (BigInt(after.diagnostics.droppedFrames) !== 0n) throw Error('Audio dropped during JS stall')
    engine.reset()
    await new Promise(resolve => setTimeout(resolve, 200))
    const reset = engine.snapshot(10, 300)
    if (reset.epochId !== after.epochId) throw Error('Reset reopened capture device')
    if (reset.measurementEpoch === after.measurementEpoch) throw Error('Reset did not create new measurement')
    result.afterJsStall = after.diagnostics
    result.reset = { epochId: reset.epochId, measurementEpoch: reset.measurementEpoch, measurementFrames: reset.measurementFrames }
    engine.stop()
    const stopped = engine.snapshot(10, 300)
    result.stopDiagnostics = stopped.diagnostics
    if (stopped.active) throw Error('Stop did not finish')
    if(stopped.diagnostics.meterLagFrames!=='0')throw Error('Stop did not drain aligned meter frames')
    if (BigInt(stopped.diagnostics.analyzedFrames) !== BigInt(stopped.diagnostics.capturedFrames) + BigInt(stopped.diagnostics.estimatedFrames)) throw Error('Valid frame accounting mismatch')
    engine.stop()
    result.status = 'pass'
  } catch (error) { result.status = 'fail'; result.error = String(error) }
  finally {
    try { engine?.stop() } catch {}
    clearTimeout(timeout)
    fs.writeFileSync(path.join(artifacts, 'native-smoke' + (process.env.TRACE_TEST_DEVICE_INDEX ?? '-default') + '.json'), JSON.stringify(result, null, 2))
    app.exit(result.status === 'pass' ? 0 : 1)
  }
})
