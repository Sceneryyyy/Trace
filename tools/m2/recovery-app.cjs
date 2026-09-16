const {app,BrowserWindow}=require('electron')
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),folder=process.env.TRACE_RECOVERY_CASE
if(!folder)throw Error('Missing recovery case')
process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
const evalJs=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evalJs("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<5;i++){
  const s=await state(),r=await evalJs('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')')
  if(r.ok)return r
  if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))
 }
 throw Error('Repeated stale request')
}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  for(let i=0;i<200;i++){if((await state()).active)break;await delay(50)}
  if(process.env.TRACE_RECOVERY_MODE==='seed'){
   const devices=(await request('devices.list')).data
   const device=devices.find(d=>d.supported&&d.isDefault&&!/Realtek/i.test(d.label))||devices.find(d=>d.supported&&!/Realtek/i.test(d.label))
   if(device)await request('live.start',{deviceId:device.id})
   await request('record.configure',{encoding:'float32',sampleRate:'source',namePrefix:'CrashTest'})
   await request('record.start');await delay(2500)
   const s=await state()
   if(!s.currentRecord)throw Error('REC not active')
   fs.writeFileSync(path.join(folder,'seed-ready.json'),JSON.stringify({id:s.currentRecord.id,pid:process.pid}))
   // Parent deliberately terminates this process without native or metadata cleanup.
   setInterval(()=>{},1000)
  }else{
   const s=await state(),take=s.recordings.find(t=>t.status==='recoverable')
   if(!take)throw Error('No interrupted recording discovered')
   await request('record.recover',{takeId:take.id})
   const after=await state(),recovered=after.recordings.find(t=>t.id===take.id)
   if(recovered.status!=='recovered'||BigInt(recovered.frames)===0n)throw Error('Recovery did not yield usable frames')
   fs.writeFileSync(path.join(folder,'recovery-ui.json'),JSON.stringify({status:'pass',take:recovered}))
   app.quit()
  }
 }catch(error){fs.writeFileSync(path.join(folder,'recovery-error.json'),JSON.stringify({error:String(error),stack:error.stack}));console.error(error);app.quit()}
})
