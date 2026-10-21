// Actual GPU viewport resize check using deterministic generated broadband audio.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs'),{decode}=require('../themes/png.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m10','viewport-fit-'+Date.now()),takes=path.join(folder,'takes'),userData=path.join(folder,'user-data')
fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData)
const fixture=require('../m4/fixture.cjs')(takes);let seed=12345
for(const asset of fixture.document.assets){
 const file=path.join(fixture.folder,asset.relativePath),bytes=fs.readFileSync(file)
 for(let n=58;n<bytes.length;n+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;bytes.writeFloatLE((seed/2**32*2-1)*.8,n)}
 fs.writeFileSync(file,bytes);asset.hash=crypto.createHash('sha256').update(bytes).digest('hex')
}
fixture.document.name='Synthetic broadband viewport test';fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document))
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={status:'running',folder,kind:'Generated audio, actual WebGL; no capture',checks:[],frames:[]};let session
const wait=async(fn,label)=>{for(const start=Date.now();Date.now()-start<30000;){const result=await fn();if(result)return result;await delay(30)}throw Error('Timeout '+label)}
const pass=name=>{report.checks.push(name);console.log('PASS',name)}
async function main(){
 process.env.TRACE_TEST_GPU='1'
 const packaged=process.env.TRACE_PACKAGE_EXE
 session=await launch(packaged||require('electron'),folder,{userData,recordDirectory:takes,args:packaged?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp
 await c.evaluate("window.__sp=null;window.__fileReady=false;window.trace.onSpectrogram(p=>window.__sp=p);window.addEventListener('message',e=>{if(e.data?.type==='trace-meter-stream-v1')window.__fileReady=e.data.snapshot.fileView?.analysisPhase==='ready'});true")
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 const ready=()=>wait(()=>c.evaluate('window.__sp?.phase==="ready"&&window.__sp.requestId===document.querySelector(".spectrogram-instrument")?.dataset.spectrogramRequest'),'current raster')
 await wait(()=>c.evaluate('window.__fileReady'),'completed file analysis');await ready();const settings=(await c.state()).spectrogramSettings
 await c.request('spectrogram.configure',{settings:{...settings,surface:{...settings.surface,mode:'3d',zoom:1}}});await ready()
 await wait(()=>c.evaluate('Number(document.querySelector(".surface-gl")?.dataset.surfaceVertices)>0'),'GL mesh')
 const point=()=>wait(async()=>{try{await ready();return (await c.request('spectrogram.point',{queryId:await c.evaluate('window.__sp.requestId'),positionFrame:'96000',frequency:1000})).data}catch(error){if(String(error).includes('STALE_SPECTROGRAM'))return false;throw error}},'current precise point')
 const before=await point()
 async function capture(name){
  await delay(200);await ready()
  const rect=await c.evaluate('(()=>{const r=document.querySelector(".surface-gl").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()')
  const image=await c.send('Page.captureScreenshot',{format:'png',fromSurface:true,clip:{...rect,scale:1}}),buffer=Buffer.from(image.data,'base64'),png=decode(buffer)
  fs.writeFileSync(path.join(folder,name+'-plot.png'),buffer);await c.screenshot(path.join(folder,name+'.png'))
  let left=png.width,right=0,pixels=0
  for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
   const at=(y*png.width+x)*4,[r,g,b]=png.data.subarray(at,at+3)
   if(g>90&&g>r+20&&g>b+20){left=Math.min(left,x);right=Math.max(right,x);pixels++}
  }
  const fraction=(right-left+1)/png.width
  assert(pixels>1000&&fraction>.6,'surface stays narrow in '+name+': '+fraction)
  const state=(await c.state()).spectrogramSettings.surface;assert.equal(state.zoom,1)
  report.frames.push({name,canvas:rect,surfacePixels:right-left+1,widthFraction:fraction,pixels})
 }
 await capture('split-layout')
 await c.click('[aria-label="最大化声谱图"]');await capture('maximized')
 for(const [name,width,height] of [['wide',1600,780],['square',1100,950],['tall',1100,1500]]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(300);await capture(name)
  assert(await c.evaluate('document.documentElement.scrollWidth<=innerWidth'),'unexpected horizontal overflow in '+name)
 }
 pass('Real surface occupies over 60% of plot width in split, maximized, wide, square and tall layouts')
 const first=report.frames[0],wide=report.frames.find(f=>f.name==='wide');assert(wide.surfacePixels>first.surfacePixels*1.2)
 pass('Surface pixel width grows with the enlarged viewport without changing saved zoom')
 assert.deepEqual(await point(),before)
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
 pass('Layout changes preserve original spectral point values and source PCM')
 report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(error=>{report.status='fail';report.closeError=String(error);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('VIEWPORT_FIT',report.status,folder)})
