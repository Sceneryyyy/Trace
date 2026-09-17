const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m8/visibility-'+Date.now()),userData=path.join(folder,'user-data');fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
let session;const report={folder,status:'running',checks:[]};const pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function wait(fn,label){for(const t=Date.now();Date.now()-t<20000;){const r=await fn();if(r)return r;await delay(25)}throw Error('Timeout '+label)}
async function main(){
 session=await launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')]});const c=session.cdp
 await c.evaluate('window.__visFrame=null;window.trace.onSnapshot(s=>window.__visFrame=s);window.__mutations=0;window.__observer=new MutationObserver(x=>window.__mutations+=x.length);window.__observer.observe(document.querySelector(".workspace"),{subtree:true,attributes:true,childList:true,characterData:true});true')
 await c.request('record.start');const take=(await c.state()).currentRecord
 await wait(()=>c.evaluate('BigInt(window.__visFrame?.recording?.writtenFrames||0)>48000n'),'record frames')
 for(const mode of ['hide','minimize']){
  await c.request('test.window',{mode});await wait(async()=>(await c.state()).windowVisible===false,'hidden state')
  await delay(150);const before=await c.evaluate('({mutations:window.__mutations,frames:window.__visFrame.recording.writtenFrames})')
  const s=await c.state();await c.request('workspace.configure',{workspace:{...s.workspace,layout:{...s.workspace.layout,hidden:[]}}})
  await delay(1100)
  const after=await c.evaluate('({mutations:window.__mutations,frames:window.__visFrame.recording.writtenFrames})')
  assert.equal(after.mutations,before.mutations,'hidden workspace re-rendered');assert(BigInt(after.frames)>BigInt(before.frames));assert.equal((await c.state()).currentRecord.id,take.id)
  await c.request('test.window',{mode:'restore'});await wait(async()=>(await c.state()).windowVisible===true,'restore state');await wait(()=>c.evaluate('document.querySelectorAll("[data-instrument]").length===8'),'latest layout')
  pass(mode+' freezes UI presentation while recording continues, then restores the latest state')
 }
 await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'record stop');assert.equal((await c.state()).active,false);pass('Original monitoring intention is preserved')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.status='fail';report.closeError=String(e);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m8/visibility-latest.json'),JSON.stringify(report,null,2))})
