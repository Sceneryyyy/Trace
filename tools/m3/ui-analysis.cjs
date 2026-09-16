const {app,BrowserWindow}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m3','ui-'+Date.now()),takes=path.join(folder,'takes')
fs.mkdirSync(takes,{recursive:true})
const small=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m2/ui-latest.json'),'utf8'))
const long=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m2/long-latest.json'),'utf8'))
const fixtures=[]
function linkTake(sourceDirectory,name){
 const session=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'session.json'),'utf8'))
 const target=path.join(takes,name);fs.mkdirSync(path.join(target,'audio'),{recursive:true})
 for(const asset of session.assets){
  assert(/^audio\/[^/\\]+\.wav$/i.test(asset.relativePath))
  const file=path.join(target,asset.relativePath)
  if(!fs.existsSync(file))fs.linkSync(path.join(sourceDirectory,asset.relativePath),file)
 }
 fs.writeFileSync(path.join(target,'session.json'),JSON.stringify(session,null,2));fixtures.push(session);return session
}
for(const entry of fs.readdirSync(path.join(small.folder,'takes')))linkTake(path.join(small.folder,'takes',entry),'short-'+fixtures.length)
const longRoot=path.join(long.folder,'takes')
const longName=fs.readdirSync(longRoot).find(name=>JSON.parse(fs.readFileSync(path.join(longRoot,name,'session.json'),'utf8')).sessionId===long.take.id)
const longTake=linkTake(path.join(longRoot,longName),'long')
const converted=fixtures.find(item=>item.assets.some(asset=>asset.role==='deliverable'))
process.env.TRACE_RECORD_TEST_DIR=takes
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms))
const report={status:'running',folder,checks:[]}
let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<8;i++){
  const s=await state(),result=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')')
  if(result.ok)return result
  if(result.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(result.error))
 }
 throw Error('Repeated stale request')
}
async function until(test,label,timeout=30000){const begin=Date.now();while(Date.now()-begin<timeout){const result=await test();if(result)return result;await delay(25)}throw Error('Timeout: '+label)}
async function click(selector){
 const r=await evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 assert(r,'Missing/disabled '+selector);win.show();win.focus()
 for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(r.x),y:Math.round(r.y)})
 await delay(80)
}
const check=(v,label)=>{assert(v,label);report.checks.push(label)}
const currentJob=async(id,role)=>(await state()).analysisJobs?.find(job=>job.takeId===id&&job.role===role)
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await until(async()=>(await state()).recordings?.length===3,'session load')
  await evaluate("window.__m3=null;window.trace.onSnapshot(s=>window.__m3=s);true")
  const devices=(await request('devices.list')).data,device=devices.find(d=>d.supported&&/Realtek/i.test(d.label))
  if(device)await request('live.start',{deviceId:device.id})
  await click('.files-button')
  const selector='[data-take-id="'+converted.sessionId+'"]'
  await click(selector+' .take-details summary')
  await click(selector+' [data-analysis-start="deliverable"]')
  const deliverable=await until(async()=>{const j=await currentJob(converted.sessionId,'deliverable');if(j?.phase==='failed')throw Error(j.error);return j?.phase==='ready'?j:null},'deliverable analysis')
  check(deliverable.sampleRate===44100&&deliverable.summary,'Actual file-list button produces converted-file analysis')
  await click(selector+' [data-analysis-start="source"]')
  const source=await until(async()=>{const j=await currentJob(converted.sessionId,'source');if(j?.phase==='failed')throw Error(j.error);return j?.phase==='ready'?j:null},'source analysis')
  check(source.sampleRate===48000&&source.cacheKey!==deliverable.cacheKey,'Source and converted WAV have independent analysis identities')
  const first=(await request('metrics.query',{analysisId:deliverable.id,positionFrame:deliverable.totalFrames,requestGeneration:15})).data
  const again=(await request('metrics.query',{analysisId:deliverable.id,positionFrame:deliverable.totalFrames,requestGeneration:16})).data
  assert.deepEqual(first.metrics,again.metrics);check(again.requestGeneration===16,'IPC preserves query generation and stable historical values')
  const timeline=(await request('timeline.query',{analysisId:deliverable.id,startFrame:'0',endFrame:deliverable.totalFrames,pixelWidth:500,requestGeneration:17})).data
  check(timeline.waveform.length>0&&timeline.waveform.length<=500&&timeline.requestGeneration===17,'IPC timeline returns bounded shared-time data')
  // Drop the active deliverable page, then corrupt only this test's rebuildable cache.
  await request('metrics.query',{analysisId:source.id,positionFrame:source.totalFrames,requestGeneration:18})
  const cacheFile=path.join(takes,'short-'+fixtures.indexOf(converted),'cache',deliverable.cacheKey,'levels.bin')
  const damaged=fs.readFileSync(cacheFile);damaged[81]^=1;fs.writeFileSync(cacheFile,damaged)
  await assert.rejects(request('metrics.query',{analysisId:deliverable.id,positionFrame:deliverable.totalFrames,requestGeneration:19}),/CORRUPT_CACHE/)
  await until(async()=>{const job=await currentJob(converted.sessionId,'deliverable');if(job?.phase==='failed')throw Error(job.error);return job?.phase==='ready'},'query-triggered rebuild')
  const repaired=(await request('metrics.query',{analysisId:deliverable.id,positionFrame:deliverable.totalFrames,requestGeneration:20})).data
  assert.deepEqual(repaired.metrics,first.metrics)
  check(true,'A corrupt queried page automatically rebuilds with the same analysis identity and values')
  check(await evaluate('document.querySelector('+JSON.stringify(selector)+').innerText.includes("整段 I")'),'Actual file statistics appear in the dialog')
  fs.writeFileSync(path.join(folder,'file-analysis.png'),(await win.webContents.capturePage()).toPNG())
  await click('button[aria-label="关闭对话框"]')
  const created=(await request('analysis.start',{takeId:longTake.sessionId,role:'source'})).data
  await until(async()=>{const j=await currentJob(longTake.sessionId,'source');if(j?.phase==='failed')throw Error(j.error);return j?.phase==='analyzing'},'long analysis running',60000)
  await click('.record-button')
  await until(async()=>(await state()).currentRecord,'record start')
  await until(()=>evaluate("window.__m3?.recording?.phase==='recording'"),'actual recording boundary')
  check((await currentJob(longTake.sessionId,'source')).phase==='queued','Recording suspends the active file analysis')
  await delay(350);await click('.record-button')
  await until(async()=>!(await state()).currentRecord,'record stop')
  const resumed=await until(async()=>{const j=await currentJob(longTake.sessionId,'source');return j&&j.phase!=='queued'?j:null},'analysis resume')
  check(resumed.id===created.jobId&&['hashing','analyzing','verifying','ready'].includes(resumed.phase),'Same analysis resumes after recording stops')
  await request('job.cancel',{jobId:created.jobId})
  await until(async()=>['cancelled','ready'].includes((await currentJob(longTake.sessionId,'source')).phase),'analysis cancel')
  check((await currentJob(longTake.sessionId,'source')).phase==='cancelled','User cancellation reaches a terminal job state')
  check((await state()).active,'LIVE continues throughout file analysis and cancellation')
  report.recordings=(await state()).recordings;report.jobs=(await state()).analysisJobs;report.status='pass'
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);if(win){report.failureState=await state().catch(()=>null);report.failureDOM=await evaluate('document.body.innerText').catch(()=>null);fs.writeFileSync(path.join(folder,'failure.png'),(await win.webContents.capturePage()).toPNG())}}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m3/ui-latest.json'),JSON.stringify(report,null,2));console.log('M3_FILE_ANALYSIS_UI',report.status);app.quit()}
})
