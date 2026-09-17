// Actual preview.28 UI with generated demonstration audio and isolated preferences.
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/manual-'+Date.now()),userData=path.join(folder,'users'),takes=path.join(folder,'takes')
const output=path.join(root,'docs/assets/quick-start-preview28');fs.mkdirSync(output,{recursive:true});fs.mkdirSync(userData,{recursive:true});fs.mkdirSync(takes)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}))
const fixture=require('../m4/fixture.cjs')(takes);fixture.document.name='演示信号';fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document,null,2))
let session,c;const captures={}
async function wait(fn,label){for(let i=0;i<500;i++){if(await fn())return;await delay(30)}throw Error(label)}
async function select(value){await c.evaluate(`(()=>{const e=document.querySelector('[aria-label="工作台布局"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(300)}
async function shot(name,selector){await delay(180);const clip=selector?await c.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`):undefined;const v=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});fs.writeFileSync(path.join(['workbench','waveform','layout-toolbar'].includes(name)?output:folder,name+'.png'),Buffer.from(v.data,'base64'));captures[name]=clip||{width:1280,height:800}}
async function main(){
 session=await launch(path.join(root,'dist-trace/preview.28/win-unpacked/Trace.exe'),folder,{userData,recordDirectory:takes,visible:true,bounds:{x:20,y:20,width:1296,height:839}});c=session.cdp
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:2,mobile:false})
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','analysis')
 const id=(await c.state()).playback.id
 await c.request('playback.seek',{playbackId:id,positionFrame:'192000',resume:false});await c.send('Page.bringToFront');await delay(300)
 await shot('workbench');await shot('transport','.transport')
 await c.request('playback.selection',{playbackId:id,startFrame:'96000',endFrame:'240000',loop:false})
 await wait(async()=>(await c.state()).playback?.selectionAnalysis?.phase==='ready','selection')
 await shot('selection','.workspace');await shot('waveform','[data-instrument="waveform"]');await shot('meters','[data-instrument="loudness"]');await shot('timeline-actions','.timeline-actions')
 await c.click('.edit-layout');await shot('editing');await shot('layout-toolbar','.workspace-toolbar');await c.click('.edit-layout')
 await select('spectral');await shot('spectrum-field','.workspace')
 await select('time-frequency');await delay(600);await shot('spectrogram','.workspace')
 await select('recorder');await c.click('[aria-label="显示与帮助"]');await shot('support','.trace-modal')
 assert.equal((await c.state()).monitoringRequested,false)
 fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify({version:'0.1.0-preview.28',source:'Actual isolated application, generated demonstration signal; no personal recording',captures},null,2))
 console.log('MANUAL_SCREENSHOTS',output)
}main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close()})
