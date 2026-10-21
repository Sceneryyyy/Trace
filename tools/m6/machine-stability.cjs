// Real packaged WASAPI acceptance. Artifacts and preferences are isolated.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {spawn}=require('node:child_process'),{launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/acceptance','machine-'+Date.now())
const seconds=Number(process.env.TRACE_STABILITY_SECONDS||7200),monitorSeconds=Number(process.env.TRACE_MONITOR_SECONDS||600)
assert(Number.isInteger(seconds)&&seconds>=1800&&seconds<=7200)
assert(Number.isInteger(monitorSeconds)&&monitorSeconds>=0&&monitorSeconds<=600)
const executable=process.env.TRACE_PACKAGE_EXE;assert(executable,'Explicit package required')
fs.mkdirSync(folder,{recursive:true})
const userData=path.join(folder,'user-data');fs.mkdirSync(userData)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={status:'running',kind:'Real WASAPI packaged monitoring and recording',started:new Date().toISOString(),folder,executable,requestedSeconds:seconds,monitorSeconds,samples:[]}
let session,fixture,fixtureReady=false
const save=()=>{fs.writeFileSync(path.join(folder,'progress.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/acceptance/machine-latest.json'),JSON.stringify(report,null,2))}
const wait=async(fn,label,timeout=60000)=>{for(const begin=Date.now();Date.now()-begin<timeout;){const v=await fn();if(v)return v;await delay(100)}throw Error('Timeout '+label)}
const audioFiles=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?audioFiles(path.join(dir,e.name)):/\.(wav|mp3|aac|m4a|pcm)$/i.test(e.name)?[path.join(dir,e.name)]:[]):[]
// Pause through a marker; terminating the controller can also terminate its
// owned Windows process tree before REC has finalized.
const pauseRequested=()=>fs.existsSync(path.join(folder,'pause-request.json'))
async function main(){
 process.env.TRACE_TEST_GPU='1'
 report.controllerFlags=['--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']
 session=await launch(executable,folder,{userData,args:report.controllerFlags,bounds:{x:20,y:20,width:1280,height:800}})
 report.pid=session.child.pid
 const c=session.cdp;await c.evaluate('window.__stability=null;window.trace.onSnapshot(s=>window.__stability=s);true')
 const devices=(await c.request('devices.list')).data,index=devices.findIndex(d=>d.supported&&/Realtek/i.test(d.label))
 assert(index>=0,'Dedicated Realtek endpoint required');report.device=devices[index]
 await c.request('live.start',{deviceId:devices[index].id})
 const sample=async(stage)=>{
  const s=await c.evaluate('window.__stability');assert(s?.active&&!s.error,JSON.stringify(s?.error))
  assert.equal(s.diagnostics.droppedFrames,'0','Capture/analysis loss')
  if(stage==='recording'){assert.equal(s.recording?.phase,'recording');assert(!s.recording.error);assert.equal(s.recording.id,report.takeId)}
  const metrics=(await c.send('Performance.getMetrics')).metrics
  const item={at:new Date().toISOString(),stage,elapsedSeconds:(Date.now()-report.stageBegin)/1000,positionFrame:s.positionFrame,
   writtenFrames:s.recording?.writtenFrames,acceptedFrames:s.recording?.acceptedFrames,recordEstimatedFrames:s.recording?.estimatedFrames,queueHighWater:s.recording?.queueHighWater,
   diagnostics:s.diagnostics,heapUsed:metrics.find(m=>m.name==='JSHeapUsedSize')?.value}
  if(report.samples.length){const prev=report.samples.at(-1);if(prev.stage===stage)assert(BigInt(item.positionFrame)>BigInt(prev.positionFrame),'Capture clock stopped')}
  report.samples.push(item);save();console.log('STABILITY',stage,Math.round(item.elapsedSeconds),item.writtenFrames||item.positionFrame)
 }
 await c.send('Performance.enable')
 report.stage='monitoring';report.stageBegin=Date.now();save()
 let nextSample=Date.now()+30000
 while(Date.now()-report.stageBegin<monitorSeconds*1000){
  await delay(Math.min(1000,monitorSeconds*1000-(Date.now()-report.stageBegin)))
  if(pauseRequested()){report.status='paused';report.stage='paused-before-recording';report.pausedAt=new Date().toISOString();return}
  if(Date.now()>=nextSample){await sample('monitoring');assert.equal(audioFiles(path.join(folder,'takes')).length,0,'Monitoring wrote audio');nextSample=Date.now()+30000}
 }
 report.monitoringNoAudioFiles=true
 await c.request('record.configure',{format:'wav',encoding:'pcm24',sampleRate:'source',namePrefix:'MachineStability'})
 await c.request('record.start');report.takeId=(await c.state()).currentRecord.id
 fixture=spawn(path.join(root,'build/trace-diagnostics/Release/trace-render-fixture.exe'),[String(index),String(seconds)],{windowsHide:true,stdio:['ignore','pipe','pipe']})
 fixture.stdout.on('data',b=>{fs.appendFileSync(path.join(folder,'fixture.log'),b);if(String(b).includes('RENDER_READY'))fixtureReady=true})
 fixture.stderr.on('data',b=>fs.appendFileSync(path.join(folder,'fixture.log'),b));fixture.on('error',e=>{report.fixtureError=String(e)})
 await wait(()=>{if(report.fixtureError)throw Error(report.fixtureError);return fixtureReady},'render fixture')
 report.stage='recording';report.stageBegin=Date.now();save()
 nextSample=Date.now()+30000
 while(Date.now()-report.stageBegin<seconds*1000){
  await delay(Math.min(1000,seconds*1000-(Date.now()-report.stageBegin)))
  if(pauseRequested()){report.pausedAt=new Date().toISOString();break}
  if(Date.now()>=nextSample){await sample('recording');nextSample=Date.now()+30000}
  if(fixture.exitCode!==null&&fixture.exitCode!==0)throw Error('Render fixture failed')
 }
 report.final=(await c.request('record.stop')).data
 const record=report.final;assert.equal(record.phase,'complete');assert(!record.error);assert.equal(record.writtenFrames,record.acceptedFrames)
 assert.equal(BigInt(record.endFrameExclusive)-BigInt(record.startFrame),BigInt(record.writtenFrames))
 report.durationSeconds=Number(record.writtenFrames)/record.sourceFormat.sampleRate;if(!report.pausedAt)assert(report.durationSeconds>=seconds)
 report.stage='finalizing';save()
 report.take=await wait(async()=>{const t=(await c.state()).recordings.find(t=>t.id===report.takeId);if(t?.status==='failed')throw Error(t.error);return t?.status==='ready'?t:null},'record finalization',600000)
 await c.request('live.stop');await session.close();session=null
 report.stage='restart';save();session=await launch(executable,folder,{userData,args:report.controllerFlags,visible:false})
 await session.cdp.request('file.open',{takeId:report.takeId,role:'source'})
 const playback=await wait(async()=>{const p=(await session.cdp.state()).playback;return p?.analysisPhase==='ready'?p:null},'reopened full file analysis',600000)
 assert.equal(playback.totalFrames,record.writtenFrames);report.reopenedFrames=playback.totalFrames
 for(const fraction of [0,.5,.99]){const positionFrame=String(Math.floor(Number(playback.totalFrames)*fraction));await session.cdp.request('playback.seek',{playbackId:playback.id,positionFrame,resume:false})}
 report.status=report.pausedAt?'paused':'pass';report.stage=report.pausedAt?'paused-by-user':'complete'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{
 if(fixture&&fixture.exitCode===null)fixture.kill()
 if(session){try{await session.cdp.request('record.stop')}catch{}await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1})}
 report.finished=new Date().toISOString();save();fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('MACHINE_STABILITY',report.status,folder)
})
