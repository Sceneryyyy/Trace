const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m8/resources-'+Date.now()),userData=path.join(folder,'user-data'),duration=Number(process.env.TRACE_RESOURCE_SECONDS||1800)
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const executable=process.env.TRACE_PACKAGE_EXE||path.join(root,require('../../electron-builder.trace.cjs').directories.output,'win-unpacked/Trace.exe')
const report={status:'running',folder,executable,presentation:'visible-workbench',runnerPid:process.pid,startedAt:new Date().toISOString(),requestedSeconds:duration,samples:[],toggles:0,checks:[],softwareRendering:true};let session
const persist=()=>{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m8/resources-latest.json'),JSON.stringify(report,null,2))}
const wait=async(fn,label)=>{for(const t=Date.now();Date.now()-t<30000;){const v=await fn();if(v)return v;await delay(30)}throw Error('Timeout '+label)}
async function main(){
 session=await launch(executable,folder,{userData,args:[],bounds:{x:20,y:20,width:1280,height:800}});report.applicationPid=session.child.pid;persist();const c=session.cdp
 await wait(async()=>Boolean((await c.state()).deviceId),'device')
 await c.evaluate('window.__resourceFrame=null;window.__resourceCount=0;window.__resourceErrors=0;window.trace.onSnapshot(s=>{window.__resourceFrame=s;++window.__resourceCount;if(s.instruments?.phase==="error")++window.__resourceErrors});true')
 const state=await c.state(),workspace={...state.workspace,layout:{...state.workspace.layout,hidden:state.workspace.layout.hidden.filter(x=>x!=='spectrum'&&x!=='soundfield')}}
 await c.request('workspace.configure',{workspace})
 await c.request('instrument.configure',{settings:{...state.instrumentSettings,fftSize:16384,averageMs:2000,holdMs:2000,fieldMs:1000}})
 await c.request('record.configure',{encoding:'pcm24',sampleRate:'source',namePrefix:'M8_Resource'})
 await c.request('record.start');const take=(await c.state()).currentRecord;assert(take);report.takeId=take.id
 await wait(()=>c.evaluate('!!window.__resourceFrame?.instruments?.data'),'first instrument')
 const begun=Date.now(),recordSeconds=Math.min(300,duration*.5);let recording=true,nextSample=0,nextToggle=60,previous='0'
 while((Date.now()-begun)/1000<duration){
  const elapsed=(Date.now()-begun)/1000
  if(recording&&elapsed>=recordSeconds){await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'record stop');recording=false;await c.request('live.start',{deviceId:(await c.state()).deviceId});previous='0';report.checks.push('Recording phase finalized before continued LIVE monitoring')}
  if(elapsed>=nextToggle){
   const s=await c.state();await c.request('workspace.configure',{workspace:{...s.workspace,layout:{...s.workspace.layout,hidden:[...new Set([...s.workspace.layout.hidden,'spectrum','soundfield'])]}}})
   await delay(350);await c.request('workspace.configure',{workspace:s.workspace});await wait(()=>c.evaluate('!!window.__resourceFrame?.instruments?.data'),'restore instruments');++report.toggles;nextToggle+=60
  }
  if(elapsed>=nextSample){
   const info=(await c.request('app.info')).data,heap=await c.send('Runtime.getHeapUsage')
   const data=await c.evaluate('({frame:window.__resourceFrame,delivered:window.__resourceCount,instrumentErrors:window.__resourceErrors})')
   const f=data.frame;assert(f);assert.equal(data.instrumentErrors,0,'instrument query errors');assert(!f.error,String(f.error));assert.equal(f.diagnostics.droppedFrames,'0','capture drop')
   if(recording){const s=await c.state();assert.equal(s.currentRecord.id,take.id);assert(BigInt(f.recording.writtenFrames)>=BigInt(previous));previous=f.recording.writtenFrames;assert.equal(f.recording.error,null)}
   report.version=info.version;assert.equal(info.windowVisible,true,'resource workload must render in a visible window');const metrics=info.processMetrics;assert(Array.isArray(metrics)&&metrics.length>0)
   const totalKB=metrics.reduce((sum,p)=>sum+p.memory.workingSetSize,0),browser=metrics.find(p=>p.type==='Browser')
   assert(Number.isFinite(totalKB)&&totalKB<1.5*1024*1024,'application working set budget')
   assert(browser&&browser.memory.workingSetSize<=600*1024,'main working set budget')
   assert(heap.usedSize<128*1024*1024,'renderer JS heap budget')
   assert(Number(f.diagnostics.replayFrames)<=Number(f.diagnostics.replayCapacityFrames))
   report.samples.push({seconds:elapsed,recording,sourceEpoch:f.epochId,position:f.positionFrame,writtenFrames:recording?f.recording.writtenFrames:null,delivered:data.delivered,instrumentErrors:data.instrumentErrors,totalWorkingSetKB:totalKB,mainWorkingSetKB:browser.memory.workingSetSize,heapBytes:heap.usedSize,heapBackingBytes:heap.backingStorageSize,heapEmbedderBytes:heap.embedderHeapUsedSize,processes:metrics.map(p=>({pid:p.pid,type:p.type,memory:p.memory})),computeMs:f.instruments?.data?.elapsedMs,replayFrames:f.diagnostics.replayFrames,replayCapacityFrames:f.diagnostics.replayCapacityFrames,droppedFrames:f.diagnostics.droppedFrames,estimatedFrames:f.diagnostics.estimatedFrames})
   persist();console.log('RESOURCE_SAMPLE',Math.round(elapsed),Math.round(totalKB/1024)+' MiB',data.delivered+' frames');nextSample+=15
  }
  await delay(500)
 }
 if(recording){await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'final stop')}
 await c.request('live.stop');const files=(await c.state()).recordings;assert(files.some(r=>r.id===take.id&&r.status==='ready'))
 report.elapsedSeconds=(Date.now()-begun)/1000
 if(report.samples.length>20){const base=report.samples.filter(s=>s.seconds>=90&&s.seconds<=300).map(s=>s.totalWorkingSetKB),tail=report.samples.slice(-8).map(s=>s.totalWorkingSetKB);const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;if(base.length)assert(mean(tail)-mean(base)<128*1024,'unbounded working set growth')}
 report.checks.push('Maximum settings stayed within memory and replay bounds','Capture reported no dropped frames and the original take kept writing',...(report.toggles?['Repeated instrument hide/restore did not interrupt capture']:[]),'Recorded file finalized and remained in the isolated library')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});report.finishedAt=new Date().toISOString();persist();console.log('M8_RESOURCES',report.status)})
