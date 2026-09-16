const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const artifacts = path.join(root, 'artifacts/m1')
fs.mkdirSync(artifacts, { recursive: true })
require(path.join(root, 'out-trace/main/index.js'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const result = { stage: 'M1', started: new Date().toISOString(), checks: [], resources: [] }
let win
function requireCheck(condition, label) {
  if (!condition) throw Error(label)
  result.checks.push(label)
}
async function evaluate(code) { return win.webContents.executeJavaScript(code) }
async function waitFor(code, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { const value = await evaluate(code); if (value) return value; await delay(50) }
  throw Error('UI wait timed out: ' + code)
}
async function state() {
  const reply = await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")
  if (!reply.ok) throw Error(JSON.stringify(reply))
  return reply.state
}
async function click(selector) {
  const rect = await evaluate("(()=>{const e=document.querySelector(" + JSON.stringify(selector) + ");if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
  if (!rect) throw Error('Missing/disabled control ' + selector)
  win.show(); win.focus(); await delay(100)
  const point = { x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 }
  win.webContents.sendInputEvent({ type: 'mouseDown', ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', ...point })
  await delay(200)
}
app.whenReady().then(async () => {
  try {
    win = BrowserWindow.getAllWindows()[0]
    if (!win) throw Error('No Trace BrowserWindow')
    if (win.webContents.isLoadingMainFrame()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
    await waitFor("Boolean(window.trace && document.querySelector('.trace-app'))")
    await evaluate("window.__traceTestSnapshot=null; window.trace.onSnapshot(s=>{window.__traceTestSnapshot=s}); true")
    await waitFor("window.__traceTestSnapshot?.active && window.__traceTestSnapshot.waveform.length > 0")
    requireCheck((await state()).active, 'Auto-start selected actual playback device')
    const before = await evaluate("window.__traceTestSnapshot.epochId")
    await click('.reset-button')
    await waitFor("Number(window.__traceTestSnapshot.measurementEpoch)>0")
    requireCheck(await evaluate("window.__traceTestSnapshot.epochId") === before, 'Mouse reset keeps capture epoch')
    await click('.monitor-button')
    requireCheck(!(await state()).active, 'Mouse stop finishes monitoring')
    await waitFor("!window.__traceTestSnapshot.active")
    const frozen = await evaluate("window.__traceTestSnapshot.positionFrame")
    await delay(350)
    requireCheck(await evaluate("window.__traceTestSnapshot.positionFrame") === frozen, 'Stopped timeline remains frozen')
    await click('.monitor-button')
    await waitFor("window.__traceTestSnapshot?.active")
    requireCheck((await state()).active, 'Mouse start resumes actual monitoring')
    const invalid = await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'arbitrary.shell',payload:{}})")
    requireCheck(!invalid.ok && invalid.error.code === 'INVALID_REQUEST', 'IPC rejects commands outside whitelist')
    const stale = await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'live.stop',payload:{}})")
    requireCheck(!stale.ok && stale.error.code === 'STALE_REQUEST' && stale.state.active, 'Stale mutation cannot stop current capture')
    const fixture = spawn(path.join(root,'build/m0/Release/trace-capture-probe.exe'),['raw','--seconds','6','--fixture'],{windowsHide:true,stdio:'ignore'})
    const fixtureDone = new Promise(resolve => fixture.on('close', code => resolve(code)))
    await delay(1200)
    for (const [width, height] of [[1280, 800], [1024, 700]]) {
      win.setSize(width, height); win.show(); win.focus(); await delay(400)
      const layout = await evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,buttons:Array.from(document.querySelectorAll('button')).map(e=>({text:e.textContent,disabled:e.disabled})),panels:Array.from(document.querySelectorAll('.workspace > *, .measurement-note')).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})})")
      requireCheck(layout.scrollWidth <= layout.width + 1 && layout.scrollHeight <= layout.height + 1, 'No page overflow at ' + width + 'x' + height)
      requireCheck(layout.panels.every(p => p.left >= 0 && p.right <= layout.width + 1 && p.bottom <= layout.height), 'Main panels fit at ' + width + 'x' + height)
      fs.writeFileSync(path.join(artifacts, 'ui-' + width + 'x' + height + '.png'), (await win.webContents.capturePage()).toPNG())
      fs.writeFileSync(path.join(artifacts, 'layout-' + width + '.json'), JSON.stringify(layout, null, 2))
    }
    requireCheck(await fixtureDone === 0, 'System-output fixture completed')
    const seconds = Number(process.env.TRACE_MONITOR_SECONDS || '2')
    win.minimize()
    win.setSkipTaskbar(true)
    const start = Date.now()
    const first = await evaluate("window.__traceTestSnapshot.positionFrame")
    const captureEpoch = await evaluate("window.__traceTestSnapshot.epochId")
    for (let i = 0; i < seconds; i++) {
      await delay(1000)
      if (i % 30 === 0 || i === seconds - 1) {
        const snapshot = await evaluate("({active:window.__traceTestSnapshot.active,error:window.__traceTestSnapshot.error,epoch:window.__traceTestSnapshot.epochId,frame:window.__traceTestSnapshot.positionFrame,diagnostics:window.__traceTestSnapshot.diagnostics,waveformPoints:window.__traceTestSnapshot.waveform.length,loudnessPoints:window.__traceTestSnapshot.loudnessHistory.length})")
        result.latest = { ...snapshot, expectedEpoch: captureEpoch, minimized: win.isMinimized(), focused: win.isFocused(), state: await state() }
        requireCheck(snapshot.active && !snapshot.error && snapshot.epoch === captureEpoch, 'Minimized capture alive at ' + (i + 1) + 's')
        requireCheck(BigInt(snapshot.diagnostics.droppedFrames) === 0n, 'No audio queue loss at ' + (i + 1) + 's')
        const memory = await process.getProcessMemoryInfo()
        result.resources.push({ seconds: (Date.now() - start) / 1000, memory, snapshot })
        console.log('M1_MONITOR', i + 1, 'seconds', 'frame', snapshot.frame, 'memoryKB', memory.private)
      }
    }
    const last = await evaluate("window.__traceTestSnapshot.positionFrame")
    requireCheck(BigInt(last) > BigInt(first), 'Native timeline advances with window minimized')
    result.monitorSeconds = (Date.now() - start) / 1000
    result.status = 'pass'
  } catch (error) { try { result.failure = await evaluate("({snapshot:window.__traceTestSnapshot,state:document.querySelector('.error-banner')?.textContent,control:document.querySelector('.monitor-button')?.textContent})") } catch {} result.status = 'fail'; result.error = String(error); result.stack = error.stack; console.error(result.error) }
  finally {
    fs.writeFileSync(path.join(artifacts, 'ui-smoke.json'), JSON.stringify(result, null, 2))
    console.log('M1_UI_SMOKE', result.status)
    app.quit()
  }
})
