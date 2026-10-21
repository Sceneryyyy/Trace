const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/public-beta/support-'+Date.now()),userData=path.join(folder,'user-data'),takes=path.join(folder,'takes')
fs.mkdirSync(userData,{recursive:true});fs.mkdirSync(takes)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const fixture=require('../m4/fixture.cjs')(takes),exe=process.env.TRACE_PACKAGE_EXE||require('electron'),args=process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')]
process.env.TRACE_TEST_SUPPORT_DIRECTORY='1';process.env.TRACE_TEST_SUPPORT_RELOAD='1'
const report={status:'running',folder,checks:[]};let session,c
async function wait(fn,label){for(const t=Date.now();Date.now()-t<20000;){try{if(await fn())return}catch(e){if(!/context|navigation|Cannot find|destroyed/i.test(String(e)))throw e}await delay(40)}throw Error('Timeout '+label)}
const pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function start(){session=await launch(exe,folder,{userData,recordDirectory:takes,args,visible:true,bounds:{x:20,y:20,width:1280,height:800}});c=session.cdp;await wait(async()=>Boolean((await c.state()).support),'support ready');await c.send('Page.bringToFront')}
function readExport(result){return JSON.parse(fs.readFileSync(path.join(result.data.directory,'diagnostics.json')))}
async function main(){
 await start();assert.equal((await c.state()).support.previousInterrupted,false)
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','file')
 let exported=await c.request('app.exportDiagnostics'),diagnostic=readExport(exported),text=JSON.stringify(diagnostic)
 for(const value of [userData,takes,fixture.document.sessionId,fixture.document.name,(await c.state()).deviceId])if(value)assert(!text.includes(value),'private value escaped')
 assert(/^[a-f0-9]{64}$/.test(diagnostic.buildId));assert(diagnostic.runtime.electron);assert(diagnostic.events.length)
 const mail=(await c.request('app.feedback')).data
 assert.equal(mail.opened,false);assert(mail.mailto.startsWith('mailto:472841772@qq.com?subject='))
 pass('Export contains build/runtime/history while excluding paths, media names, take and device IDs; mail stays an unsent draft')
 await c.request('file.close')
 await c.request('support.testFault',{kind:'worker'})
 diagnostic=readExport(await c.request('app.exportDiagnostics'))
 assert(diagnostic.events.some(e=>e.kind==='file-worker-exit'))
 pass('Actual failed file worker is recorded and the application remains usable')
 await c.evaluate('setTimeout(()=>{throw Error("PRIVATE_NAME_C:/recordings/secret.wav")},0);true')
 await wait(()=>c.evaluate('!!document.querySelector(".recovery-screen")'),'fallback')
 await c.screenshot(path.join(folder,'recovery.png'))
 diagnostic=readExport(await c.request('app.exportDiagnostics'))
 assert(diagnostic.events.some(e=>e.kind==='renderer-script'));assert(!JSON.stringify(diagnostic).includes('PRIVATE_NAME'))
 await c.click('.recovery-screen .support-actions button:first-child')
 await wait(()=>c.evaluate('!!document.querySelector(".record-button")'),'reload')
 await c.request('record.start');await delay(300)
 const take=(await c.state()).currentRecord.id,before=(await c.request('app.diagnostics')).data.recording.writtenFrames
 await c.request('support.testFault',{kind:'renderer'})
 await delay(350)
 await wait(()=>c.evaluate('!!document.querySelector(".record-button")'),'native renderer recovery')
 assert.equal((await c.state()).currentRecord.id,take)
 const after=(await c.request('app.diagnostics')).data.recording.writtenFrames
 assert(BigInt(after)>BigInt(before));report.rendererRecordFrames={before,after}
 await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'stop')
 pass('Script fallback reload and actual renderer crash/reload preserve the ongoing WASAPI take')
 await c.click('[aria-label="设置与帮助"]');await c.click('[data-section="help"]');await wait(()=>c.evaluate('!!document.querySelector(".support-panel")'),'help')
 for(const scale of [1,1.5,2]){
  await c.send('Emulation.setDeviceMetricsOverride',{width:1024,height:700,deviceScaleFactor:scale,mobile:false});await delay(100)
  assert(await c.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await c.screenshot(path.join(folder,'help-'+scale+'.png'))
 }
 await c.request('record.start');await delay(600)
 const interruptedTake=(await c.state()).currentRecord.id
 report.interruptedTakeFrames=(await c.request('app.diagnostics')).data.recording.writtenFrames
 assert(BigInt(report.interruptedTakeFrames)>0n)
 await c.request('support.testFault',{kind:'main'})
 await wait(()=>session.child.exitCode!==null,'fatal exit');assert.equal(session.child.exitCode,1)
 c.close();session=null;await start()
 assert.equal((await c.state()).support.previousInterrupted,true)
 await wait(()=>c.evaluate('document.body.innerText.includes("上次未正常退出")'),'restart warning')
 diagnostic=readExport(await c.request('app.exportDiagnostics'))
 assert(diagnostic.events.some(e=>e.kind==='main-uncaught'))
 const interrupted=await c.state();assert(interrupted.recordings.some(t=>t.id===interruptedTake))
 await c.request('record.recover',{takeId:interruptedTake})
 await wait(async()=>(await c.state()).recordings.some(t=>t.id===interruptedTake&&t.status==='recovered'),'recover interrupted recording')
 const recovered=(await c.state()).recordings.find(t=>t.id===interruptedTake)
 assert(BigInt(recovered.frames)>=BigInt(report.interruptedTakeFrames));report.recoveredFrames=recovered.frames
 await c.screenshot(path.join(folder,'restart.png'))
 pass('Fatal main exception exits; restart offers diagnostics and the interrupted real recording recovers written frames')
 await session.close();session=null;await start();assert.equal((await c.state()).support.previousInterrupted,false)
 pass('Clean shutdown clears the interrupted-run warning; diagnostics survive restart')
 report.status='pass'
}main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('SUPPORT_UI',report.status,folder)})
