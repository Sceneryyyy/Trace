const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const {launch,delay}=require('../m6/cdp.cjs'),root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9/ui-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes');fs.mkdirSync(takes);const fixture=require('../m4/fixture.cjs')(takes)
let offset=0;for(const asset of fixture.document.assets){const p=path.join(fixture.folder,asset.relativePath),b=fs.readFileSync(p),count=(b.length-58)/8
 for(let n=0;n<count;n++){const value=.4*Math.sin(2*Math.PI*750*(offset+n)/48000);b.writeFloatLE(value,58+n*8);b.writeFloatLE(-value,62+n*8)}offset+=count;fs.writeFileSync(p,b);asset.hash=crypto.createHash('sha256').update(b).digest('hex')}
fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document))
const userData=path.join(folder,'user-data');fs.mkdirSync(userData);fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
let session;const report={folder,status:'running',checks:[]},pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function wait(fn,label,max=30000){for(const t=Date.now();Date.now()-t<max;){const v=await fn();if(v)return v;await delay(30)}throw Error('Timeout '+label)}
async function shot(c,name){const im=await c.send('Page.captureScreenshot',{format:'jpeg',quality:90,fromSurface:true});fs.writeFileSync(path.join(folder,name+'.jpg'),Buffer.from(im.data,'base64'))}
async function main(){
 session=await launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,recordDirectory:takes,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp;await wait(async()=>(await c.state()).workspace?.version===3,'workspace');assert.equal((await c.request('app.info')).data.windowVisible,true)
 await c.evaluate('window.__m9Frame=null;window.trace.onSnapshot(s=>window.__m9Frame=s);window.__sp=null;window.__spErrors=[];window.trace.onSpectrogram(p=>{window.__sp=p;if(p.phase==="error")window.__spErrors.push(p.error)});true')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','analysis')
 await wait(()=>c.evaluate('window.__sp?.phase==="ready"&&Boolean(document.querySelector("[data-spectrogram-phase=ready]"))'),'2D file')
 report.initial=await c.evaluate('({phase:window.__sp.phase,start:window.__sp.axisStartFrame,end:window.__sp.axisEndFrame,coverage:Math.max(...window.__sp.view.coverage),dims:[window.__sp.view.width,window.__sp.view.height],errors:window.__spErrors})')
 assert.equal(report.initial.coverage,1)
 const point=await wait(async()=>{try{if(!await c.evaluate('Boolean(document.querySelector("[data-spectrogram-phase=ready]"))'))return false;return await c.request('spectrogram.point',{queryId:await c.evaluate('window.__sp.requestId'),positionFrame:'96000',frequency:750})}catch(e){if(String(e).includes('STALE_SPECTROGRAM'))return false;throw e}},'current precise point')
 await delay(150);await shot(c,'file-2d')
 assert.equal(point.data.frequency,750);assert(Math.abs(point.data.decibels-20*Math.log10(.4))<.0001);pass('Visible 2D file panel receives calibrated raw points and bounded raster')
 const p=(await c.state()).playback
 const rect=await c.evaluate('(()=>{const r=document.querySelector("[data-instrument=spectrogram] canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()')
 const x=rect.x+36+(rect.width-46)*.4,y=rect.y+rect.height*.5
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y})
 await wait(async()=>BigInt((await c.state()).playback.positionFrame)>120000n,'shared seek');assert.equal((await c.state()).playback.id,p.id);pass('Spectrogram click seeks the existing shared file cursor')
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y,modifiers:8})
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:x+100,y,modifiers:8})
 await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:x+100,y,modifiers:8})
 await wait(async()=>Boolean((await c.state()).playback.selection),'selection');pass('Shift drag shares the selection with waveform and loudness history')
 await c.click('[aria-label="声谱图设置"]');await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"声谱图 FFT 窗\"]');e.value='4096';e.dispatchEvent(new Event('change',{bubbles:true}));[...document.querySelectorAll('.instrument-settings button')].find(e=>e.textContent==='应用').click()})()")
 await wait(async()=>(await c.state()).spectrogramSettings.fftSize===4096,'FFT setting');await c.click('[aria-label="关闭仪器设置"]');await wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.view?.fftSize===4096'),'reconfigured view')
 pass('Separate spectrogram settings rebuild FFT data and keep the same selected source')
 await c.request('playback.window',{playbackId:p.id,startFrame:'48000',endFrame:'144000',pixelWidth:900})
 await wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.axisStartFrame==="48000"&&window.__sp.axisEndFrame==="144000"'),'shared zoom')
 pass('Changing the shared time window requests only the same visible range')
 await c.request('file.close');await wait(async()=>(await c.request('app.info')).data.spectrogramUsage.bytes===0,'source release')
 pass('Closing the file releases spectral storage before source teardown')
 await c.request('view.live');await c.request('live.start',{deviceId:(await c.state()).deviceId});await wait(()=>c.evaluate('window.__sp?.source.kind==="live"&&window.__sp.view?.coverage.some(v=>v>0)'),'LIVE data');await shot(c,'live-2d')
 pass('Actual LIVE capture feeds the same 2D panel')
 await c.request('live.stop');await c.request('record.start');const take=(await c.state()).currentRecord
 await wait(()=>c.evaluate('window.__sp?.source.kind==="take"&&window.__sp.view?.coverage.some(v=>v>0)'),'REC data')
 const before=await c.evaluate('window.__m9Frame.recording.writtenFrames');await delay(700);assert.equal((await c.state()).currentRecord.id,take.id);assert(BigInt(await c.evaluate('window.__m9Frame.recording.writtenFrames'))>BigInt(before));await shot(c,'recording-2d')
 await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'record stop');pass('REC 2D uses the nanosecond timeline while native frames continue writing')
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
 pass('Original fixture files remain unchanged');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{
 if(session){try{report.finalState=await session.cdp.state();report.lastPacket=await session.cdp.evaluate('window.__sp?{phase:window.__sp.phase,error:window.__sp.error,source:window.__sp.source}:null')}catch{}await session.close().catch(e=>report.closeError=String(e))}
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m9/ui-latest.json'),JSON.stringify(report,null,2));console.log('M9_UI',report.status,report.checks.length)
})
