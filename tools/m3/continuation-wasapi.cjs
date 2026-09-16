const {app,BrowserWindow}=require('electron')
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','wasapi-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'))
const original={start:native.start,snapshot:native.snapshot,recordStatus:native.recordStatus,shutdown:native.shutdown}
let injected=false,interruptedId='',restarts=0
native.start=id=>{injected=false;restarts++;return original.start(id)}
native.snapshot=(...args)=>{const s=original.snapshot(...args);return injected?{...s,active:false,error:'TEST_INJECTED_DEVICE_INVALIDATION',diagnostics:{...s.diagnostics,sourceRecoverable:true,sourceErrorCode:0x88890004,errorSite:3}}:s}
native.recordStatus=()=>{const s=original.recordStatus();return injected&&s.id===interruptedId?{...s,phase:'failed',error:'DEVICE_UNAVAILABLE'}:s}
function invalidate(){interruptedId=original.recordStatus().id;original.shutdown();injected=true}
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',kind:'real-WASAPI-with-explicit-test-invalidation',realDriverFormatChange:false,folder,checks:[]}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<8;i++){
  const s=await state(),reply=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')')
  if(reply.ok)return reply
  if(reply.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(reply.error))
 }
 throw Error('Repeated stale request')
}
async function wait(fn,label,timeout=15000){const begin=Date.now();while(Date.now()-begin<timeout){const value=await fn();if(value)return value;await delay(20)}throw Error('Timeout '+label)}
async function click(selector){
 const p=await evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 assert(p,'Missing/disabled '+selector);win.show();win.focus()
 for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)})
 await delay(60)
}
const check=(value,label)=>{assert(value,label);report.checks.push(label)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'initial live')
  const devices=(await request('devices.list')).data,device=devices.find(d=>d.supported&&/Realtek/i.test(d.label))
  if(device)await request('live.start',{deviceId:device.id})
  await evaluate("window.__regions=null;window.trace.onSnapshot(s=>window.__regions=s);true")
  await request('record.configure',{encoding:'float32',sampleRate:'source',namePrefix:'Continuity'})
  await click('.record-button')
  await wait(()=>evaluate("window.__regions?.recording?.phase==='recording'"),'first recording')
  const sessionId=(await state()).currentRecord.id,epochs=[]
  for(let expected=2;expected<=3;expected++){
   await delay(250);epochs.push(await evaluate("window.__regions.epochId"));invalidate()
   await wait(async()=>{const s=await state();return s.currentRecord?.phase==='reconnecting'},'reconnecting')
   check(await evaluate("!document.querySelector('.record-button').disabled"),'Stop remains enabled during reconnect '+expected)
   await wait(async()=>{const s=await state();return s.currentRecord?.id===sessionId&&s.currentRecord?.regionCount===expected&&['armed','recording'].includes(s.currentRecord.phase)},'resumed region '+expected)
   await wait(()=>evaluate("window.__regions?.recording?.phase==='recording'"),'new native recording')
   check((await state()).currentRecord.id===sessionId,'Session identity survives restart '+expected)
  }
  await delay(250);epochs.push(await evaluate("window.__regions.epochId"))
  check(new Set(epochs).size===3,'Each capture restart has a distinct native epoch')
  fs.writeFileSync(path.join(folder,'continued-recording.png'),(await win.webContents.capturePage()).toPNG())
  await click('.record-button')
  await wait(async()=>!(await state()).currentRecord,'final stop')
  const summary=await wait(async()=>{const item=(await state()).recordings.find(t=>t.id===sessionId);if(item?.status==='failed')throw Error(item.error);return item?.status==='ready'?item:null},'session view',30000)
  check(summary.regionCount===3&&summary.hasDiscontinuities,'File list preserves discontinuity and three regions')
  const directories=fs.readdirSync(process.env.TRACE_RECORD_TEST_DIR),documents=directories.map(name=>JSON.parse(fs.readFileSync(path.join(process.env.TRACE_RECORD_TEST_DIR,name,'session.json'),'utf8')))
  const document=documents.find(d=>d.sessionId===sessionId)
  check(document.schemaVersion===2&&document.assets.some(a=>a.role==='session'),'Schema v2 and independent session-view WAV saved')
  check(document.regions.every(r=>r.clock.startQpc100ns&&r.clock.endQpc100ns),'Every real region retains native clock endpoints')
  check(document.assets.filter(a=>a.role==='source').length>=3,'Original region WAVs remain available')
  const whole=(await request('analysis.start',{takeId:sessionId,role:'session'})).data
  await wait(async()=>{const job=(await state()).analysisJobs.find(j=>j.id===whole.jobId);if(job?.phase==='failed')throw Error(job.error);return job?.phase==='ready'},'session analysis',30000)
  const regionJob=(await request('analysis.start',{takeId:sessionId,role:'source',regionId:document.regions[1].id})).data
  const analyzedRegion=await wait(async()=>{const job=(await state()).analysisJobs.find(j=>j.id===regionJob.jobId);if(job?.phase==='failed')throw Error(job.error);return job?.phase==='ready'?job:null},'region analysis')
  check(analyzedRegion.regionId===document.regions[1].id&&analyzedRegion.totalFrames===document.regions[1].frames,'Original regions and session view have distinct analysis targets')
  await click('.files-button')
  check(await evaluate('document.querySelector('+JSON.stringify('[data-take-id="'+sessionId+'"] select')+').options.length')===3,'File list exposes all original regions for analysis')
  fs.writeFileSync(path.join(folder,'session-files.png'),(await win.webContents.capturePage()).toPNG())
  await click('button[aria-label="关闭对话框"]')
  await request('record.start');await wait(()=>evaluate("window.__regions?.recording?.phase==='recording'"),'second take')
  await delay(150);invalidate();await wait(async()=>(await state()).currentRecord?.phase==='reconnecting','second reconnect')
  const before=restarts;await click('.record-button');await wait(async()=>!(await state()).currentRecord,'stop while disconnected')
  await delay(900);check(restarts===before,'Stop cancels all future capture restarts')
  report.status='pass';report.session=document
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error)}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m2-regions/wasapi-latest.json'),JSON.stringify(report,null,2));console.log('CONTINUATION_WASAPI_TEST',report.status);app.quit()}
})
