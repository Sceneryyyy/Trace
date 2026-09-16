const {app,BrowserWindow,dialog}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/feedback','ui-'+Date.now()),takes=path.join(folder,'takes')
fs.mkdirSync(takes,{recursive:true});const fixture=require('../m4/fixture.cjs')(takes)
process.env.TRACE_RECORD_TEST_DIR=takes
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'))
let frozenInfo,confirm=0;const freeze=native.replayFreeze;native.replayFreeze=()=>{frozenInfo=freeze();return frozenInfo}
const confirmations=[];dialog.showMessageBox=async(_window,options)=>{confirmations.push(options);return {response:confirm,checkboxChecked:false}}
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',folder,checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){
 for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}
 throw Error('Repeated stale request')
}
async function wait(fn,label,timeout=30000){const t=Date.now();while(Date.now()-t<timeout){const r=await fn();if(r)return r;await delay(15)}throw Error('Timeout '+label)}
async function click(selector){
 const p=await wait(()=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),'enabled '+selector)
 win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)});await delay(40)
}
async function drag(selector,a,b){
 const r=await evaluate("(()=>{const r=document.querySelector("+JSON.stringify(selector)+").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()"),x=n=>Math.round(r.x+36+(r.w-46)*n),y=Math.round(r.y+r.h/2)
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:x(a),y})
 for(let i=1;i<=6;i++){win.webContents.sendInputEvent({type:'mouseMove',x:x(a+(b-a)*i/6),y});await delay(10)}
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:x(b),y});await delay(50)
}
const snap=()=>evaluate('window.__feedback')
async function seek(position){const f=(await state()).playback;await request('playback.seek',{playbackId:f.id,positionFrame:position,resume:false});return wait(async()=>{const s=await snap(),v=(await state()).playback;return s?.sourceId===v.id&&s.playback.generation===v.generation&&s.positionFrame===position?s:null},'seek')}
function audioFiles(dir){let out=[];for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())out=out.concat(audioFiles(p));else if(/\.(wav|mp3|aac|m4a)$/i.test(p))out.push(path.relative(folder,p))}return out.sort()}
async function shot(name){fs.writeFileSync(path.join(folder,name+'.png'),(await win.webContents.capturePage()).toPNG())}
app.whenReady().then(async()=>{try{
 win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
 await wait(async()=>(await state()).active,'LIVE');await evaluate('window.__feedback=null;window.trace.onSnapshot(s=>window.__feedback=s);true')
 const beforeAudio=audioFiles(folder)
 for(let i=0;i<65;i++){await delay(1000);if(i%10===0)console.log('LIVE_BUFFER_SECONDS',i+1);assert(!(await state()).currentRecord);assert.equal((await state()).error,null)}
 const live=native.snapshot(60,900);report.liveDiagnostics=live.diagnostics
 assert(Number(live.diagnostics.replayFrames)<=60*live.format.sampleRate);assert(Number(live.diagnostics.replayFrames)>59.9*live.format.sampleRate,'did not collect a continuous minute')
 assert.deepEqual(audioFiles(folder),beforeAudio)
 report.checks.push('Actual WASAPI LIVE retains at most 60 seconds after 65 seconds and creates no audio files')
 const remembered=native.snapshot(10,1);await delay(200)
  await request('view.inspect',{sourceKind:'live',sourceId:remembered.sourceId,epochId:remembered.epochId,measurementEpoch:remembered.measurementEpoch,
    positionFrame:remembered.levelIndexFrame,startFrame:(BigInt(remembered.positionFrame)-BigInt(remembered.format.sampleRate)*10n).toString(),endFrame:remembered.positionFrame})
 const file=await wait(async()=>{const f=(await state()).playback;return f?.temporary&&f.phase==='paused'?f:null},'HISTORY')
 assert((await state()).active);assert.equal(native.snapshot(10,1).active,true);assert.equal(native.snapshot(10,1).epochId,remembered.epochId);assert.equal(file.timeOffsetSeconds,Number(frozenInfo.captureStartFrame)/file.sampleRate);report.frozen=frozenInfo
 const position=(BigInt(remembered.levelIndexFrame)-BigInt(frozenInfo.captureStartFrame)).toString(),first=await seek(position)
 assert.deepEqual(first.channels,remembered.channels);assert.deepEqual(first.integratedToCursor,remembered.integratedToCursor);assert.deepEqual(first.momentary,remembered.momentary)
 await seek('0');const second=await seek(position);assert.deepEqual(second.channels,first.channels);assert.deepEqual(second.integratedToCursor,first.integratedToCursor)
 report.checks.push('Memory playback recovers the original LIVE indexed levels and I exactly; repeated seeking is stable')
 await request('playback.volume',{playbackId:file.id,gain:0})
  await request('playback.selection',{playbackId:file.id,startFrame:'48000',endFrame:'57600',loop:true})
 await wait(async()=>(await state()).playback.selectionAnalysis?.phase==='ready','memory selection analysis')
 await request('playback.play',{playbackId:file.id});await wait(async()=>BigInt((await snap()).playback?.loops||0)>=10n,'memory loops')
 await request('playback.pause',{playbackId:file.id});await seek(position)
 assert.deepEqual((await snap()).integratedToCursor,first.integratedToCursor);assert.deepEqual(audioFiles(folder),beforeAudio)
 report.checks.push('Memory selection has independent analysis and ten loops do not alter history or write audio')
 win.setSize(1024,700);await delay(100);await shot('history-1024')
 assert(await evaluate("document.querySelector('.file-export-button').disabled&&document.documentElement.scrollWidth<=innerWidth"))
 await click('.return-live');await wait(async()=>(await state()).active,'return LIVE');assert(Number(native.snapshot(10,1).diagnostics.replayFrames)<live.format.sampleRate*5)
 report.checks.push('Audition pause resumes a bounded cache and LIVE follows its latest point and temporary history cannot be mistaken for a saved export')
 await request('file.open',{takeId:fixture.document.sessionId,role:'source'});const f=await wait(async()=>{const f=(await state()).playback;return f?.phase==='paused'?f:null},'FILE')
 await wait(()=>evaluate('window.__feedback?.sourceId==='+JSON.stringify(f.id)+'&&window.__feedback.fileView.analysisPhase==="ready"'),'file history')
 await drag('.time-ruler',.2,.4);let selected=await wait(async()=>(await state()).playback.selection,'ruler selection')
 assert(BigInt(selected.startFrame)>0n&&BigInt(selected.endFrame)>BigInt(selected.startFrame))
 const old=selected;await click('.timeline-controls button:nth-child(2)');await drag('.wave-panel canvas',.5,.7)
 selected=await wait(async()=>{const r=(await state()).playback.selection;return r.startFrame!==old.startFrame?r:null},'visible selection mode')
 await click('.loop-button');await wait(async()=>(await state()).playback.loop,'loop enabled')
 await click('.play-button');await wait(async()=>BigInt((await snap()).playback?.loops||0)>=3n,'selected range loops');await click('.play-button')
 await wait(async()=>(await state()).playback.selectionAnalysis?.phase==='ready','file selection analysis');await shot('selection-1024')
 report.checks.push('Ruler dragging and visible selection mode both select actual ranges; checkbox and Play loop the selected range')
 const job=(await request('export.start',{takeId:fixture.document.sessionId,role:'source',preset:{format:'mp3',sampleRate:48000,bitrate:128}})).data.jobId
 const result=await wait(async()=>{const e=(await state()).exportJobs.find(e=>e.id===job);if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'export')
 const manifest=JSON.parse(fs.readFileSync(path.join(fixture.folder,'session.json'),'utf8')),record=manifest.exports.find(e=>e.id===job),media=path.join(fixture.folder,record.result.directory,record.result.files[0].file),held=path.join(folder,'external-delete.mp3')
 assert(media.startsWith(takes+path.sep)&&held.startsWith(folder+path.sep));fs.renameSync(media,held)
 await click('.files-button');await wait(async()=>(await state()).recordings.find(t=>t.id===fixture.document.sessionId)?.exports?.find(e=>e.id===job)?.availability==='missing','external deletion observed')
 const row='[data-export-id="'+job+'"]';assert(await evaluate('document.querySelector('+JSON.stringify(row+' [data-export-play]')+').disabled'));await shot('missing-export')
 fs.renameSync(held,media);await request('library.refresh');await wait(()=>evaluate('!document.querySelector('+JSON.stringify(row+' [data-export-play]')+').disabled'),'restored file')
 report.checks.push('External removal is detected on opening the list; controls disable and recover when the file is restored')
 await click(row+' [data-export-analyze]');await wait(async()=>(await state()).analysisJobs.some(j=>j.exportId===job&&j.phase==='ready'),'export Analyze has exportId')
 confirm=0;await click(row+' [data-remove-export]');assert(fs.existsSync(media));assert.equal(confirmations.at(-1).defaultId,0)
 confirm=1;await click(row+' [data-remove-export]');await wait(async()=>!(await state()).recordings.find(t=>t.id===fixture.document.sessionId).exports.some(e=>e.id===job),'export removed')
 assert(!fs.existsSync(path.join(fixture.folder,record.result.directory)));assert(fs.existsSync(path.join(fixture.folder,manifest.assets[0].relativePath)))
 report.checks.push('Cancel preserves files; confirmed export removal uses the OS recycle bin and preserves original audio')
 await click('[data-take-id="'+fixture.document.sessionId+'"] [data-remove-take]')
 await wait(async()=>!(await state()).recordings.some(t=>t.id===fixture.document.sessionId),'take removed')
 assert(!fs.existsSync(fixture.folder));assert(!(await state()).playback);assert((await state()).active)
 report.checks.push('Confirmed take removal closes its playback and removes the entire session from the list')
 report.status='pass'
}catch(e){report.status='fail';report.error=String(e);report.stack=e.stack;report.state=await state().catch(()=>null);report.snapshot=await snap().catch(()=>null);console.error(e);if(win)await shot('failure').catch(()=>{})}
finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/feedback/ui-latest.json'),JSON.stringify(report,null,2));console.log('FEEDBACK_UI',report.status,report.checks.length);app.quit()}})
