const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','snapshot-fault-'+Date.now())
fs.mkdirSync(folder,{recursive:true});process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node')),original=native.recordStatus
let inject=false,injected=false,uncaught=0
process.on('uncaughtExceptionMonitor',()=>uncaught++)
native.recordStatus=()=>{
 const s=original()
 if(inject&&s.phase==='recording'&&s.waveform.length){inject=false;injected=true;return {...s,waveform:[...s.waveform,{...s.waveform[s.waveform.length-1],frame:String(BigInt(s.writtenFrames)+1n)}]}}
 return s
}
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',kind:'real-WASAPI-with-invalid-display-snapshot-injection',folder,checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<8;i++){
  const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')')
  if(r.ok)return r
  if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))
 }throw Error('Repeated stale request')
}
async function wait(fn,label){const begin=Date.now();while(Date.now()-begin<20000){const value=await fn();if(value)return value;await delay(20)}throw Error('Timeout '+label)}
const check=(v,label)=>{assert(v,label);report.checks.push(label)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'initial live')
  await evaluate("window.__snapshot=null;window.trace.onSnapshot(s=>window.__snapshot=s);true")
  await request('record.start')
  const id=(await state()).currentRecord.id
  await wait(()=>original().waveform.length>0,'written audio');inject=true
  const take=await wait(async()=>{const s=await state(),take=s.recordings?.find(t=>t.id===id);return !s.currentRecord&&take?.status==='failed'?take:null},'failed take finalized')
  check(injected&&uncaught===0,'Invalid snapshot is caught without an uncaught main-process exception')
  check(take.error.includes('RECORD_SNAPSHOT_FAILED: REGION_POSITION_OUT_OF_RANGE'),'Failed take retains the exact diagnostic')
  check(BigInt(take.frames)>0n&&take.roles.includes('source'),'Saved original audio remains available with a nonzero frame count')
  await wait(()=>evaluate("document.querySelector('.error-banner')?.textContent.includes('已停止本次录音并保留已写入的文件')"),'visible error')
  check(true,'UI reports the recording failure and preserved files')
  const device=(await state()).deviceId,epoch=await evaluate('window.__snapshot.epochId')
  await request('live.start',{deviceId:device})
  await wait(()=>evaluate('window.__snapshot.epochId!=='+JSON.stringify(epoch)),'retry restarts capture')
  check((await state()).error===null,'Reconnect clears the error and starts a fresh capture epoch')
  await request('record.start');await wait(()=>original().waveform.length>0,'new take');inject=true
  await wait(async()=>{const s=await state();return !s.currentRecord&&s.error?.startsWith('RECORD_SNAPSHOT_FAILED:')},'repeated failure')
  check(true,'A repeated failure after reconnect is visible again')
  await request('live.start',{deviceId:device});await request('record.start')
  await wait(()=>original().phase==='recording','third take');await delay(150);await request('record.stop')
  await wait(async()=>!(await state()).currentRecord,'second stop')
  check(uncaught===0,'A subsequent recording completes in the same app process')
  report.status='pass';report.failedTake=take
  fs.writeFileSync(path.join(folder,'after-retry.png'),(await win.webContents.capturePage()).toPNG())
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error)}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m2-regions/snapshot-fault-latest.json'),JSON.stringify(report,null,2));console.log('SNAPSHOT_FAULT_TEST',report.status);app.quit()}
})
