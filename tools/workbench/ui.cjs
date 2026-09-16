
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/workbench','ui-'+Date.now()),takes=path.join(folder,'takes');
fs.mkdirSync(takes,{recursive:true});const fixture=require('../m4/fixture.cjs')(takes);
process.env.TRACE_TEST_ROOT=folder;process.env.TRACE_RECORD_TEST_DIR=takes;
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'));
let opens=0;const open=native.playbackReplayOpen;native.playbackReplayOpen=(...args)=>{opens++;return open(...args)};
require(path.join(root,'out-trace/main/index.js'));
const report={status:'running',folder,checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));let win;
const evaluate=code=>win.webContents.executeJavaScript(code);
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function raw(command,payload={}){for(let i=0;i<10;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.error?.code!=='STALE_REQUEST')return r}throw Error('Stale')}
async function request(command,payload={}){const r=await raw(command,payload);assert(r.ok,JSON.stringify(r.error));return r}
async function wait(fn,label,timeout=25000){const t=Date.now();while(Date.now()-t<timeout){const r=await fn();if(r)return r;await delay(20)}throw Error('Timeout '+label)}
async function click(selector){const p=await wait(()=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),selector);win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)});await delay(60)}
async function drag(a,b,selector='.wave-panel canvas'){const box=await evaluate("(()=>{const r=document.querySelector("+JSON.stringify(selector)+").getBoundingClientRect();return {x:r.x+36,w:r.width-46,y:r.y+r.height/2}})()");const at=t=>({x:Math.round(box.x+box.w*t),y:Math.round(box.y)});win.show();win.focus();win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...at(a)});await delay(90);for(let i=1;i<=8;i++){win.webContents.sendInputEvent({type:'mouseMove',button:'left',...at(a+(b-a)*i/8)});await delay(45)}win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...at(b)});await delay(150)}
const snapshot=()=>evaluate('window.__wb');
const numbers=s=>JSON.stringify([s.positionFrame,s.channels,s.momentary,s.shortTerm,s.integratedToCursor,s.loudnessRange,s.maxTruePeak]);
async function shot(name){fs.writeFileSync(path.join(folder,name+'.png'),(await win.webContents.capturePage()).toPNG())}
async function fits(){const boxes=await evaluate("Array.from(document.querySelectorAll('.sourcebar label,.sourcebar button,.transport button,.elapsed')).map(e=>{const r=e.getBoundingClientRect();return {text:e.innerText,x:r.x,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})");for(const r of boxes)assert(r.x>=0&&r.right<=r.width+1&&r.bottom<=r.height+1,'Clipped '+JSON.stringify(r));}
async function geometry(){return evaluate("JSON.stringify(['.source-select','.return-live','.record-button','.play-button','.wave-panel'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,r.x,r.y,r.width,r.height]}))")}
app.whenReady().then(async()=>{try{
 win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r));
 await wait(async()=>(await state()).active,'capture');await evaluate('window.trace.onSnapshot(s=>window.__wb=s);true');
 await wait(()=>BigInt(native.snapshot(5,1).positionFrame)>BigInt(native.snapshot(5,1).format.sampleRate)*4n,'initial history');
 win.setSize(1024,700);await delay(200);await fits();const layout=await geometry(),epoch=native.snapshot(5,1).epochId;
 assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".timeline-actions button"),b=>b.getAttribute("aria-label"))'),['波形复位','跟随游标','循环']);
 assert.equal(await evaluate('document.querySelectorAll(".file-sourcebar input,.file-navigation,.selection-fields").length'),0);
 assert(await evaluate('document.querySelector(".loop-button").disabled'));
 assert(await evaluate('Array.from(document.querySelectorAll(".timeline-actions button")).every(b=>b.textContent.trim()===""&&b.querySelector("svg")&&b.title.startsWith(b.getAttribute("aria-label")))'));
 assert.equal(await evaluate('document.querySelectorAll(".sourcebar .zoom-control").length'),0);
 assert.equal(await evaluate('document.querySelectorAll(".timeline-controls .zoom-control").length'),2);
 assert(await evaluate('(()=>{const a=document.querySelector(".timeline-modes").getBoundingClientRect(),b=document.querySelector(".timeline-zoom-controls").getBoundingClientRect(),c=document.querySelector(".timeline-controls").getBoundingClientRect();return a.right<=b.left&&b.right<=c.right+1&&b.top>=c.top&&b.bottom<=c.bottom+1})()'));
 assert.equal(await evaluate('document.querySelector(".return-live").textContent'),'实时');
 assert(await evaluate('document.querySelector(".return-live").closest(".transport")&&document.querySelector(".return-live").nextElementSibling.matches(".monitor-button")'));
 assert.equal(await evaluate('document.querySelectorAll(".file-sourcebar .return-live").length'),0);
 assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".transport-buttons button"),b=>b.getAttribute("aria-label"))'),['起点','终点','播放','录音']);
 assert(await evaluate('Array.from(document.querySelectorAll(".transport-buttons button")).every(b=>b.textContent.trim()===""&&b.querySelector("svg")&&b.title)'));
 await shot('live');await drag(.7,.3);
 let f=await wait(async()=>(await state()).playback,'history');
 await wait(async()=>(await snapshot())?.sourceId===f.id,'history snapshot');
 assert.equal(opens,0);assert(native.snapshot(5,1).active);assert.equal(native.snapshot(5,1).epochId,epoch);
 const frozen=numbers(await snapshot()),before=BigInt(native.snapshot(5,1).positionFrame);await delay(700);
 assert(BigInt(native.snapshot(5,1).positionFrame)>before);assert.equal(numbers(await snapshot()),frozen);assert.equal(await geometry(),layout);await shot('history');await fits();
 report.checks.push('Mouse cursor inspects fixed historical metrics while the same capture epoch continues; no output device opens and layout stays fixed');
 await click('.return-live');assert(!(await state()).playback);assert.equal(native.snapshot(5,1).epochId,epoch);
 report.checks.push('LIVE resumes latest data without restarting a healthy capture');
 await request('view.window',{seconds:5});await click('.record-button');await wait(()=>native.recordStatus().phase==='recording','record');await delay(1700);
 const written=BigInt(native.recordStatus().writtenFrames);await drag(.6,.4);f=await wait(async()=>(await state()).playback,'record inspection');
 await wait(async()=>(await snapshot())?.sourceId===f.id,'record snapshot');const recFrozen=numbers(await snapshot());await delay(800);
 assert.equal(numbers(await snapshot()),recFrozen);assert(BigInt(native.recordStatus().writtenFrames)>written);assert((await state()).currentRecord);assert(native.snapshot(5,1).active);
 assert.equal((await raw('playback.play',{playbackId:f.id})).error.code,'RECORDING_ACTIVE');
 const recordingId=(await state()).currentRecord.id;await click('.file-end');
 await wait(async()=>(await snapshot())?.positionFrame===f.totalFrames,'record-history endpoint');
 assert.equal((await state()).currentRecord.id,recordingId);assert(native.snapshot(5,1).active);assert.equal((await state()).playback.outputReady,false);
 assert.equal(await evaluate('document.querySelector(".record-button").getAttribute("aria-label")'),'结束录音');
 await fits();await shot('record-history');
 await delay(2600);await click('.return-live');await wait(async()=>!(await state()).playback,'REC follow');
 await wait(()=>evaluate('parseFloat(document.querySelector(".time-ruler span").textContent)>0'),'REC five-second window follows');
 const left=await evaluate('parseFloat(document.querySelector(".time-ruler span").textContent)');await delay(400);assert((await evaluate('parseFloat(document.querySelector(".time-ruler span").textContent)'))>left);
 await drag(.8,.5);await wait(async()=>(await state()).playback,'REC reinspection');
 const recordId=(await state()).currentRecord.id;await click('.record-button');
 const saved=await wait(async()=>(await state()).recordings.find(t=>t.id===recordId&&t.status==='ready'),'saved');
 assert.equal(saved.frames,native.recordStatus().writtenFrames);assert.equal(native.recordStatus().error,null);
 report.checks.push('Inspecting a running take keeps its writer progressing; audible playback remains blocked; stop finalizes the exact written frames');
 await click('.return-live');const panEpoch=native.snapshot(5,1).epochId;await drag(.8,.55);
 await wait(async()=>(await state()).playback?.temporary,'drag inspects history');assert.equal(native.snapshot(5,1).epochId,panEpoch);assert(native.snapshot(5,1).active);
 report.checks.push('REC LIVE follows an advancing five-second window; timeline dragging disengages LIVE without restarting capture');
 await click('.return-live');await drag(.4,.7,'.time-ruler');f=await wait(async()=>{const f=(await state()).playback;return f?.selection?f:null},'selection');
 assert.equal(opens,0);assert(native.snapshot(5,1).active);
 await click('.loop-button');assert((await state()).playback.loop);assert.equal(await evaluate('document.querySelector(".loop-button").getAttribute("aria-pressed")'),'true');
 await click('.loop-button');assert.equal((await state()).playback.loop,false);await click('.loop-button');await request('playback.volume',{playbackId:f.id,gain:0});
 await click('.play-button');await wait(()=>native.playbackSnapshot().playing,'audition');assert.equal(native.snapshot(5,1).active,false);assert.equal(opens,1);
 await delay(350);await drag(.6,.5);await wait(async()=>(await state()).playback?.outputReady===false,'scrub stops output');assert(native.snapshot(5,1).active);
 const held=numbers(await snapshot());await delay(350);assert.equal(numbers(await snapshot()),held);
 report.checks.push('Range selection is silent; explicit Play pauses capture; scrubbing closes audio output and leaves a stable cursor with monitoring resumed');
 await request('playback.play',{playbackId:f.id});await wait(()=>native.playbackSnapshot().playing,'fault audition');
 const readReplay=native.replayView;native.replayView=()=>{throw Error('INJECTED_HISTORY_READ_FAILURE')};
 await wait(async()=>{const s=await state();return s.playback?.phase==='failed'&&!s.playback.outputReady&&s.active},'history failure releases output');native.replayView=readReplay;
 assert.equal(native.playbackSnapshot().playing,false);assert(await evaluate('document.querySelector(".integrated-card .metric-number").textContent==="—"'));
 report.checks.push('Injected current-history failure stops output, restores capture and marks unavailable readings instead of displaying stale valid metrics');
 await request('file.open',{takeId:fixture.document.sessionId,role:'source'});f=(await state()).playback;
 await wait(async()=>{const s=await snapshot();return s?.sourceId===f.id&&s.fileView.analysisPhase==='ready'},'file analysis');assert(native.snapshot(5,1).active);assert.equal(f.outputReady,false);
 await request('playback.window',{playbackId:f.id,startFrame:'0',endFrame:'240000',pixelWidth:900});await click('.full-length-button');assert.equal((await state()).playback.endFrame,f.totalFrames);
 await click('.follow-button');assert((await state()).playback.follow);await click('.follow-button');assert.equal((await state()).playback.follow,false);
 report.checks.push('Three named SVG action buttons have hover descriptions, zoom sliders sit above the waveform, and Reset/Follow/Loop work');
 await request('playback.seek',{playbackId:f.id,positionFrame:'96000',resume:false});await wait(async()=>(await snapshot())?.positionFrame==='96000','file position');await wait(()=>evaluate('document.querySelector(".integrated-card .metric-number").textContent!=="—"'),'file metrics painted');await fits();await shot('file');
 const fileMetrics=numbers(await snapshot());const nativeOpen=native.playbackOpen;native.playbackOpen=async()=>{throw Error('INJECTED_OUTPUT_UNAVAILABLE')};
 assert.equal((await raw('playback.play',{playbackId:f.id})).ok,false);native.playbackOpen=nativeOpen;
 await delay(120);assert.equal(numbers(await snapshot()),fileMetrics);assert(native.snapshot(5,1).active);
 report.checks.push('File opens into the same workbench without stopping capture; an output-device failure preserves its readable history');
 await request('playback.volume',{playbackId:f.id,gain:0});await request('playback.seek',{playbackId:f.id,positionFrame:String(Number(f.totalFrames)-48000),resume:false});await request('playback.play',{playbackId:f.id});
 await wait(async()=>!(await state()).playback.outputReady&&(await state()).active,'EOF resumes capture');
 assert((await state()).playback);report.checks.push('EOF closes output and resumes monitoring while retaining the historical view');
 report.status='pass';
}catch(e){report.status='fail';report.error=String(e);report.stack=e.stack;report.state=await state().catch(()=>null);report.snapshot=await snapshot().catch(()=>null);console.error(e);if(win)await shot('failure').catch(()=>{})}
finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/workbench/ui-latest.json'),JSON.stringify(report,null,2));console.log('WORKBENCH_UI',report.status,report.checks.length);if(win)win.close();else app.quit()}
});
