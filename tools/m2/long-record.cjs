const {app,BrowserWindow}=require('electron')
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2','long-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
delete process.env.TRACE_TEST_SEGMENT_BYTES
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let win,fixture
const report={kind:'30-minute-real-WASAPI-recording',started:new Date().toISOString(),folder,samples:[]}
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return (await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<5;i++){const s=await state();const r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}
 throw Error('Repeated stale request')
}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  for(let i=0;i<200;i++){if((await state()).active)break;await delay(50)}
  await evaluate("window.__long=null;window.trace.onSnapshot(s=>{window.__long=s});true")
  const devices=(await request('devices.list')).data
  const index=devices.findIndex(d=>d.supported&&/Realtek/i.test(d.label))
  if(index<0)throw Error('Dedicated Realtek endpoint unavailable')
  await request('live.start',{deviceId:devices[index].id})
  fixture=spawn(path.join(root,'build/trace-diagnostics/Release/trace-render-fixture.exe'),[String(index),'1900'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Render fixture startup timeout')),10000)
    fixture.stdout.on('data',data=>{if(String(data).includes('RENDER_READY')){clearTimeout(timeout);resolve()}})
    fixture.on('error',reject);fixture.on('exit',code=>{if(code!==null&&code!==0)reject(Error('Render fixture failed'))})
  })
  await delay(150)
  await request('record.configure',{encoding:'pcm24',sampleRate:'source',namePrefix:'LongAcceptance'})
  await request('record.start')
  const takeId=(await state()).currentRecord.id
  win.minimize();win.setSkipTaskbar(true)
  const begin=Date.now()
  let nextReport=0
  while(Date.now()-begin<1800000){
    await delay(1000)
    const elapsed=(Date.now()-begin)/1000
    if(elapsed>=nextReport){
      const snapshot=await evaluate("window.__long")
      const record=snapshot?.recording
      if(!snapshot?.active||snapshot.error||record?.id!==takeId||record.phase!=='recording'||record.error)throw Error('Capture/record state changed: '+JSON.stringify({active:snapshot?.active,error:snapshot?.error,record}))
      if(snapshot.diagnostics.droppedFrames!=='0')throw Error('Analysis/capture queue loss')
      const memory=await process.getProcessMemoryInfo()
      report.samples.push({seconds:elapsed,writtenFrames:record.writtenFrames,acceptedFrames:record.acceptedFrames,
        queueHighWater:record.queueHighWater,diagnostics:snapshot.diagnostics,memory})
      console.log('M2_LONG_RECORD',Math.round(elapsed),'seconds',record.writtenFrames,'frames','privateKB',memory.private)
      nextReport=elapsed+30
      fs.writeFileSync(path.join(folder,'progress.json'),JSON.stringify(report,null,2))
    }
  }
  const stopped=await request('record.stop'),record=stopped.data
  if(record.phase!=='complete'||record.error||record.writtenFrames!==record.acceptedFrames)throw Error('Final recording integrity failed')
  if(BigInt(record.endFrameExclusive)-BigInt(record.startFrame)!==BigInt(record.writtenFrames))throw Error('Final boundary mismatch')
  const duration=Number(record.writtenFrames)/record.sourceFormat.sampleRate
  if(duration<1800)throw Error('Recording shorter than 30 minutes')
  const position=await evaluate("window.__long.positionFrame")
  await delay(1000)
  if(!(await state()).active||BigInt(await evaluate("window.__long.positionFrame"))<=BigInt(position))throw Error('LIVE did not continue')
  let summary
  for(let i=0;i<600;i++){summary=(await state()).recordings.find(t=>t.id===takeId);if(summary?.status==='ready')break;if(summary?.status==='failed')throw Error(summary.error);await delay(100)}
  if(summary?.status!=='ready')throw Error('Session finalization timeout')
  report.status='pass';report.durationSeconds=duration;report.take=summary
  report.final={...record,waveform:undefined,loudnessHistory:undefined}
  console.log('M2_30MIN_RECORD_PASS',duration,record.writtenFrames)
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(report.error);try{await request('record.stop')}catch{}}
 finally{
  if(fixture&&fixture.exitCode===null)fixture.kill('SIGTERM')
  fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2))
  fs.writeFileSync(path.join(root,'artifacts/m2/long-latest.json'),JSON.stringify(report,null,2))
  app.quit()
 }
})
