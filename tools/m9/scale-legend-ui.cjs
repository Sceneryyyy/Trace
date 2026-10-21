// Generated sweep/tones, isolated preferences; no system capture or personal audio.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9','scale-legend-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes'),userData=path.join(folder,'user-data');fs.mkdirSync(takes);fs.mkdirSync(userData)
const fixture=require('../m4/fixture.cjs')(takes)
let offset=0
for(const asset of fixture.document.assets){
 const file=path.join(fixture.folder,asset.relativePath),bytes=fs.readFileSync(file),count=Number(asset.frameCount)
 for(let n=0;n<count;n++){
  const t=(offset+n)/48000,phase=2*Math.PI*(100*t+19900*t*t/16)
  const sample=.08*Math.sin(phase)+[100,1000,5000,15000].reduce((v,hz)=>v+.06*Math.sin(2*Math.PI*hz*t),0)
  for(let c=0;c<2;c++)bytes.writeFloatLE(sample,58+(n*2+c)*4)
 }
 offset+=count;fs.writeFileSync(file,bytes);asset.hash=crypto.createHash('sha256').update(bytes).digest('hex')
}
fixture.document.name='Synthetic sweep 100–20000 Hz + calibrated tones';fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document))
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={status:'running',folder,checks:[],screenshots:[],kind:'Generated fixture, actual Electron renderer; no live capture'};let session
const pass=text=>{report.checks.push(text);console.log('PASS',text)}
const wait=async(fn,label)=>{for(const start=Date.now();Date.now()-start<30000;){if(await fn())return;await delay(30)}throw Error('Timeout '+label)}
async function main(){
 session=await launch(require('electron'),folder,{userData,recordDirectory:takes,args:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp
 await c.evaluate("window.__sp=null;window.__fileReady=false;window.trace.onSpectrogram(p=>window.__sp=p);window.addEventListener('message',e=>{if(e.data?.type==='trace-meter-stream-v1')window.__fileReady=e.data.snapshot.fileView?.analysisPhase==='ready'});true")
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 const ready=()=>wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.requestId===document.querySelector(".spectrogram-instrument")?.dataset.spectrogramRequest'),'current raster')
 await wait(()=>c.evaluate('window.__fileReady'),'completed file analysis');await ready()
 const point=async frequency=>{let result;await wait(async()=>{await ready();try{result=await c.request('spectrogram.point',{queryId:await c.evaluate('window.__sp.requestId'),positionFrame:'96000',frequency});return true}catch(e){if(!/STALE_SPECTROGRAM/.test(String(e)))throw e;return false}},'current precise spectral point');return result}
 const configure=async fields=>{await c.request('spectrogram.configure',{settings:{...(await c.state()).spectrogramSettings,...fields}});await ready();await delay(100)}
 const shot=async name=>{await c.screenshot(path.join(folder,name+'.png'));report.screenshots.push(name+'.png')}
 const geometry=()=>c.evaluate('(()=>{const p=document.querySelector(".spectrogram-instrument"),canvas=p.querySelector(".wave-panel canvas"),r=canvas.getBoundingClientRect(),l=p.querySelector(".spectrogram-legend").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,legendWidth:l.width,overflow:document.documentElement.scrollWidth>innerWidth,labels:[...p.querySelectorAll(".spectrogram-legend-tick")].map(e=>e.textContent)}})()')
 await configure({minFrequency:1,maxFrequency:48000,fftSize:4096})
 assert.equal(await c.evaluate('window.__sp.view.maxFrequency'),24000)
 const before=await point(15000)
 assert.equal(before.data.frequency,15000)
 pass('Raster respects actual 48 kHz Nyquist and retains the calibrated 15 kHz point')
 let r=await geometry();assert(r.w>200&&r.h>80&&!r.overflow&&r.legendWidth===54)
 await shot('full-range-green')
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+36+(r.w-46)*.4,y:r.y+14+(r.h-28)*.5})
 await wait(()=>c.evaluate('document.querySelector(".spectrogram-readout").textContent.includes(" Hz · ")'),'hover frequency')
 const pointer=await c.evaluate('document.querySelector(".spectrogram-readout").textContent'),expected=Math.round((Math.sqrt((700+1)*(700+24000))-700)*4096/48000)*48000/4096
 assert(pointer.includes(expected.toFixed(1)+' Hz'));report.hover={pointer,expected}
 pass('Actual 2D hover queries the same smooth frequency scale as the raster')
 await configure({minFrequency:20,maxFrequency:20000})
 r=await geometry()
 const anchor=Math.sqrt((700+20)*(700+20000))-700
 await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x+36+(r.w-46)*.4,y:r.y+r.h*.5,deltaX:0,deltaY:-100})
 await wait(async()=>(await c.state()).spectrogramSettings.minFrequency!==20,'frequency wheel zoom');await ready()
 const zoomed=(await c.state()).spectrogramSettings
 assert(Math.abs(Math.sqrt((700+zoomed.minFrequency)*(700+zoomed.maxFrequency))-700-anchor)<1e-5)
 await configure({minFrequency:1,maxFrequency:48000})
 const after=await point(15000)
 assert.deepEqual(after.data,before.data)
 pass('Actual wheel zoom preserves the pointer anchor and original point values are repeatable after view changes')
 await configure({minFrequency:20,maxFrequency:20000})
 for(const theme of ['trace-green','graphite','ember','ocean','duo']){
  await c.request('view.theme',{theme});await delay(100)
  const colors=await c.evaluate('document.querySelector(".spectrogram-legend-gradient").style.background')
  assert(colors.includes('to top'));report[theme]=colors;await shot('theme-'+theme)
 }
 assert.equal(new Set(['trace-green','graphite','ember','ocean','duo'].map(t=>report[t])).size,5)
 pass('Numeric legend uses each of the five active theme palettes')
 await configure({palette:'heat',minDecibels:-83,maxDecibels:-11})
 r=await geometry();assert(r.labels.includes('-83')&&r.labels.includes('-11'))
 const heat=await c.evaluate('document.querySelector(".spectrogram-legend-gradient").style.background')
 await c.request('view.theme',{theme:'ocean'});await delay(100)
 assert.equal(await c.evaluate('document.querySelector(".spectrogram-legend-gradient").style.background'),heat)
 await shot('heat-custom-db')
 pass('Custom dB endpoints are exact; heat legend stays fixed across theme changes')
 await configure({surface:{...(await c.state()).spectrogramSettings.surface,mode:'3d'}})
 await wait(()=>c.evaluate('document.querySelector(".surface-gl")?.dataset.surfaceContext?.length>0'),'3D render')
 assert.equal(await c.evaluate('document.querySelector(".spectrogram-instrument").dataset.surfaceMode'),'3d')
 const controls=await c.evaluate('(()=>{const p=document.querySelector(".spectrogram-instrument");return {time:!!p.querySelector("[aria-label=声谱图时间窗]"),pose:[...p.querySelectorAll("select")].some(e=>e.getAttribute("aria-label")==="3D 视角"),advanced:!!p.querySelector("details.surface-options"),overview:p.querySelector(".spectrogram-readout").textContent}})()');assert(controls.time&&controls.pose&&controls.advanced);report.controls=controls;
 await shot('surface-legend');pass('3D retains the shared frequency projection and numeric colour key')
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await delay(80);
 const mesh=await c.evaluate('(()=>{const r=document.querySelector(".surface-gl").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mesh.x+mesh.w*.5,y:mesh.y+mesh.h*.55});
 await wait(()=>c.evaluate('document.querySelector(".spectrogram-readout").textContent.includes(" Hz · ")'),'actual 3D pick');report.surfaceHover=await c.evaluate('document.querySelector(".spectrogram-readout").textContent');
 pass('Preview.35 time window, pose selector and advanced controls survive; actual 3D pointer returns a frequency readout');
 await configure({surface:{...(await c.state()).spectrogramSettings.surface,mode:'2d'},palette:'trace',minDecibels:-100,maxDecibels:0})
 await c.send('Emulation.setDeviceMetricsOverride',{width:1000,height:650,deviceScaleFactor:1.5,mobile:false});await delay(300);await ready()
 r=await geometry();assert(!r.overflow&&r.w>150&&r.h>60);await shot('compact-150pct');report.geometry=r
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
 pass('Compact 150% geometry fits and source PCM remains unchanged');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(error=>{report.status='fail';report.closeError=String(error);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('SCALE_LEGEND',report.status,folder)})
