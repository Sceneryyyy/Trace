// Deterministic synthetic noise, isolated preferences, actual Electron/FFT/canvas.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9','spectrum-continuity-'+Date.now())
const takes=path.join(folder,'takes'),userData=path.join(folder,'user-data')
fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData,{recursive:true})
const fixture=require('../m4/fixture.cjs')(takes);let seed=123456789
for(const asset of fixture.document.assets){
 const file=path.join(fixture.folder,asset.relativePath),bytes=fs.readFileSync(file)
 for(let n=0;n<Number(asset.frameCount);n++){
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5
  const sample=((seed>>>0)/4294967296*2-1)*.2
  for(let c=0;c<2;c++)bytes.writeFloatLE(sample,58+(n*2+c)*4)
 }
 fs.writeFileSync(file,bytes);asset.hash=crypto.createHash('sha256').update(bytes).digest('hex')
}
fixture.document.name='Synthetic deterministic broadband noise'
fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document))
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={status:'running',kind:'Actual Electron canvas with native FFT of synthetic noise; no live capture',checks:[]};let session
const wait=async(fn,label)=>{for(const start=Date.now();Date.now()-start<30000;){if(await fn())return;await delay(40)}throw Error('Timeout '+label)}
const pass=text=>{report.checks.push(text);console.log('PASS',text)}
async function main(){
 session=await launch(require('electron'),folder,{userData,recordDirectory:takes,args:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp
 await c.evaluate(`window.__snapshot=null;window.addEventListener('message',e=>{if(e.data?.type==='trace-meter-stream-v1')window.__snapshot=e.data.snapshot});
 const proto=CanvasRenderingContext2D.prototype,begin=proto.beginPath,move=proto.moveTo,line=proto.lineTo,stroke=proto.stroke;
 proto.beginPath=function(){this.__path=[];return begin.call(this)};
 proto.moveTo=function(x,y){this.__path?.push([x,y]);return move.call(this,x,y)};
 proto.lineTo=function(x,y){this.__path?.push([x,y]);return line.call(this,x,y)};
 proto.stroke=function(){if(this.canvas.closest('.spectrum-instrument')&&this.lineWidth===1.25&&!this.getLineDash().length)window.__curve=this.__path?.slice();return stroke.call(this)};true`)
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='spectral';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 const configure=async fields=>c.request('instrument.configure',{settings:{...(await c.state()).instrumentSettings,...fields}})
 await configure({fftSize:16384,smoothing:0,tilt:0,showCurrent:true,showAverage:false,showPeakHold:false})
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 await wait(()=>c.evaluate("window.__snapshot?.fileView?.analysisPhase==='ready'"),'file analysis')
 await c.request('playback.seek',{playbackId:(await c.state()).playback.id,positionFrame:'96000',resume:false})
 await wait(()=>c.evaluate("window.__snapshot?.instruments?.data?.positionFrame==='96000'&&document.querySelector('.spectrum-instrument')?.dataset.instrumentFrame==='96000'&&window.__curve?.length>100"),'native FFT and canvas')
 for(const scale of [1,1.5]){
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:scale,mobile:false});await delay(200)
  const result=await c.evaluate(`(()=>{const canvas=document.querySelector('.spectrum-instrument canvas'),r=canvas.getBoundingClientRect(),right=44+Math.log(300/20)/Math.log(1000)*(r.width-56),points=window.__curve.filter(([x])=>x>=44&&x<=right);return {points:points.length,maxY:Math.max(...points.map(p=>p[1])),floor:r.height-29,width:r.width,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
  assert(result.points>100);assert(result.maxY<result.floor-10,JSON.stringify(result));assert(!result.overflow)
  report['scale'+scale]=result;await c.screenshot(path.join(folder,'spectrum-'+scale+'.png'))
 }
 pass('FFT 16384 at 48 kHz renders a continuous 20–300 Hz curve without false floor dips at 100% and 150% DPI')
 const rect=await c.evaluate("(()=>{const r=document.querySelector('.spectrum-instrument canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
 const target=200,bin=Math.round(target/(48000/16384)),raw=await c.evaluate('window.__snapshot.instruments.data.current['+bin+']')
 const hover=async()=>{await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+44+Math.log(target/20)/Math.log(1000)*(rect.w-56),y:rect.y+rect.h*.5});await delay(100);return c.evaluate("document.querySelector('.spectrum-instrument .analysis-readout').textContent")}
 const before=await hover();assert(before.includes((bin*48000/16384).toFixed(1)+' Hz'));assert(before.includes((10*Math.log10(raw)).toFixed(1)))
 await configure({smoothing:6,tilt:3});await delay(150);assert.equal(await hover(),before)
 report.hover=before;pass('Hover still reports the original FFT bin and level after display smoothing/tilt changes')
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
 pass('Source PCM hashes remain unchanged');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(error=>{report.status='fail';report.closeError=String(error);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('SPECTRUM_CONTINUITY',report.status,folder)})
