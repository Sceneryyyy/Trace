const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const {launch,delay}=require('../m6/cdp.cjs'),root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9/presentation-'+Date.now()),scale=Number(process.env.TRACE_UI_SCALE||1)
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes');fs.mkdirSync(takes)
const factory=require('../m4/fixture.cjs'),stereo=factory(takes),staging=path.join(folder,'mono-staging');fs.mkdirSync(staging);const mono=factory(staging),monoTarget=path.join(takes,'mono')
assert(path.resolve(mono.folder).startsWith(folder+path.sep)&&path.resolve(monoTarget).startsWith(folder+path.sep));fs.renameSync(mono.folder,monoTarget);mono.folder=monoTarget
function tone(f,channels,frequency,amplitude){let offset=0
 for(const asset of f.document.assets){const count=Number(asset.frameCount),b=Buffer.alloc(58+count*channels*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(18,16);b.writeUInt16LE(3,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*channels*4,28);b.writeUInt16LE(channels*4,32);b.writeUInt16LE(32,34);b.write('fact',38);b.writeUInt32LE(4,42);b.writeUInt32LE(count,46);b.write('data',50);b.writeUInt32LE(count*channels*4,54)
  for(let n=0;n<count;n++)for(let c=0;c<channels;c++)b.writeFloatLE(amplitude*Math.sin(2*Math.PI*frequency*(offset+n)/48000)*(c?-1:1),58+(n*channels+c)*4)
  offset+=count;fs.writeFileSync(path.join(f.folder,asset.relativePath),b);asset.channelCount=channels;asset.hash=crypto.createHash('sha256').update(b).digest('hex')}
 f.document.name=channels===1?'Synthetic mono 1500 Hz':'Synthetic stereo 750 Hz';f.document.sourceFormat.channelCount=channels;f.document.regions.forEach(r=>r.format.channelCount=channels);fs.writeFileSync(path.join(f.folder,'session.json'),JSON.stringify(f.document))
}
tone(stereo,2,750,.4);tone(mono,1,1500,.25)
const userData=path.join(folder,'user-data');fs.mkdirSync(userData);fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={folder,scale,status:'running',checks:[],formats:[]};let session
const pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function wait(fn,label,max=30000){for(const t=Date.now();Date.now()-t<max;){const v=await fn();if(v)return v;await delay(25)}throw Error('Timeout '+label)}
async function main(){
 session=await launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,recordDirectory:takes,scale,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp;await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:scale,mobile:false})
 await wait(async()=>(await c.state()).workspace?.version===4,'workspace')
 await c.evaluate('window.__m9Frame=null;window.trace.onSnapshot(s=>window.__m9Frame=s);window.__sp=null;window.__audit={samples:0,mismatches:0};window.trace.onSpectrogram(p=>{if(!p.testInjected)window.__sp=p});window.__auditTick=()=>{const p=document.querySelector(".spectrogram-instrument"),v=p?.querySelector("canvas"),drawn=v?.dataset.spectrogramDrawnContext;if(p&&drawn&&drawn!==p.dataset.spectrogramContext)window.__audit.mismatches++;window.__audit.samples++;window.__raf=requestAnimationFrame(window.__auditTick)};window.__auditTick();true')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 async function ready(){return wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.requestId===document.querySelector(".spectrogram-instrument")?.dataset.spectrogramRequest'),'current raster')}
 async function open(f,expectReady=true){await c.request('file.open',{takeId:f.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback.analysisPhase==='ready','analysis');await wait(()=>c.evaluate('window.__m9Frame?.fileView?.analysisPhase==="ready"'),'presented analysis');if(expectReady)await ready()}
 await open(stereo);await delay(100)
 const original=await c.evaluate('({id:window.__sp.requestId,source:window.__sp.source,config:window.__sp.configKey})')
 await c.evaluate('window.postMessage({type:"trace-spectrogram-stream-v1",packet:{...window.__sp,testInjected:true,source:{...window.__sp.source,sourceId:"wrong-source"}}},"*");true');await delay(100)
 assert(await c.evaluate('(()=>{const p=document.querySelector(".spectrogram-instrument"),v=p.querySelector("canvas");return v.dataset.spectrogramDrawnContext===p.dataset.spectrogramContext&&!v.dataset.spectrogramDrawnContext.includes("wrong-source")})()'));pass('A stale same-request packet cannot repaint a different source')
 const failedId=await c.evaluate('window.__sp.requestId')
 await c.evaluate('window.postMessage({type:"trace-spectrogram-stream-v1",packet:{...window.__sp,testInjected:true,source:'+JSON.stringify(original.source)+',configKey:'+JSON.stringify(original.config)+',phase:"error",view:undefined,error:"TEST_ONLY_CURRENT_RENDER_FAILURE"}},"*");true')
 await c.click('[aria-label="重试声谱图"]');await wait(()=>c.evaluate('window.__sp?.requestId!=='+JSON.stringify(failedId)+'&&window.__sp?.phase==="ready"'),'retried raster');await ready();pass('A current display error exposes an actionable retry and recovers without changing source')
 const setting=(await c.state()).spectrogramSettings;await c.request('spectrogram.configure',{settings:{...setting,channel:'mid'}});await open(mono,false)
 await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.spectrogramPhase==="unavailable"'),'mono explanation')
 assert((await c.evaluate('document.querySelector(".spectrogram-instrument").textContent')).includes('此声道模式需要双声道'))
 await c.evaluate('([...document.querySelectorAll(".spectrogram-toolbar button")].find(b=>b.textContent==="使用单声道").click())');await ready()
 let qid=await c.evaluate('window.__sp.requestId');let point=await c.request('spectrogram.point',{queryId:qid,positionFrame:'96000',frequency:1500});assert(Math.abs(point.data.decibels-20*Math.log10(.25))<.0001);pass('Mono source explains incompatible channel modes and offers a calibrated default')
 for(let i=0;i<6;i++){await open(i%2?mono:stereo);await c.request('spectrogram.configure',{settings:{...(await c.state()).spectrogramSettings,fftSize:i%2?4096:2048}});await ready()}
 report.audit=await c.evaluate('window.__audit');assert.equal(report.audit.mismatches,0);assert(report.audit.samples>20);pass('Rapid source and FFT changes keep canvas identity aligned before paint')
 const oldId=await c.evaluate('window.__sp.requestId');await c.request('test.window',{mode:'hide'});await delay(150);await c.request('test.window',{mode:'restore'})
 await wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.requestId!=='+JSON.stringify(oldId)),'restored query');await ready()
 point=await c.request('spectrogram.point',{queryId:await c.evaluate('window.__sp.requestId'),positionFrame:'96000',frequency:1500});assert.equal(point.data.status,'ready');pass('A brief hidden/restored paused file renews point-query ownership')
 if(scale===1){
  for(const preset of [{format:'wav',encoding:'pcm16',sampleRate:96000},{format:'mp3',sampleRate:48000,bitrate:192},{format:'aac',container:'m4a',sampleRate:44100,bitrate:192},{format:'aac',container:'adts',sampleRate:48000,bitrate:192}]){
   const exported=(await c.request('export.start',{takeId:stereo.document.sessionId,role:'source',preset})).data
   const job=await wait(async()=>{const j=(await c.state()).exportJobs.find(j=>j.id===exported.jobId);if(j?.phase==='failed')throw Error(j.error);return j?.phase==='ready'?j:null},'export '+preset.format,60000)
   await c.request('file.open',{takeId:stereo.document.sessionId,role:'export',exportId:job.id});await wait(async()=>(await c.state()).playback.analysisPhase==='ready','decoded analysis');await ready()
   const file=(await c.state()).playback,position=String(Math.round(file.sampleRate*2)),getPoint=async()=>wait(async()=>{try{return await c.request('spectrogram.point',{queryId:await c.evaluate('window.__sp.requestId'),positionFrame:position,frequency:750})}catch(e){if(String(e).includes('STALE_SPECTROGRAM'))return false;throw e}},'current format point')
   const first=await getPoint();assert.equal(first.data.status,'ready');assert.equal(first.data.frequency,Math.round(750*4096/file.sampleRate)*file.sampleRate/4096)
   await c.request('playback.seek',{playbackId:file.id,positionFrame:file.totalFrames,resume:false});await c.request('playback.seek',{playbackId:file.id,positionFrame:position,resume:false});const again=await getPoint();assert.equal(first.data.decibels,again.data.decibels)
   report.formats.push({preset,sourceId:file.id,sampleRate:file.sampleRate,frames:file.totalFrames,frequency:first.data.frequency,decibels:first.data.decibels})
  }
  pass('96 kHz PCM16, MP3, M4A and ADTS outputs each retain their own repeatable spectral data')
 }
 const image=await c.send('Page.captureScreenshot',{format:'jpeg',quality:90,fromSurface:true});fs.writeFileSync(path.join(folder,'presentation.jpg'),Buffer.from(image.data,'base64'))
 const metrics=await c.evaluate('(()=>{const p=document.querySelector(".spectrogram-instrument"),c=p.querySelector("canvas");return {w:c.clientWidth,h:c.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth}})()');assert(metrics.w>200&&metrics.h>80&&!metrics.overflow);report.geometry=metrics
 for(const f of [stereo,mono])for(const a of f.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(f.folder,a.relativePath))).digest('hex'),a.hash)
 pass('Scaled 2D geometry stays usable and original PCM files remain unchanged');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{if(session){try{report.finalPacket=await session.cdp.evaluate('window.__sp?{source:window.__sp.source,phase:window.__sp.phase,error:window.__sp.error}:null')}catch{}await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1})}fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m9/presentation-latest.json'),JSON.stringify(report,null,2));console.log('M9_PRESENTATION',report.status,report.checks.length)})
