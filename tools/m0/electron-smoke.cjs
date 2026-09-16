// Real Electron main-process/addon smoke. No renderer and no PCM files.
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'artifacts/m0/electron-smoke.json')
const dataPath = path.join(root, 'artifacts/m0/electron-user-data')
fs.mkdirSync(dataPath, { recursive: true })
app.setPath('userData', dataPath)
app.setPath('sessionData', dataPath)
app.disableHardwareAcceleration()
const timeout = setTimeout(() => app.exit(3), 15000)
app.whenReady().then(async () => {
  let capture
  const result = { kind: 'electron-native-smoke', versions: process.versions, audioPersistence: 'disabled-by-design' }
  try {
    const addon = require(path.join(root, 'native/build/Release/visualizer_dsp.node'))
    capture = addon.windowsCapture
    result.support = capture.getSupport()
    if (!result.support.available) throw new Error(result.support.reason)
    const devices = capture.listOutputDevices()
    result.deviceCount = devices.length
    const device = devices.find(d => d.isDefault)
    if (!device) throw new Error('No default playback endpoint')
    const start = capture.start(device.id)
    result.format = { sampleRate: start.sampleRate, channelCount: start.channelCount }
    result.frames = 0
    result.chunks = 0
    result.overwrites = 0
    const begin = performance.now()
    while (performance.now() - begin < 5000) {
      const drained = capture.drain(256)
      result.overwrites = Math.max(result.overwrites, drained.overwriteCount)
      for (const chunk of drained.chunks) {
        result.frames += chunk.left.length
        result.chunks++
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    if (!result.frames || result.overwrites) throw new Error('No frames or upstream display queue overwritten')
    result.status = 'pass'
    result.continuity = 'unknown: upstream API omits packet timestamps/flags'
  } catch (error) {
    result.status = 'fail'
    result.error = String(error)
  } finally {
    try { capture?.stop() } catch (error) { result.status = 'fail'; result.stopError = String(error) }
    clearTimeout(timeout)
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
    app.exit(result.status === 'pass' ? 0 : 1)
  }
}).catch(error => {
  fs.writeFileSync(output, JSON.stringify({ status: 'fail', error: String(error) }) + '\n')
  app.exit(1)
})
