const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path')
const root=path.resolve(__dirname,'../..'),folder=process.env.TRACE_REGION_RECOVERY_CASE,mode=process.env.TRACE_REGION_RECOVERY_MODE
if(!folder)throw Error('Missing recovery test directory')
process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'))
const original={start:native.start,snapshot:native.snapshot,status:native.recordStatus,shutdown:native.shutdown}
let injected=false,id=''
if(mode==='seed'){
 native.start=device=>{injected=false;return original.start(device)}
 native.snapshot=(...args)=>{const s=original.snapshot(...args);return injected?{...s,active:false,error:'TEST_INJECTED_RESET',diagnostics:{...s.diagnostics,sourceRecoverable:true,errorSite:3}}:s}
 native.recordStatus=()=>{const s=original.status();return injected&&s.id===id?{...s,phase:'failed',error:'DEVICE_UNAVAILABLE'}:s}
}
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}
 throw Error('Repeated stale request')
}
async function wait(check,label){for(let i=0;i<800;i++){const value=await check();if(value)return value;await delay(25)}throw Error('Timeout '+label)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'live')
  if(mode==='seed'){
   const devices=(await request('devices.list')).data,device=devices.find(d=>d.supported&&/Realtek/i.test(d.label));if(device)await request('live.start',{deviceId:device.id})
   await request('record.configure',{encoding:'float32',sampleRate:'source',namePrefix:'RegionCrash'});await request('record.start');await delay(500)
   id=original.status().id;original.shutdown();injected=true
   let observations=0
   await wait(async()=>{const current=await state(),r=current.currentRecord,n=original.status();if(++observations%20===0)fs.appendFileSync(path.join(folder,'state-progress.jsonl'),JSON.stringify({current:r,native:{id:n.id,phase:n.phase,writtenFrames:n.writtenFrames,error:n.error},injected})+'\n');return r?.regionCount===2&&r.phase==='recording'},'second region')
   await delay(1300)
   fs.writeFileSync(path.join(folder,'seed-ready.json'),JSON.stringify({pid:process.pid,id:(await state()).currentRecord.id}))
   setInterval(()=>{},1000)
  }else{
   const take=await wait(async()=>(await state()).recordings?.find(t=>t.status==='recoverable'),'interrupted session')
   await request('record.recover',{takeId:take.id})
   const recovered=(await state()).recordings.find(t=>t.id===take.id)
   if(recovered.status!=='recovered'||recovered.regionCount<2||!recovered.roles.includes('session'))throw Error('Multi-region recovery/view incomplete')
   fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({status:'pass',take:recovered}));app.quit()
  }
 }catch(error){fs.writeFileSync(path.join(folder,'error.json'),JSON.stringify({error:String(error),stack:error.stack}));console.error(error);app.quit()}
})
