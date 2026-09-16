const {app,BrowserWindow,dialog}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),reopen=Boolean(process.env.TRACE_INTERACTION_REOPEN)
const folder=process.env.TRACE_INTERACTION_FOLDER||path.join(root,'artifacts/feedback3','ui-'+Date.now()),takes=path.join(folder,'takes'),userData=path.join(folder,'user-data')
fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData,{recursive:true})
let fixture
if(!reopen){fixture=require('../m4/fixture.cjs')(takes);fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,windowSeconds:30,displaySettings:{targetEnabled:true,targetLufs:-18,waveGain:16}}))}
process.env.TRACE_TEST_ROOT=folder;process.env.TRACE_TEST_USER_DATA=userData;delete process.env.TRACE_RECORD_TEST_DIR
let choose=false;dialog.showOpenDialog=async()=>({canceled:!choose,filePaths:choose?[takes]:[]})
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'));let starts=0
const startNative=native.start;native.start=(...args)=>{starts++;return startNative(...args)}
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',folder,reopen,checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function raw(command,payload={}){
 for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.error?.code!=='STALE_REQUEST')return r}
 throw Error('Repeated stale request')
}
async function request(command,payload={}){const r=await raw(command,payload);if(!r.ok)throw Error(JSON.stringify(r.error));return r}
async function wait(fn,label,timeout=25000){const t=Date.now();while(Date.now()-t<timeout){const r=await fn();if(r)return r;await delay(15)}throw Error('Timeout '+label)}
async function click(selector){
 const p=await wait(()=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),'enabled '+selector)
 win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)});await delay(35)
}
async function key(code){win.webContents.sendInputEvent({type:'keyDown',keyCode:code});win.webContents.sendInputEvent({type:'keyUp',keyCode:code})}
async function wheel(delta,control=false,count=1){
 const p=await evaluate("(()=>{const r=document.querySelector('.wave-panel canvas').getBoundingClientRect();return {x:Math.round(r.x+r.width*.6),y:Math.round(r.y+r.height/2)}})()")
 for(let i=0;i<count;i++)win.webContents.sendInputEvent({type:'mouseWheel',...p,deltaY:delta,canScroll:true,modifiers:control?['control']:[]})
 await delay(count*18+70)
}
async function setRange(label,value){
 await evaluate("(()=>{const e=document.querySelector('[aria-label="+JSON.stringify(label)+"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(String(value))+");e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()")
}
const snap=()=>evaluate('window.__interaction')
async function shot(name){fs.writeFileSync(path.join(folder,name+'.png'),(await win.webContents.capturePage()).toPNG())}
async function fits(){
 const boxes=await evaluate("Array.from(document.querySelectorAll('.sourcebar label,.sourcebar button,.transport button,.elapsed')).map(e=>{const r=e.getBoundingClientRect();return {text:e.innerText,x:r.x,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})")
 for(const r of boxes)assert(r.x>=0&&r.right<=r.width+1&&r.bottom<=r.height+1,'Clipped '+JSON.stringify(r))
}
app.whenReady().then(async()=>{try{
 win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
 await wait(async()=>Boolean((await state()).deviceId),'initialized source')
 if(reopen){
  const s=await state();assert.equal(s.active,false);assert.equal(s.monitoringRequested,false);assert.equal(starts,0);assert.equal(s.windowSeconds,13.75);assert.equal(s.displaySettings.waveGain,1.83);assert.equal(native.snapshot(5,1).active,false)
  report.checks.push('Immediate normal close persists fractional display settings and the stopped monitoring preference');report.status='pass';return
 }
 await evaluate('window.__interaction=null;window.trace.onSnapshot(s=>window.__interaction=s);true')
 assert.equal((await state()).active,false);assert.equal(starts,0);assert.equal((await state()).displaySettings.waveGain,4);assert.equal((await state()).displaySettings.targetLufs,-18)
 native.snapshot(5.125,900);for(const value of [4.99,60.1,NaN])assert.throws(()=>native.snapshot(value,900))
 win.setSize(1024,700);await delay(100);await fits();await shot('stopped')
 await click('.record-button');await delay(80);assert(!(await state()).currentRecord);assert.equal(starts,0);assert.equal(native.snapshot(5,1).active,false)
 report.checks.push('Cancelling the first recording directory dialog does not start monitoring or capture')
 const devices=(await request('devices.list')).data.filter(d=>d.supported)
 if(devices.length>1){await request('devices.select',{deviceId:devices[1].id});assert.equal((await state()).active,false);assert.equal(starts,0)}
 report.checks.push('Selecting a supported source while stopped leaves capture stopped')
 choose=true;await click('.record-button');const take=await wait(async()=>(await state()).currentRecord,'direct record')
 await wait(()=>native.recordStatus().phase==='recording','writer');assert.equal((await state()).monitoringRequested,false);assert.equal(native.snapshot(5,1).active,true)
 const epoch=native.snapshot(5,1).epochId;await setRange('波形时间窗',12.5)
 await wait(async()=>(await state()).windowSeconds===12.5,'fractional REC window');await wheel(-120,false,12)
 await wait(async()=>(await state()).displaySettings.waveGain===1,'REC gain lower bound');await wheel(120,true,4)
 assert.equal(native.snapshot(5,1).epochId,epoch);assert.equal((await state()).currentRecord.id,take.id)
 await fits();await shot('record-only')
 const stopMonitor=await raw('live.stop');assert.equal(stopMonitor.ok,false);assert.equal(stopMonitor.error.code,'RECORDING_ACTIVE')
 await evaluate('document.querySelector("[aria-label=波形时间窗]").focus()');await key('Escape')
 await wait(async()=>!(await state()).currentRecord&&!(await state()).active,'stop and release capture');assert.equal(native.snapshot(5,1).active,false)
 const saved=await wait(async()=>(await state()).recordings.find(t=>t.id===take.id&&t.status==='ready'),'WAV saved');assert.equal(saved.frames,native.recordStatus().writtenFrames);assert(BigInt(saved.frames)>0n)
 report.checks.push('Direct REC from stopped opens capture, accepts fractional zoom without restarting, writes exact frames and returns to stopped')
 await evaluate('document.activeElement?.blur()');await key('R');await wait(async()=>Boolean((await state()).currentRecord),'R without monitor');await delay(250);await key('Escape');await wait(async()=>!(await state()).currentRecord&&!(await state()).active,'R/Escape restores stopped')
 report.checks.push('R works without a separate monitoring step; Escape also stops while a range control has focus')
 const recordStart=native.recordStart;native.recordStart=()=>{throw Error('INJECTED_RECORD_OPEN_FAILED')}
 const failed=await raw('record.start');native.recordStart=recordStart;assert(!failed.ok);await wait(async()=>!(await state()).currentRecord&&!(await state()).active,'failed start releases capture');assert(!native.snapshot(5,1).active)
 report.checks.push('Injected writer-open failure releases the temporary capture and preserves the stopped preference')
 await request('record.start');await wait(()=>native.recordStatus().phase==='recording','fault test writer');await delay(250)
 const recordStatus=native.recordStatus;let inject=true;native.recordStatus=()=>{if(inject){inject=false;throw Error('INJECTED_SNAPSHOT_FAILURE')}return recordStatus()}
 await wait(async()=>!(await state()).currentRecord&&!(await state()).active,'snapshot failure releases capture');native.recordStatus=recordStatus;assert(!native.snapshot(5,1).active)
 report.checks.push('Injected snapshot failure stops the take and releases record-owned capture without an uncaught exception')
 await click('.monitor-button');await wait(async()=>(await state()).active,'monitor on');await delay(200)
 const monitored=native.snapshot(5,1).epochId;await click('.record-button');await wait(async()=>(await state()).currentRecord,'monitored record');await delay(250);await click('.record-button');await wait(async()=>!(await state()).currentRecord,'monitored stop')
 assert((await state()).active);assert((await state()).monitoringRequested);assert.equal(native.snapshot(5,1).epochId,monitored)
 report.checks.push('REC on an existing monitor leaves its capture epoch and monitoring lifecycle intact')
 await request('view.window',{seconds:30});await request('view.gain',{gain:2});await delay(60)
 await wheel(120);const gain=await wait(async()=>{const g=(await state()).displaySettings.waveGain;return g>2&&g<4?g:null},'fractional gain');assert(![1,4,16].includes(gain));assert.equal((await state()).windowSeconds,30)
 await wheel(120,true);await wait(async()=>{const t=(await state()).windowSeconds;return t<30&&t>5},'Ctrl time zoom');assert.equal((await state()).displaySettings.waveGain,gain)
 await wheel(120,true,40);await wait(async()=>(await state()).windowSeconds===5,'time minimum');await wheel(-120,true,40);await wait(async()=>(await state()).windowSeconds===60,'time maximum')
 await wheel(120,false,30);await wait(async()=>(await state()).displaySettings.waveGain===4,'gain maximum');await wheel(-120,false,40);await wait(async()=>(await state()).displaySettings.waveGain===1,'gain minimum')
 assert.equal(native.snapshot(5,1).epochId,monitored)
 await setRange('波形时间窗',13.7);await wait(async()=>(await state()).windowSeconds===13.7,'slider continuous');await fits();await shot('live-clean')
 const text=await evaluate('document.body.innerText');for(const removed of ['TP 使用','未录音时','包含设备空闲','不写音频文件','电平、响度与波形将在这里'])assert(!text.includes(removed),removed);assert(text.includes('dBTP'));assert.equal(await evaluate('document.querySelectorAll(".measurement-note").length'),0)
 report.checks.push('LIVE wheel modifiers are isolated, rapid input clamps to 5–60 s / x1–x4, and redundant copy is absent')
 await request('live.stop');await request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 const file=await wait(async()=>{const f=(await state()).playback;return f?.phase==='paused'?f:null},'file');await wait(()=>evaluate('window.__interaction?.sourceId==='+JSON.stringify(file.id)+'&&window.__interaction.fileView.analysisPhase==="ready"'),'file history')
 await request('playback.seek',{playbackId:file.id,positionFrame:'96000',resume:false});await wait(()=>evaluate('window.__interaction?.positionFrame==="96000"'),'file cursor')
 const before=await snap(),view=(await state()).playback;await wheel(120,false);await delay(80)
 assert.equal((await state()).playback.startFrame,view.startFrame);assert.equal((await state()).playback.endFrame,view.endFrame)
 await wheel(120,true);await wait(async()=>{const f=(await state()).playback;return BigInt(f.endFrame)-BigInt(f.startFrame)<384000n},'file Ctrl zoom')
 const after=await snap();assert.deepEqual(after.channels,before.channels);assert.deepEqual(after.integratedToCursor,before.integratedToCursor);assert.equal(after.positionFrame,'96000')
 assert(BigInt((await state()).playback.endFrame)-BigInt((await state()).playback.startFrame)>=240000n);await fits();await shot('file-clean')
 await request('file.close');await wait(async()=>!(await state()).playback,'leave file');assert.equal((await state()).active,false)
 report.checks.push('FILE gain/time zoom preserves paused measurements and cursor; returning from FILE restores stopped monitoring')
 await request('view.window',{seconds:13.75});await request('view.gain',{gain:1.83});report.status='pass'
}catch(e){report.status='fail';report.error=String(e);report.stack=e.stack;report.state=await state().catch(()=>null);report.snapshot=await snap().catch(()=>null);console.error(e);if(win)await shot('failure').catch(()=>{})}
finally{fs.writeFileSync(path.join(folder,reopen?'reopen.json':'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/feedback3',reopen?'reopen-latest.json':'ui-latest.json'),JSON.stringify(report,null,2));console.log('INTERACTION_UI',report.status,report.checks.length,reopen?'reopen':'main');if(win)win.close();else app.quit()}})
