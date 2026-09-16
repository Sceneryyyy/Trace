const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m10/transition-'+Date.now()),userData=path.join(folder,'user-data');fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
let session;const report={folder,status:'running',checks:[]}
async function wait(fn,label){for(const t=Date.now();Date.now()-t<20000;){const v=await fn();if(v)return v;await delay(20)}throw Error('Timeout '+label)}
async function main(){
 process.env.TRACE_TEST_GPU='1';session=await launch(process.env.TRACE_PACKAGE_EXE||path.join(root,'dist-trace/preview.20/win-unpacked/Trace.exe'),folder,{userData});const c=session.cdp
 await wait(async()=>Boolean((await c.state()).deviceId),'device');await c.evaluate('window.__sp=null;window.__transition=null;window.trace.onSpectrogram(p=>{window.__sp=p;if(p.requestId==="stale-after-stop")window.__transition=p});true')
 const state=await c.state();await c.request('workspace.configure',{workspace:{...state.workspace,layout:{...state.workspace.layout,hidden:state.workspace.layout.hidden.filter(x=>x!=='spectrogram')}}})
 await c.request('spectrogram.configure',{settings:{...state.spectrogramSettings,surface:{...state.spectrogramSettings.surface,mode:'3d'}}});await c.request('record.start')
 const old=await wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.source.kind==="take"?{source:window.__sp.source,startFrame:window.__sp.axisStartFrame,endFrame:window.__sp.axisEndFrame}:null'),'take view')
 await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'stop')
 const request={protocolVersion:1,requestId:'stale-after-stop',expectedStateRevision:0,command:'spectrogram.query',payload:{source:old.source,range:{startFrame:old.startFrame,endFrame:old.endFrame,width:256,height:128}}}
 const result=await c.evaluate('window.trace.request('+JSON.stringify(request)+')');assert(result.ok);const cancelled=await wait(()=>c.evaluate('window.__transition'),'cancellation');assert.equal(cancelled.phase,'cancelled')
 await c.request('live.start',{deviceId:(await c.state()).deviceId});await wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.source.kind==="live"'),'new source');assert.equal((await c.state()).error,null)
 report.checks.push('A post-stop stale take request is explicitly cancelled before binding','The new LIVE source continues without a false data error');report.status='pass'
}
main().catch(e=>{report.error=String(e);report.status='fail';console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m10/transition-latest.json'),JSON.stringify(report,null,2));console.log('SOURCE_TRANSITION',report.status)})
