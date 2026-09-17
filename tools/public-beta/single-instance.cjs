const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/public-beta/single-'+Date.now()),userData=path.join(folder,'user-data'),takes=path.join(folder,'takes')
fs.mkdirSync(userData,{recursive:true});fs.mkdirSync(takes)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:true}))
const exe=process.env.TRACE_PACKAGE_EXE||require('electron'),args=process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')]
const report={status:'running',folder,checks:[]};let session
async function wait(fn,label){for(const t=Date.now();Date.now()-t<15000;){if(await fn())return;await delay(30)}throw Error('Timeout '+label)}
async function duplicate(){
 const env={...process.env,TRACE_TEST_ROOT:folder,TRACE_TEST_USER_DATA:userData,TRACE_RECORD_TEST_DIR:takes};delete env.ELECTRON_RUN_AS_NODE
 const child=spawn(process.env.TRACE_SECOND_EXE||exe,['--trace-test',...(process.env.TRACE_SECOND_EXE?[]:args)],{env,windowsHide:true,stdio:'ignore',cwd:path.join(folder,'empty-working-directory')})
 await wait(()=>child.exitCode!==null,'duplicate exits');assert.equal(child.exitCode,0)
}
async function main(){
 session=await launch(exe,folder,{userData,recordDirectory:takes,args,visible:false});const c=session.cdp
 await wait(async()=>(await c.state()).confirmExitWhileRecording===true,'ready')
 await c.request('app.configure',{confirmExitWhileRecording:false})
 const workspace=(await c.state()).workspace;workspace.locked=false
 await c.request('workspace.configure',{workspace})
 for(let i=0;i<3;i++)await duplicate()
 assert.equal((await c.state()).confirmExitWhileRecording,false)
 assert.equal(JSON.parse(fs.readFileSync(path.join(userData,'trace-settings.json'))).confirmExitWhileRecording,false)
 assert.equal((await c.state()).workspace.locked,false)
 report.checks.push('Repeated launches exit without reverting preferences or workspace')
 await c.request('test.window',{mode:'minimize'});await duplicate()
 await wait(async()=>(await c.request('app.info')).data.windowVisible,'restored window')
 report.checks.push('Duplicate launch restores and shows the existing window')
 await c.request('record.start');const take=(await c.state()).currentRecord.id
 await delay(300);const before=(await c.request('app.diagnostics')).data.recording.writtenFrames
 await duplicate();await delay(300)
 assert.equal((await c.state()).currentRecord.id,take)
 const after=(await c.request('app.diagnostics')).data.recording.writtenFrames
 assert(BigInt(after)>BigInt(before));report.frames={before,after}
 await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'stop')
 report.checks.push('Actual WASAPI recording continues through a second launch')
 await session.close();session=null
 session=await launch(exe,folder,{userData,recordDirectory:takes,args,visible:false})
 await wait(async()=>(await session.cdp.state()).confirmExitWhileRecording===false,'restart')
 assert.equal((await session.cdp.state()).workspace.locked,false)
 report.checks.push('Lock is released at exit and the next launch restores the saved configuration')
 report.status='pass'
}main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))})
