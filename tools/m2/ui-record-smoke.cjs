const {app,BrowserWindow}=require('electron')
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2','ui-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
process.env.TRACE_TEST_SEGMENT_BYTES='48000'
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms))
const result={kind:'actual-recorder-ui',started:new Date().toISOString(),checks:[],folder}
let win
const requireCheck=(v,label)=>{if(!v)throw Error(label);result.checks.push(label)}
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<4;i++){
  const s=await state()
  const r=await evaluate("window.trace.request("+JSON.stringify({protocolVersion:1,requestId:command+'-'+Date.now()+'-'+i,expectedStateRevision:s.revision,command,payload})+")")
  if(r.ok)return r
  if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))
 }
 throw Error('Repeated stale command')
}
async function wait(code,ms=15000){const start=Date.now();while(Date.now()-start<ms){const v=await evaluate(code);if(v)return v;await delay(50)}throw Error('Wait: '+code)}
async function click(selector){
 const r=await evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 if(!r)throw Error('Missing/disabled '+selector)
 win.show();win.focus();await delay(50)
 for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(r.x),y:Math.round(r.y)})
 await delay(100)
}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait("Boolean(window.trace&&document.querySelector('.record-button'))")
  await evaluate("window.__m2=null;window.trace.onSnapshot(s=>{window.__m2=s});true")
  await wait("window.__m2?.active")
  const devices=(await request("devices.list")).data
  const device=devices.find(d=>d.supported&&d.isDefault&&!/Realtek/i.test(d.label))||devices.find(d=>d.supported&&!/Realtek/i.test(d.label))
  if(device)await request("live.start",{deviceId:device.id})
  await request('record.configure',{encoding:'pcm24',sampleRate:'source',namePrefix:'声迹测试'})
  const epoch=await evaluate("window.__m2.epochId")
  await click('.record-button')
  await wait("window.__m2?.recording?.phase==='recording'")
  const fixture=spawn(path.join(root,'build/trace-diagnostics/Release/trace-capture-probe.exe'),['raw','--seconds','6','--fixture'],{windowsHide:true,stdio:'ignore'})
  const fixtureDone=new Promise(r=>fixture.on('close',r))
  await delay(1200)
  requireCheck(await evaluate("document.querySelector('.record-button').getAttribute('aria-label')==='结束录音'&&document.querySelector('.record-button').getAttribute('aria-pressed')==='true'&&Boolean(document.querySelector('.record-button svg rect'))"),'REC button became stop')
  requireCheck(await evaluate("document.querySelector('.monitor-button').disabled&&document.querySelector('.reset-button').disabled"),'LIVE controls locked during REC')
  const during=await evaluate("window.__m2.recording")
  requireCheck(BigInt(during.writtenFrames)>0n&&during.waveform.length>0,'Actual frames and growing waveform')
  fs.writeFileSync(path.join(folder,'recording.png'),(await win.webContents.capturePage()).toPNG())
  await click('.record-button')
  await wait("window.__m2?.recording?.phase==='complete'")
  requireCheck((await state()).active,'LIVE continues after REC')
  requireCheck(await evaluate("window.__m2.epochId")===epoch,'Capture epoch unchanged by REC')
  let s
  for(let i=0;i<200;i++){s=await state();if(s.recordings?.[0]?.status==='ready')break;await delay(50)}
  requireCheck(s.recordings?.[0]?.status==='ready','Session source files finalized')
  const first=s.recordings[0]
  requireCheck(first.segmentCount>=3,'Real recording created multiple segments')
  await request('record.configure',{encoding:'pcm16',sampleRate:44100,namePrefix:'转换测试'})
  const fresh=await state(),id='same-record-start'
  const raw={protocolVersion:1,requestId:id,expectedStateRevision:fresh.revision,command:'record.start',payload:{}}
  const replies=await evaluate('Promise.all([window.trace.request('+JSON.stringify(raw)+'),window.trace.request('+JSON.stringify(raw)+')])')
  requireCheck(replies.every(r=>r.ok),'Concurrent duplicate start is idempotent')
  await delay(1250)
  const stopped=await request('record.stop')
  requireCheck(stopped.data?.endFrameExclusive!==null,'Stop returns confirmed boundary')
  for(let i=0;i<400;i++){s=await state();if(s.recordings?.[0]?.status==='ready'||s.recordings?.[0]?.status==='failed')break;await delay(50)}
  requireCheck(s.recordings.length===2,'Duplicate request did not create another take')
  requireCheck(s.recordings[0].status==='ready','Manual-rate WAV completed')
  const dirs=fs.readdirSync(process.env.TRACE_RECORD_TEST_DIR)
  const sessions=dirs.map(d=>JSON.parse(fs.readFileSync(path.join(process.env.TRACE_RECORD_TEST_DIR,d,'session.json'),'utf8')))
  const converted=sessions.find(s=>s.preset.sampleRate===44100)
  requireCheck(converted.assets.some(a=>a.role==='deliverable'&&a.sampleRate===44100&&a.encoding==='pcm16'),'Converted assets use selected format')
  requireCheck(converted.assets.some(a=>a.role==='source'),'Recoverable source retained')
  const clock=converted.takes?.[0]?.clock
  requireCheck(clock&&typeof clock.startQpc100ns==='string'&&typeof clock.endQpc100ns==='string'&&BigInt(clock.endQpc100ns)>BigInt(clock.startQpc100ns),'Native region clock persisted in the session')
  await click('.files-button');await delay(150)
  fs.writeFileSync(path.join(folder,'files.png'),(await win.webContents.capturePage()).toPNG())
  requireCheck(await fixtureDone===0,'System tone fixture completed')
  result.sessions=sessions;result.status='pass'
 }catch(error){result.status='fail';result.error=String(error);result.stack=error.stack;console.error(result.error)}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(root,'artifacts/m2/ui-latest.json'),JSON.stringify(result,null,2));console.log('M2_UI_RECORD_SMOKE',result.status);app.quit()}
})
