const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m4','ui-'+Date.now()),takes=path.join(folder,'takes')
fs.mkdirSync(takes,{recursive:true});const fixture=require('./fixture.cjs')(takes)
process.env.TRACE_RECORD_TEST_DIR=takes
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'))
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',folder,kind:'synthetic-files-in-real-Electron-and-WASAPI-output',checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<8;i++){
  const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')')
  if(r.ok)return r
  if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))
 }throw Error('Repeated stale request')
}
async function wait(fn,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const v=await fn();if(v)return v;await delay(5)}throw Error('Timeout '+label)}
async function click(selector){
 const p=await wait(()=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),'enabled '+selector)
 win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)})
 await delay(30)
}
const snap=()=>evaluate('window.__file')
const check=(v,label)=>{assert(v,label);report.checks.push(label)}
async function seek(position,resume=false){
 const file=(await state()).playback
 await request('playback.seek',{playbackId:file.id,positionFrame:position,resume})
 return wait(async()=>{const f=(await state()).playback,s=await snap();return s?.sourceKind==='file'&&s.playback.generation===f.generation&&s.positionFrame===position&&!s.playback.playing?s:null},'file seek '+position)
}
async function pointer(selector,from,to,modifiers=[]){
 const rect=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()')
 const x=p=>Math.round(rect.x+36+(rect.width-46)*p),y=Math.round(rect.y+rect.height/2)
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:x(from),y,modifiers})
 for(let i=1;i<=5;i++){win.webContents.sendInputEvent({type:'mouseMove',x:x(from+(to-from)*i/5),y,modifiers});await delay(8)}
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:x(to),y,modifiers});await delay(40)
}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'LIVE initialization')
  const devices=(await request('devices.list')).data,device=devices.find(d=>d.supported&&/Realtek/i.test(d.label))
  if(device)await request('live.start',{deviceId:device.id})
  const liveEpoch=native.snapshot(10,1).epochId
  await evaluate("window.__file=null;window.trace.onSnapshot(s=>window.__file=s);true")
  await click('.files-button');await click('[data-take-id="'+fixture.document.sessionId+'"] [data-file-open="source"]')
  await wait(async()=>{const s=await snap();return s?.sourceKind==='file'&&s.fileView?.analysisPhase==='ready'&&s.waveform.length},'file history')
  const file=(await state()).playback
  check(file&&(await state()).active&&native.snapshot(10,1).active&&!file.outputReady,'Opening a file keeps LIVE capture active and does not open audio output')
  const position='153600',first=await seek(position),reference=(await request('metrics.query',{analysisId:file.analysisId,positionFrame:position,requestGeneration:1})).data.metrics
  assert.deepEqual(first.integratedToCursor,reference.integratedToCursor);assert.deepEqual(first.channels,reference.channels)
  check(true,'Paused FILE meters use the selected asset historical cache')
  for(let i=0;i<100;i++){
   const frame=String((i*3571)%384000),s=await seek(frame),expected=(await request('metrics.query',{analysisId:file.analysisId,positionFrame:frame,requestGeneration:i+2})).data.metrics
   assert.deepEqual(s.integratedToCursor,expected.integratedToCursor);assert.deepEqual(s.channels,expected.channels)
  }
  check(true,'100 exact file positions recover their own cached I and levels')
  await seek(position);await pointer('canvas[aria-label="文件波形定位"]',.3,.6)
  await wait(async()=>{const s=await snap(),f=(await state()).playback;return s.playback?.generation===f.generation&&!s.playback.playing&&BigInt(s.positionFrame)>200000n},'wave drag stays paused')
  await pointer('canvas[aria-label="文件响度历史定位"]',.2,.2)
  await wait(async()=>{const s=await snap(),f=(await state()).playback;return s.playback?.generation===f.generation&&BigInt(s.positionFrame)<100000n},'loudness click')
  check(true,'Both canvases control one cursor; paused dragging stays paused')
  await seek('48000');await click('.play-button')
  await wait(async()=>(await snap()).playback?.playing,'playing')
  const offsets=[];const begin=Date.now()
  while(Date.now()-begin<900){
   const shown=await snap(),now=native.playbackSnapshot()
   if(shown?.diagnostics?.nativeGeneration===now.generation&&now.playing)offsets.push(Number(BigInt(now.positionFrame)-BigInt(shown.positionFrame))/48000*1000)
   await delay(5)
  }
  offsets.sort((a,b)=>a-b);const p95=offsets[Math.floor((offsets.length-1)*.95)]
  check(offsets.length>20&&p95<=50,'Renderer snapshot lag against the device presentation clock is p95 <= 50 ms')
  report.clockLag={samples:offsets.length,p95Ms:p95,maxMs:offsets.at(-1)}
  await pointer('canvas[aria-label="文件波形定位"]',.35,.55)
  await wait(async()=>!(await state()).playback.outputReady&&!(await snap()).playback?.playing,'drag stays silent after release')
   check(native.snapshot(10,1).active,'Scrubbing closes output and restores capture')
  const frozen=await snap();await delay(120);assert.deepEqual((await snap()).channels,frozen.channels)
  check(true,'Playing drag stays paused on release; historical meters remain frozen')
  await pointer('canvas[aria-label="文件波形定位"]',.25,.30,['shift'])
  await wait(async()=>Boolean((await state()).playback?.selection),'shift selection')
  await request('playback.selection',{playbackId:file.id,startFrame:'96000',endFrame:'100800',loop:true})
  await request('playback.play',{playbackId:file.id})
  await wait(async()=>BigInt((await snap()).playback?.loops||'0')>=10n,'ten loops')
  await request('playback.pause',{playbackId:file.id});await seek(position)
  const after=await snap();assert.deepEqual(after.integratedToCursor,first.integratedToCursor)
  check(true,'Ten selection loops do not accumulate the file historical I')
  await request('playback.volume',{playbackId:file.id,gain:0});await delay(50);assert.deepEqual((await snap()).channels,after.channels)
  check(true,'Monitor volume leaves file measurements unchanged')
  await request('playback.selection',{playbackId:file.id,startFrame:'0',endFrame:'96000',loop:false})
  const quiet=await wait(async()=>{const s=(await state()).playback.selectionAnalysis;return s?.phase==='ready'?s:null},'quiet selection analysis')
  await request('playback.selection',{playbackId:file.id,startFrame:'144000',endFrame:'240000',loop:false})
  const loud=await wait(async()=>{const s=(await state()).playback.selectionAnalysis;return s?.phase==='ready'&&s.id!==quiet.id?s:null},'loud selection analysis')
  check(Math.abs(loud.summary.channels[0].rms.value-quiet.summary.channels[0].rms.value-20*Math.log10(2))<.00001,'Independent equal-length selections preserve the analytical 6.0206 dB RMS difference')
  const quietOriginal=fs.readFileSync(path.join(fixture.folder,fixture.document.assets[0].relativePath))
  const quietCopy=Buffer.from(quietOriginal.subarray(0,58+96000*8));quietCopy.writeUInt32LE(quietCopy.length-8,4);quietCopy.writeUInt32LE(96000,46);quietCopy.writeUInt32LE(96000*8,54)
  const quietPath=path.join(folder,'quiet-cut.wav');fs.writeFileSync(quietPath,quietCopy)
  const loudPath=path.join(fixture.folder,fixture.document.assets[1].relativePath)
  const quietReference=native.analyzeWaves([quietPath],path.join(folder,'quiet-reference'),2048,()=>{}).summary
  const loudReference=native.analyzeWaves([loudPath],path.join(folder,'loud-reference'),2048,()=>{}).summary
  assert.deepEqual(quiet.summary,quietReference);assert.deepEqual(loud.summary,loudReference)
  check(true,'Selection I/LRA/TP exactly match independently cut whole-file analyses')
  const wholeJob=(await state()).analysisJobs.find(job=>job.id===file.analysisId)
  check(loud.cacheKey!==quiet.cacheKey&&loud.cacheKey!==wholeJob.cacheKey&&loud.totalFrames==='96000','Selection caches bind their own boundaries and local frame count')
  report.selectionReference={quietI:quiet.summary.integratedToCursor.value,loudI:loud.summary.integratedToCursor.value,rmsDifference:loud.summary.channels[0].rms.value-quiet.summary.channels[0].rms.value}

  await wait(()=>evaluate("document.querySelector('[aria-label=\"选区独立统计\"]')?.innerText.includes('MAX TP')"),'selection statistics UI')
  check(true,'Selection I/LRA/TP are displayed separately from file history')
  await evaluate("(()=>{const e=document.querySelector('input[aria-label=波形时间窗]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'5.5');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()");await wait(async()=>BigInt((await state()).playback.endFrame)-BigInt((await state()).playback.startFrame)<384000n,'shared zoom')
  await wait(async()=>{const f=(await state()).playback,s=await snap();return s.fileView.startFrame===f.startFrame&&s.fileView.endFrame===f.endFrame},'rendered zoom window');await delay(25)
  fs.writeFileSync(path.join(folder,'file-playback.png'),(await win.webContents.capturePage()).toPNG())
  await evaluate('document.activeElement?.blur()')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'})
  await wait(async()=>(await snap()).playback?.playing,'Space play')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'})
  await wait(async()=>!(await snap()).playback?.playing,'Space pause')
  await evaluate('document.querySelector(\'input[aria-label="波形显示倍率"]\').focus()')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'})
  await delay(60);check(!native.playbackSnapshot().playing,'Transport shortcuts do not fire inside display slider inputs')
  await evaluate('document.activeElement?.blur()')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'})
  await wait(async()=>(await snap()).positionFrame==='0','Home seek')
  check(true,'Space and Home control FILE transport')
  await request('playback.volume',{playbackId:file.id,gain:0});await click('.play-button');await wait(async()=>(await snap()).playback?.playing,'play before End');
   await click('.file-end');
   const endpoint=await wait(async()=>{const s=await snap(),f=(await state()).playback;return s?.positionFrame===file.totalFrames&&s.playback.generation===f.generation&&!f.outputReady?s:null},'End button seeks to EOF silently');
   const eof=(await request('metrics.query',{analysisId:file.analysisId,positionFrame:file.totalFrames,requestGeneration:999})).data.metrics;
   assert.deepEqual(endpoint.integratedToCursor,eof.integratedToCursor);assert.deepEqual(endpoint.channels,eof.channels);
   assert(native.snapshot(10,1).active);assert.equal((await state()).playback.loop,false);
   await click('.file-home');await wait(async()=>(await snap()).positionFrame==='0','start icon');
   await evaluate('document.activeElement?.blur()');for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'End'});
   await wait(async()=>(await snap()).positionFrame===file.totalFrames,'End keyboard');
   await evaluate('document.querySelector("input[aria-label=波形显示倍率]").focus()');
   for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Home'});
   await delay(80);assert.equal((await state()).playback.positionFrame,file.totalFrames);
   await evaluate('document.activeElement?.blur()');await click('.file-home');await wait(async()=>(await snap()).positionFrame==='0','restore start');
   check(true,'Start/End transport icons and End key reach exact boundaries without audio; input editing does not seek');
   const beforeWheel=(await state()).playback,canvas=await evaluate("(()=>{const r=document.querySelector('canvas[aria-label=\"文件波形定位\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
  win.webContents.sendInputEvent({type:'mouseWheel',modifiers:['control'],x:Math.round(canvas.x),y:Math.round(canvas.y),deltaY:-120,canScroll:true})
  await wait(async()=>{const f=(await state()).playback;return BigInt(f.endFrame)-BigInt(f.startFrame)>BigInt(beforeWheel.endFrame)-BigInt(beforeWheel.startFrame)},'wheel zoom out')
  const expanded=(await state()).playback
  win.webContents.sendInputEvent({type:'mouseWheel',modifiers:['control'],x:Math.round(canvas.x),y:Math.round(canvas.y),deltaY:120,canScroll:true})
  await wait(async()=>{const f=(await state()).playback;return BigInt(f.endFrame)-BigInt(f.startFrame)<BigInt(expanded.endFrame)-BigInt(expanded.startFrame)},'wheel zoom in')
  check(true,'Opposite native wheel directions zoom the shared file window in and out')
  await seek('153600');win.setSize(1024,700);await delay(100)
  check(await evaluate("document.documentElement.scrollWidth<=window.innerWidth&&document.querySelector('.timeline-actions').getBoundingClientRect().right<=window.innerWidth"),'FILE controls fit the minimum 1024 x 700 window')
  fs.writeFileSync(path.join(folder,'file-1024.png'),(await win.webContents.capturePage()).toPNG())
  win.setSize(1280,800);await delay(100)
  await click('.return-live');await wait(async()=>(await state()).active&&!(await state()).playback,'return LIVE')
  check(BigInt(native.snapshot(10,1).epochId)>BigInt(liveEpoch),'Returning LIVE starts a fresh capture epoch')
  check((await state()).recordings.length===1,'FILE playback creates no additional recording')
  for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
  check(true,'Source audio files remain unchanged')
  report.status='pass'
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;report.state=await state().catch(()=>null);report.snapshot=await snap().catch(()=>null);console.error(error);if(win){report.dom=await evaluate('document.body.innerText').catch(()=>null);fs.writeFileSync(path.join(folder,'failure.png'),(await win.webContents.capturePage()).toPNG())}}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m4/ui-latest.json'),JSON.stringify(report,null,2));console.log('M4_FILE_UI',report.status,report.checks.length);app.quit()}
})
