const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m11/resources-'+Date.now()),userData=path.join(folder,'user-data'),duration=Number(process.env.TRACE_RESOURCE_SECONDS||1800)
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true});const fixture=require('../m4/fixture.cjs')(takes);
const executable=process.env.TRACE_PACKAGE_EXE||path.join(root,require('../../electron-builder.trace.cjs').directories.output,'win-unpacked/Trace.exe')
const report={status:'running',folder,executable,presentation:'visible-workbench',runnerPid:process.pid,startedAt:new Date().toISOString(),requestedSeconds:duration,samples:[],reportRuns:[],toggles:0,checks:[],softwareRendering:false};let session
const persist=()=>{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m11/resources-latest.json'),JSON.stringify(report,null,2))}
const wait=async(fn,label)=>{for(const t=Date.now();Date.now()-t<30000;){const v=await fn();if(v)return v;await delay(30)}throw Error('Timeout '+label)}
async function main(){
 process.env.TRACE_TEST_GPU='1';process.env.TRACE_TEST_REPORT_DEST=path.join(folder,'report-exports')
 session=await launch(executable,folder,{userData,args:[],bounds:{x:20,y:20,width:1280,height:800}});report.applicationPid=session.child.pid;persist();const c=session.cdp
 await wait(async()=>Boolean((await c.state()).deviceId),'device')
 await c.evaluate('window.__resourceFrame=null;window.__resourceCount=0;window.__resourceErrors=0;window.trace.onSnapshot(s=>{window.__resourceFrame=s;++window.__resourceCount;if(s.instruments?.phase==="error")++window.__resourceErrors});true')
 await c.evaluate('window.__spectralStats={count:0,ready:0,cancelled:0,errors:[]};window.trace.onSpectrogram(p=>{const s=window.__spectralStats;s.count++;if(p.phase==="cancelled")s.cancelled++;if(p.phase==="ready"&&p.view.coverage.some(v=>v>0))s.ready++;if(p.phase==="error"){s.errors.push(p.error);if(s.errors.length>32)s.errors.shift()}});true')
 const state=await c.state(),workspace={...state.workspace,layout:{...state.workspace.layout,hidden:state.workspace.layout.hidden.filter(x=>x!=='spectrum'&&x!=='soundfield'&&x!=='spectrogram')}}
 await c.request('workspace.configure',{workspace})
 await c.request('instrument.configure',{settings:{...state.instrumentSettings,fftSize:16384,averageMs:2000,holdMs:2000,fieldMs:1000}})
 await c.request('spectrogram.configure',{settings:{...(await c.state()).spectrogramSettings,fftSize:16384,surface:{...(await c.state()).spectrogramSettings.surface,mode:'3d',detail:256}}})
 await c.request('record.configure',{encoding:'pcm24',sampleRate:'source',namePrefix:'M11_Resource'})
 await c.request('record.start');const take=(await c.state()).currentRecord;assert(take);report.takeId=take.id
 await wait(()=>c.evaluate('!!window.__resourceFrame?.instruments?.data'),'first instrument')
 await wait(()=>c.evaluate('window.__spectralStats.ready>0'),'first spectral raster')
 const begun=Date.now(),recordSeconds=Math.min(300,duration*.5);let recording=true,nextSample=0,nextToggle=60,nextReport=0,lastReportId='',previous='0',faultDone=false
 while((Date.now()-begun)/1000<duration){
  const elapsed=(Date.now()-begun)/1000
  if(recording&&elapsed>=recordSeconds){await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'record stop');recording=false;await c.request('live.start',{deviceId:(await c.state()).deviceId});previous='0';report.checks.push('Recording phase finalized before continued LIVE monitoring')}
  if(!recording&&elapsed>=nextReport){
   if(!lastReportId){await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','report source analysis');const file=(await c.state()).playback;lastReportId=(await c.request('report.prepare',{playbackId:file.id,scope:'whole'})).data.reportId;await c.request('file.close')}
   else lastReportId=(await c.request('report.retry',{reportId:lastReportId})).data.reportId
   const completed=await wait(async()=>{const job=(await c.state()).reportJobs.find(j=>j.id===lastReportId);if(job.phase==='failed')throw Error(job.error);return job.phase==='ready'?job:null},'background report')
   if(report.reportRuns.length%3===0){await c.request('report.export',{reportId:lastReportId});await wait(async()=>{const job=(await c.state()).reportJobs.find(j=>j.id===lastReportId);if(job.exportState?.phase==='failed')throw Error(job.exportState.error);return job.exportState?.phase==='ready'},'background report copy')}
   report.reportRuns.push({id:lastReportId,seconds:elapsed,rows:completed.rows});assert.equal(completed.rows,800);nextReport=elapsed+45
  }
  if(elapsed>=nextToggle){
   const s=await c.state();await c.request('workspace.configure',{workspace:{...s.workspace,layout:{...s.workspace.layout,hidden:[...new Set([...s.workspace.layout.hidden,'spectrum','soundfield','spectrogram'])]}}})
   await delay(350);await c.request('workspace.configure',{workspace:s.workspace});await wait(()=>c.evaluate('!!window.__resourceFrame?.instruments?.data'),'restore instruments');++report.toggles;nextToggle+=60
  }
  if(!faultDone&&elapsed>=Math.min(180,duration*.3)){
   await wait(()=>c.evaluate('Boolean(document.querySelector(".surface-gl")?.getContext("webgl2"))'),'3D context')
   await c.evaluate('window.__resourceLoss=document.querySelector(".surface-gl").getContext("webgl2").getExtension("WEBGL_lose_context");window.__resourceLoss.loseContext();true')
   await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.surfaceMode==="2d"'),'loss fallback');await delay(350)
   await c.evaluate('window.__resourceLoss.restoreContext();true');await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.surfaceMode==="3d"'),'GPU restore');faultDone=true;report.checks.push('Forced GPU loss and recovery preserved the monitoring/recording workflow')
  }
  if(elapsed>=nextSample){
   await wait(()=>c.evaluate('(()=>{const c=document.querySelector(".surface-gl");return !!c&&JSON.parse(c.dataset.surfaceBuffers||"{}").vertexBytes>0})()'),'painted 3D buffers')
   const info=(await c.request('app.info')).data,heap=await c.send('Runtime.getHeapUsage')
   const data=await c.evaluate('({frame:window.__resourceFrame,delivered:window.__resourceCount,instrumentErrors:window.__resourceErrors,spectral:window.__spectralStats})')
   const surface=await c.evaluate('(()=>{const c=document.querySelector(".surface-gl");return c?{pixels:c.width*c.height,...JSON.parse(c.dataset.surfaceBuffers||"{}")}:null})()');assert(surface&&!surface.lost);assert(surface.pixels<=4194304);assert(surface.buffers===3&&surface.programs===1&&surface.vertexBytes<=524288&&surface.indexBytes<=400000,'surface allocation budget');const f=data.frame;assert(f);assert.equal(data.instrumentErrors,0,'instrument query errors');assert.deepEqual(data.spectral.errors,[],'spectrogram query errors');assert(!f.error,String(f.error));assert.equal(f.diagnostics.droppedFrames,'0','capture drop')
   if(recording){const s=await c.state();assert.equal(s.currentRecord.id,take.id);assert(BigInt(f.recording.writtenFrames)>BigInt(previous),'recorded frames must advance between resource samples');previous=f.recording.writtenFrames;assert.equal(f.recording.error,null)}
   report.version=info.version;assert.equal(info.windowVisible,true,'resource workload must render in a visible window');const metrics=info.processMetrics;assert(Array.isArray(metrics)&&metrics.length>0)
   const totalKB=metrics.reduce((sum,p)=>sum+p.memory.workingSetSize,0),browser=metrics.find(p=>p.type==='Browser')
   assert(Number.isFinite(totalKB)&&totalKB<1.5*1024*1024,'application working set budget')
   assert(browser&&browser.memory.workingSetSize<=600*1024,'main working set budget')
   assert(heap.usedSize<128*1024*1024,'renderer JS heap budget')
   const reports=info.reportUsage;assert(reports.drafts<=8&&reports.queued<=2);assert(reports.workerPeak.rss<=256*1024*1024&&reports.workerPeak.heapUsed<=64*1024*1024);assert(totalKB*1024+reports.workerPeak.rss<1.5*1024*1024*1024,'combined current app plus peak report-worker budget');
   const spectralCache=info.spectrogramUsage;assert(spectralCache.bytes+(spectralCache.projectionBytes||0)<=128*1024*1024,'combined spectral cache budget')
   assert(Number(f.diagnostics.replayFrames)<=Number(f.diagnostics.replayCapacityFrames))
   report.samples.push({reports:info.reportUsage,surface,spectralCache:info.spectrogramUsage,spectral:data.spectral,seconds:elapsed,recording,sourceEpoch:f.epochId,position:f.positionFrame,writtenFrames:recording?f.recording.writtenFrames:null,delivered:data.delivered,instrumentErrors:data.instrumentErrors,totalWorkingSetKB:totalKB,mainWorkingSetKB:browser.memory.workingSetSize,heapBytes:heap.usedSize,heapBackingBytes:heap.backingStorageSize,heapEmbedderBytes:heap.embedderHeapUsedSize,processes:metrics.map(p=>({pid:p.pid,type:p.type,memory:p.memory})),computeMs:f.instruments?.data?.elapsedMs,replayFrames:f.diagnostics.replayFrames,replayCapacityFrames:f.diagnostics.replayCapacityFrames,droppedFrames:f.diagnostics.droppedFrames,estimatedFrames:f.diagnostics.estimatedFrames})
   persist();console.log('RESOURCE_SAMPLE',Math.round(elapsed),Math.round(totalKB/1024)+' MiB',data.delivered+' frames');nextSample+=15
  }
  await delay(500)
 }
 if(recording){await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'final stop')}
 await c.request('live.stop');const files=(await c.state()).recordings;assert(files.some(r=>r.id===take.id&&r.status==='ready'))
 report.elapsedSeconds=(Date.now()-begun)/1000
 if(report.samples.length>20){const base=report.samples.filter(s=>s.seconds>=90&&s.seconds<=300).map(s=>s.totalWorkingSetKB),tail=report.samples.slice(-8).map(s=>s.totalWorkingSetKB);const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;if(base.length)assert(mean(tail)-mean(base)<128*1024,'unbounded working set growth')}
 report.checks.push('Maximum settings stayed within memory and replay bounds','Capture reported no dropped frames and the original take kept writing',...(report.toggles?['Repeated instrument hide/restore did not interrupt capture']:[]),'Recorded file finalized and remained in the isolated library')
 assert(report.reportRuns.length>0);report.checks.push('Repeated report generation and copied bundles stay bounded while LIVE instruments continue');
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});report.finishedAt=new Date().toISOString();persist();console.log('M11_RESOURCES',report.status)})
