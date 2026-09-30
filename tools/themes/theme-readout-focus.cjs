// docs/72 R1/R2: actual dialog entry and renderer readout fault wiring.
// Uses generated files and injected renderer snapshots; no live capture or device fault is induced.
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/themes','readout-focus-'+Date.now())
const takes=path.join(folder,'takes'),userData=path.join(folder,'user-data')
fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData)
const fixture=require('../m4/fixture.cjs')(takes)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false,instrumentTheme:'ocean'}))
const report={status:'running',checks:[],kind:'Actual Electron renderer; generated fixture and injected snapshots; no WASAPI recording',folder}
const pass=name=>{report.checks.push(name);console.log('PASS',name)}
const wait=async(fn,name)=>{for(const begin=Date.now();Date.now()-begin<30000;){if(await fn().catch(()=>false))return;await delay(30)}throw Error('Timeout: '+name)}
let session
async function main(){
 session=await launch(require('electron'),folder,{userData,recordDirectory:takes,args:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp
 await wait(()=>c.evaluate("document.querySelectorAll('[data-instrument]').length===4"),'workspace')
 const focus=()=>c.evaluate("({choice:document.activeElement.dataset.themeChoice,checked:document.activeElement.getAttribute('aria-checked'),tab:document.activeElement.tabIndex})")
 const shiftTab=async()=>{await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Tab',key:'Tab',windowsVirtualKeyCode:9,modifiers:8});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'Tab',key:'Tab',windowsVirtualKeyCode:9,modifiers:8})}
 for(const id of ['trace-green','graphite','ember','ocean','duo']){
  await c.request('view.theme',{theme:id})
  await wait(()=>c.evaluate('document.documentElement.dataset.traceTheme==='+JSON.stringify(id)),'saved theme')
  await c.click('[aria-label="显示与帮助"]')
  await wait(async()=>(await focus()).choice===id,'automatic dialog entry focus '+id)
  assert.deepEqual(await focus(),{choice:id,checked:'true',tab:0})
  // Space activates the focused radio; it must not select the first card accidentally.
  await c.key('Space',' ',32);await delay(80)
  assert.equal(await c.evaluate('document.documentElement.dataset.traceTheme'),id)
  await c.key('Tab','Tab',9)
  await wait(()=>c.evaluate("document.activeElement.getAttribute('aria-label')==='显示设置波形倍率'"),'Tab out of radiogroup')
  await shiftTab();assert.deepEqual(await focus(),{choice:id,checked:'true',tab:0})
  await shiftTab();assert.equal(await c.evaluate("document.activeElement.getAttribute('aria-label')"),'关闭对话框')
  await c.key('Tab','Tab',9);assert.equal((await focus()).choice,id)
  await c.key('ArrowRight','ArrowRight',39)
  await wait(async()=>(await focus()).choice!==id,'arrow preview')
  await c.key('Escape','Escape',27)
  await wait(()=>c.evaluate("!document.querySelector('.trace-modal')"),'cancel')
  await wait(()=>c.evaluate('document.documentElement.dataset.traceTheme==='+JSON.stringify(id)),'cancel restores')
  assert.equal((await c.state()).instrumentTheme,id)
  assert.equal(await c.evaluate("document.activeElement.getAttribute('aria-label')"),'显示与帮助')
 }
 pass('All five saved themes receive selected-radio focus on entry; Space, forward/reverse Tab, arrows and Escape preserve selection semantics')

 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','file analysis')
 const p=(await c.state()).playback
 await c.request('playback.seek',{playbackId:p.id,positionFrame:'240000',resume:false})
 await wait(()=>c.evaluate("document.querySelector('.workspace')?.dataset.historyPosition==='240000'"),'file position')
 await c.evaluate('window.trace.onSnapshot(s=>window.__readoutLatest=s);true')
 await wait(()=>c.evaluate("window.__readoutLatest?.sourceKind==='file'&&window.__readoutLatest.positionFrame==='240000'"),'file snapshot')
 await c.evaluate("window.__readoutBase=structuredClone(window.__readoutLatest);window.__readoutSequence=window.__readoutBase.eventSequence;window.addEventListener('message',e=>{if(e.data?.type==='trace-meter-stream-v1'&&!e.data.readoutTest)e.stopImmediatePropagation()},true);true")
 const numbers=()=>c.evaluate("JSON.stringify([...document.querySelectorAll('.metric-number,.summary-metric strong,.channel-readings strong')].map(e=>e.textContent))")
 const before=await numbers()
 const inject=async(patch)=>{
  await c.evaluate("(()=>{const s=Object.assign(structuredClone(window.__readoutBase),"+JSON.stringify(patch)+");s.eventSequence=++window.__readoutSequence+100000;window.postMessage({type:'trace-meter-stream-v1',snapshot:s,readoutTest:true},'*');return true})()")
 }
 await inject({error:'TEST_ONLY_FILE_DATA_UNAVAILABLE'})
 await wait(()=>c.evaluate("[...document.querySelectorAll('.metric-number')].every(e=>e.textContent.includes('无数据'))"),'source fault labels')
 assert.equal(await c.evaluate("document.querySelectorAll('.metric-number .metric-state.is-fault').length"),3)
 assert(await c.evaluate("[...document.querySelectorAll('.summary-metric strong')].every(e=>e.textContent.includes('无数据'))"))
 assert(await c.evaluate("[...document.querySelectorAll('.channel-readings strong')].every(e=>e.textContent==='无数据')"))
 assert(await c.evaluate("[...document.querySelectorAll('.meter-track')].every(e=>!e.hasAttribute('aria-valuenow')&&e.getAttribute('aria-valuetext')==='无数据')"))
 await c.screenshot(path.join(folder,'source-unavailable.png'))
 pass('Source errors clear I/M/S, summary and channel numbers and label them unavailable, including meter accessibility')

 await inject({error:null});await wait(async()=>await numbers()===before,'fault recovery')
 pass('Clearing the fault restores the original historical numbers without changing source data')
 for(const [status,label] of [['gap','无数据'],['insufficient','测量中'],['silence','−∞']]){
  await inject({error:null,momentary:{value:null,status,unit:'LUFS'}})
  await wait(()=>c.evaluate("document.querySelector('.instant-metrics .metric-number').textContent.includes("+JSON.stringify(label)+")"),'metric status '+status)
  assert.equal(await c.evaluate("document.querySelector('.integrated-card .metric-number').textContent.includes('无数据')"),false)
 }
 await inject({error:null});await wait(async()=>await numbers()===before,'final recovery')
 pass('Individual gaps, insufficient windows and silence stay distinct while other historical metrics remain intact')
 report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;process.exitCode=1;console.error(error)}).finally(async()=>{
 if(session)await session.close().catch(error=>{report.closeError=String(error);report.status='fail';process.exitCode=1})
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('READOUT_FOCUS',report.status,folder)
})
