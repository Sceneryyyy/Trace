// Real packaged UI with isolated preferences and generated file audio. No capture or audition.
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const {launch, delay} = require('../m6/cdp.cjs')
const root = path.resolve(__dirname, '../..'), config = require('../../electron-builder.trace.cjs')
const folder = path.join(root, 'artifacts/layout-feedback/ui-' + Date.now())
const takes = path.join(folder, 'takes'), userData = path.join(folder, 'user-data')
fs.mkdirSync(takes, {recursive:true}); fs.mkdirSync(userData)
const fixture = require('../m4/fixture.cjs')(takes)
fs.writeFileSync(path.join(userData, 'trace-settings.json'), JSON.stringify({monitoringRequested:false}))
const report = {status:'running', folder, version:config.extraMetadata.version, checks:[], geometry:[]}
let session, c
async function wait(fn, label) {
 for (const start = Date.now(); Date.now() - start < 20000;) { if (await fn()) return; await delay(30) }
 throw Error('Timeout: ' + label)
}
const pass = label => { report.checks.push(label); console.log('PASS', label) }
async function start() {
 session = await launch(process.env.TRACE_PACKAGE_EXE || path.join(root, config.directories.output, 'win-unpacked/Trace.exe'), folder,
  {userData, recordDirectory:takes, visible:true, bounds:{x:20,y:20,width:1280,height:800}})
 c = session.cdp
 await wait(() => c.evaluate('!!document.querySelector(".edit-layout")'), 'toolbar')
 await c.send('Page.bringToFront')
}
const choose = (selector, value) => c.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
async function contextUnchanged(before) {
 const state = await c.state()
 assert.equal(state.playback.id, before.playback.id)
 assert.equal(state.playback.positionFrame, before.playback.positionFrame)
 assert.deepEqual(state.playback.selection, before.playback.selection)
 assert.equal(state.monitoringRequested, false); assert.equal(state.active, false)
}
async function main() {
 await start()
 await c.request('file.open', {takeId:fixture.document.sessionId,role:'source'})
 await wait(async () => (await c.state()).playback?.analysisPhase === 'ready', 'file ready')
 const id = (await c.state()).playback.id
 await c.request('playback.seek', {playbackId:id,positionFrame:'192000',resume:false})
 await c.request('playback.selection', {playbackId:id,startFrame:'96000',endFrame:'240000',loop:false})
 const before = await c.state()
 assert.equal(await c.evaluate('document.querySelector(".edit-layout").textContent'), '编辑布局')
 assert.equal(await c.evaluate('!!document.querySelector(".layout-edit-hint")'), false)
 await c.click('.edit-layout')
 await wait(async () => !(await c.state()).workspace.locked, 'edit enabled')
 assert.equal(await c.evaluate('document.querySelector(".edit-layout").textContent'), '完成布局')
 assert(await c.evaluate('document.querySelector(".layout-edit-hint").textContent.includes("拖动标题")'))
 assert(await c.evaluate('[...document.querySelectorAll(".instrument-heading")].every(e=>e.draggable && e.querySelector(".instrument-drag-grip"))'))
 const dividerRatio = () => c.evaluate('Number(document.querySelector("[role=separator]").getAttribute("aria-valuenow"))')
 const oldRatio = await dividerRatio()
 await c.evaluate('window.__layoutPointer=[];for(const type of ["pointerdown","pointermove","pointerup","pointercancel"])document.addEventListener(type,e=>window.__layoutPointer.push({type,x:e.clientX,y:e.clientY,target:e.target.className}),true);true')
 const grip = await c.evaluate('(()=>{const r=document.querySelector("[role=separator]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...grip})
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:grip.x+40,y:grip.y})
 await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:grip.x+40,y:grip.y})
 report.pointer = {grip,oldRatio,events:await c.evaluate('window.__layoutPointer')}
 await wait(async () => await dividerRatio() > oldRatio, 'pointer resize')
 await c.evaluate('document.querySelector("[role=separator]").focus()')
 const pointerRatio = await dividerRatio()
 await c.key('ArrowRight','ArrowRight',39)
 await wait(async () => await dividerRatio() > pointerRatio, 'keyboard resize')
 const oldTree = JSON.stringify((await c.state()).workspace.layout.tree)
 const target = await c.evaluate('(()=>{const r=document.querySelector("[data-instrument=loudness]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom-12}})()')
 for (const type of ['dragEnter','dragOver','drop']) await c.send('Input.dispatchDragEvent', {type,...target,data:{items:[{mimeType:'application/x-trace-instrument',data:'levels'}],dragOperationsMask:1}})
 await wait(async () => JSON.stringify((await c.state()).workspace.layout.tree) !== oldTree, 'dock')
 await contextUnchanged(before)
 pass('Edit, pointer/keyboard resize and browser docking preserve file context')
 await c.click('[aria-label="电平设置"]')
 await choose('[aria-label="停靠目标"]','waveform')
 await c.click('.instrument-settings .layout-actions button:first-child')
 await wait(() => c.evaluate('!document.querySelector(".instrument-settings")'), 'menu move')
 await contextUnchanged(before)
 await c.click('.manage-layouts')
 assert(await c.evaluate('document.querySelector(".layout-save-hint").textContent.includes("自动保存")'))
 await c.evaluate('(()=>{const e=document.querySelector("[aria-label=布局名称]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"布局反馈复验");e.dispatchEvent(new Event("input",{bubbles:true}))})()')
 await c.click('.layout-presets .layout-actions button:first-child')
 await wait(async () => (await c.state()).workspace.presets.length === 1, 'save preset')
 const preset = (await c.state()).workspace.presets[0]
 await c.click('.manage-layouts')
 await c.click('.instrument-chooser')
 await c.click('[aria-label="显示仪器"] > button')
 await wait(() => c.evaluate('document.querySelectorAll("[data-instrument]").length===8'), 'all instruments')
 assert.equal(await c.evaluate('document.querySelector("[aria-label=工作台布局] option:checked").textContent'),'自定义布局')
 pass('Menu docking and named preset remain available; automatic custom layout is separate')
 for (const scale of [1,1.5,2]) for (const [width,height] of [[1024,700],[1600,950]]) {
  await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false})
  await delay(100)
  const geometry = await c.evaluate('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,hint:document.querySelector(".layout-edit-hint").getBoundingClientRect().toJSON(),button:document.querySelector(".edit-layout").getBoundingClientRect().toJSON(),labelFits:[...document.querySelectorAll(".instrument-heading h2")].every(e=>e.scrollWidth<=e.clientWidth+1),grips:document.querySelectorAll(".instrument-drag-grip").length})')
  assert(!geometry.overflow); assert(geometry.button.right <= width); assert(geometry.hint.height >= 28); assert(geometry.labelFits); assert.equal(geometry.grips,8)
  report.geometry.push({scale,height,...geometry})
  await c.screenshot(path.join(folder,`editing-${width}-${scale}.png`))
 }
 await c.click('.edit-layout')
 await wait(async () => (await c.state()).workspace.locked, 'finish')
 assert.equal(await c.evaluate('document.querySelectorAll(".layout-edit-hint,.instrument-drag-grip").length'),0)
 assert(await c.evaluate('[...document.querySelectorAll(".instrument-heading")].every(e=>!e.draggable)'))
 await contextUnchanged(before)
 const persisted = (await c.state()).workspace
 await c.screenshot(path.join(folder,'finished.png'))
 await wait(() => JSON.stringify(JSON.parse(fs.readFileSync(path.join(userData,'trace-settings.json'))).workspace) === JSON.stringify(persisted), 'persist')
 assert.equal(c.events.filter(e => e.method === 'Runtime.exceptionThrown').length,0)
 pass('Editing cues fit six viewport/scale combinations and disappear when finished')
 await session.close(); session = null; await start()
 await wait(async () => (await c.state()).workspace?.presets.length === 1, 'restart')
 assert.deepEqual((await c.state()).workspace, persisted)
 await choose('[aria-label="工作台布局"]',preset.id)
 await wait(async () => (await c.state()).workspace.activePreset === preset.id, 'recall')
 assert.deepEqual((await c.state()).workspace.layout,preset.layout)
 assert.equal((await c.state()).monitoringRequested,false)
 pass('Restart restores automatic custom layout and recalls the independent named preset')
 report.status = 'pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{
 if(session) await session.close().catch(e=>{report.status='fail';report.closeError=String(e);process.exitCode=1})
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2))
 fs.writeFileSync(path.join(root,'artifacts/layout-feedback/ui-latest.json'),JSON.stringify(report,null,2))
 console.log('LAYOUT_FEEDBACK',report.status,folder)
})
