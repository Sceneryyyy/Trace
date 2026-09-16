const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/iteration/two-live-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const userData=path.join(folder,'user-data');fs.mkdirSync(userData);fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}))
const report={folder,status:'running',checks:[]};let session
const wait=async(fn,label,max=30000)=>{for(const t=Date.now();Date.now()-t<max;){const value=await fn();if(value)return value;await delay(50)}throw Error('Timeout '+label)}
const pass=name=>{report.checks.push(name);console.log('PASS',name)}
async function main(){
 const packaged=process.env.TRACE_PACKAGE_EXE;session=await launch(packaged||require('electron'),folder,{userData,args:[...(packaged?[]:[path.join(root,'out-trace/main/index.js')]),'--disable-gpu','--disable-renderer-backgrounding']});const c=session.cdp
 await wait(async()=>Boolean((await c.state()).deviceId),'device')
 await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:1,mobile:false})
 await c.evaluate('window.__iterationFrame=null;window.trace.onSnapshot(s=>window.__iterationFrame=s);true')
 await c.request('record.configure',{encoding:'pcm24',sampleRate:'source',namePrefix:'RangeAcceptance'})
 await c.request('record.start');const take=(await c.state()).currentRecord;assert(take);console.log('RECORDING_STARTED',take.id)
 const seen=await wait(()=>c.evaluate("window.__iterationFrame?.recordingView?.inspectableRange&&BigInt(window.__iterationFrame.recordingView.durationNs)>65000000000n"),'65-second recorded overview',90000)
 assert(seen);const frame=await c.evaluate('window.__iterationFrame')
 assert(BigInt(frame.recordingView.inspectableRange.startFrame)>0n)
 assert(BigInt(frame.recordingView.inspectableRange.endFrame)<=BigInt(frame.recordingView.durationNs))
 assert(BigInt(frame.recordingView.inspectableRange.endFrame)-BigInt(frame.recordingView.inspectableRange.startFrame)<=60000000000n)
 report.recordedFrames=frame.recording.writtenFrames;report.range=frame.recordingView.inspectableRange;pass('Actual WASAPI recording publishes a bounded, sample-derived available range')
 const point=async fraction=>c.evaluate('(()=>{const r=document.querySelector(".wave-panel canvas").getBoundingClientRect();return {x:r.x+36+(r.width-46)*'+fraction+',y:r.y+r.height/2}})()')
 const old=await point(.01);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...old});await delay(150)
 assert.equal(Boolean((await c.state()).playback),false);assert(!(await c.evaluate('document.querySelector(".error-banner")?.textContent||""')).includes('60 秒'));pass('Clicking expired overview does not issue an invalid seek or interrupt recording')
 await c.screenshot(path.join(folder,'range.png'))
 const recent=await point(.95);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...recent})
 await wait(async()=>((await c.state()).playback?.temporary),'inspect')
 assert.equal((await c.state()).currentRecord.id,take.id);const written=await c.evaluate('window.__iterationFrame.recording.writtenFrames');await delay(300);assert(BigInt(await c.evaluate('window.__iterationFrame.recording.writtenFrames'))>BigInt(written));pass('Eligible history remains inspectable while the same take continues writing')
 await c.click('.record-button');await wait(async()=>!(await c.state()).currentRecord,'stop')
 await wait(()=>c.evaluate("document.querySelector('.operation-notice')?.textContent.includes('已保存')"),'saved feedback')
 await c.screenshot(path.join(folder,'saved-notice.png'))
 const diagnostic=(await c.request('app.diagnostics')).data;assert.equal(diagnostic.product,'Trace');assert(!JSON.stringify(diagnostic).includes('RangeAcceptance'));pass('Stop completion is visible and diagnostics exclude recording names')
 await c.click('.operation-notice button');await wait(async()=>{const p=(await c.state()).playback;return p?.takeId===take.id&&!p.temporary&&p.analysisPhase==='ready'},'view saved file')
 assert.equal((await c.state()).monitoringRequested,false);assert.equal((await c.state()).active,false);pass('Saved result opens directly and the original monitoring-off intent is preserved')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/iteration/two-live-latest.json'),JSON.stringify(report,null,2));console.log('ITERATION_TWO_LIVE',report.status,report.checks.length)})
