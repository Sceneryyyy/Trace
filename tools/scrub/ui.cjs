
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/scrub','ui-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true});
const fixture=require('../m4/fixture.cjs')(takes);process.env.TRACE_TEST_ROOT=folder;process.env.TRACE_RECORD_TEST_DIR=takes;
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'));
require(path.join(root,'out-trace/main/index.js'));
const report={status:'running',folder,checks:[],cases:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));let win;
const evaluate=code=>win.webContents.executeJavaScript(code);
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){for(let i=0;i<10;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:require('crypto').randomUUID(),expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}throw Error('stale')}
async function wait(fn,label,timeout=25000){const begin=Date.now();while(Date.now()-begin<timeout){const r=await fn();if(r)return r;await delay(10)}throw Error('Timeout '+label)}
async function seek(frame){const f=(await state()).playback;await request('playback.seek',{playbackId:f.id,positionFrame:String(frame),resume:false});return wait(async()=>{const s=await evaluate('window.__scrubSnapshot'),f=(await state()).playback;return s?.sourceId===f.id&&s.playback.generation===f.generation&&s.positionFrame===String(frame)?s:null},'seek')}
async function dragCase(name,first,last,total){
 await seek(first);await wait(()=>evaluate('document.querySelector(".integrated-card .metric-number").textContent!=="—"'),'ready reading');
 const box=await evaluate('(()=>{const r=document.querySelector(".wave-panel canvas").getBoundingClientRect();return {left:r.left+36,width:r.width-46,y:Math.round(r.top+r.height*.55)}})()');
 const point=f=>({x:Math.round(box.left+box.width*f/total),y:box.y});
 win.show();win.focus();
 await evaluate('window.__scrubSamples=[];window.__scrubTracing=true;(()=>{function frame(){if(!window.__scrubTracing)return;const w=document.querySelector(".workspace");window.__scrubSamples.push({at:performance.now(),i:document.querySelector(".integrated-card .metric-number").textContent,m:document.querySelector(".instant-metrics .metric-number").textContent,bars:Array.from(document.querySelectorAll(".peak-fill"),e=>e.style.clipPath),disabled:document.querySelector(".full-length-button").disabled,position:w.dataset.historyPosition,generation:w.dataset.historyGeneration});requestAnimationFrame(frame)}requestAnimationFrame(frame)})();true');
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point(first)});
 const times=180;
 for(let i=1;i<=times;i++){const t=i/times,f=first+(last-first)*t;win.webContents.sendInputEvent({type:'mouseMove',button:'left',...point(f)});await delay(8)}
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point(last)});
 await delay(180);await evaluate('window.__scrubTracing=false');
 const samples=await evaluate('window.__scrubSamples'),blank=samples.filter(s=>s.i==='—'||s.m==='—'),zero=samples.filter(s=>s.bars.every(b=>b.startsWith('inset(100% ')));
 const unique=new Set(samples.filter(s=>s.position).map(s=>s.position)),readings=new Set(samples.map(s=>s.i+'|'+s.m));
 const result={name,frames:samples.length,blankFrames:blank.length,emptyMeterFrames:zero.length,disabledFrames:samples.filter(s=>s.disabled).length,distinctPresentedPositions:unique.size,distinctReadings:readings.size};report.cases.push(result);fs.writeFileSync(path.join(folder,name+'.json'),JSON.stringify(samples,null,2));
 if(process.env.TRACE_SCRUB_BASELINE){console.log('SCRUB_BASELINE',JSON.stringify(result));return}
 assert(samples.length>45,'did not sample enough rendered frames');assert.equal(blank.length,0,'valid readings blinked blank');assert.equal(zero.length,0,'non-silent meters collapsed while dragging');assert.equal(result.disabledFrames,0,'continuous seek toggled global busy');assert(unique.size>(name.includes('delayed')?8:15),'held one position throughout drag');assert(readings.size>3,'readings did not update during drag');
 const final=await wait(async()=>{const s=await evaluate('window.__scrubSnapshot'),f=(await state()).playback;return s?.sourceId===f.id&&s.playback.generation===f.generation&&s.positionFrame===f.positionFrame?s:null},'final cursor settled');
 assert(Math.abs(Number(final.positionFrame)-last)<=Math.ceil(total/box.width),'release did not reach final pointer');
 const reference=final.fileView.temporary?native.replayView(final.positionFrame,final.fileView.startFrame,final.fileView.endFrame,0).metrics:(await request('metrics.query',{analysisId:final.fileView.analysisId,positionFrame:final.positionFrame,requestGeneration:1})).data.metrics;
 assert.deepEqual(final.channels,reference.channels);assert.deepEqual(final.integratedToCursor,reference.integratedToCursor);
 const format=m=>m.status==='ready'?m.value.toFixed(1).replace('-','−'):m.status==='silence'?'−∞':'—';
 const observed=[...new Map(samples.filter(s=>s.position).map(s=>[s.position,s])).values()].filter((_s,i)=>i%9===0);
 for(const row of observed){
  const values=final.fileView.temporary?native.replayView(row.position,'0',String(total),0).metrics:(await request('metrics.query',{analysisId:final.fileView.analysisId,positionFrame:row.position,requestGeneration:2})).data.metrics;
  assert.equal(row.i,format(values.integratedToCursor),'I was not from its displayed cursor');assert.equal(row.m,format(values.momentary),'M was not from its displayed cursor');
 }
 result.verifiedPositions=observed.length;
 await delay(100);assert.equal((await state()).playback.positionFrame,final.positionFrame);
 report.checks.push(name+': no blank/empty frames, continuous real positions, exact final cached values');
}
app.whenReady().then(async()=>{try{
 win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r));await wait(async()=>(await state()).active,'capture');await evaluate('window.trace.onSnapshot(s=>window.__scrubSnapshot=s);true');
 await request('file.open',{takeId:fixture.document.sessionId,role:'source'});let f=(await state()).playback;await wait(()=>evaluate('window.__scrubSnapshot?.sourceId==='+JSON.stringify(f.id)+'&&window.__scrubSnapshot.fileView.analysisPhase==="ready"'),'file ready');
 await dragCase('file-forward',170000,340000,Number(f.totalFrames));await dragCase('file-backward',340000,170000,Number(f.totalFrames));
 if(!process.env.TRACE_SCRUB_BASELINE){
  const chunk=fs.readdirSync(path.join(root,'out-trace/main/chunks')).find(n=>n.startsWith('analysisCache-')&&n.endsWith('.js'));
  const {AnalysisCache}=require(path.join(root,'out-trace/main/chunks',chunk)),read=AnalysisCache.prototype.metrics;
  AnalysisCache.prototype.metrics=async function(...args){await delay(45);return read.apply(this,args)};
  await dragCase('file-delayed',170000,340000,Number(f.totalFrames));
  AnalysisCache.prototype.metrics=read;
  await request('view.live');const files=fixture.document.assets.map(a=>path.join(fixture.folder,a.relativePath));await native.playbackOpen('scrub-signal',files,(await state()).deviceId,true);native.playbackVolume(.1);native.playbackPlay();await delay(6500);native.playbackPause();
  const live=native.snapshot(60,1);assert.equal(live.error,null);assert.equal(live.momentary.status,'ready');
  await request('live.replay');f=(await state()).playback;await wait(()=>evaluate('window.__scrubSnapshot?.sourceId==='+JSON.stringify(f.id)),'memory ready');
  const total=Number(f.totalFrames),rate=f.sampleRate;await request('playback.window',{playbackId:f.id,startFrame:'0',endFrame:f.totalFrames,pixelWidth:900});
  await dragCase('memory-forward',total-rate*3,total-rate*.4,total);assert(native.snapshot(5,1).active);assert.equal(native.snapshot(5,1).epochId,live.epochId);
  report.checks.push('Memory inspection leaves background capture on the same epoch');
 }
 report.status=process.env.TRACE_SCRUB_BASELINE?'baseline':'pass';
}catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}
finally{if(win)fs.writeFileSync(path.join(folder,'final.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/scrub',process.env.TRACE_SCRUB_BASELINE?'baseline-latest.json':'ui-latest.json'),JSON.stringify(report,null,2));console.log('SCRUB_UI',report.status,JSON.stringify(report.cases));if(win)win.close();else app.quit()}
});
