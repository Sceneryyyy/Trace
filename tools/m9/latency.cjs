const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9/latency-'+Date.now()),userData=path.join(folder,'user-data')
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={folder,status:'running',checks:[]};let session
async function wait(fn,label){for(const t=Date.now();Date.now()-t<30000;){const v=await fn();if(v)return v;await delay(25)}throw Error('Timeout '+label)}
async function main(){
 session=await launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp;await wait(async()=>Boolean((await c.state()).deviceId),'device')
 const state=await c.state();await c.request('workspace.configure',{workspace:{...state.workspace,layout:{...state.workspace.layout,hidden:[]}}})
 await c.request('instrument.configure',{settings:{...state.instrumentSettings,fftSize:16384,averageMs:2000,holdMs:2000,fieldMs:1000}})
 await c.request('spectrogram.configure',{settings:{...state.spectrogramSettings,fftSize:16384}})
 await c.request('live.start',{deviceId:state.deviceId})
 await wait(()=>c.evaluate('Boolean(document.querySelector("[data-spectrogram-phase=ready] canvas[data-spectrogram-paint-ms]"))'),'initial spectral paint')
 await delay(1500)
 await c.evaluate('window.__latency=[];window.__lastPaint="";window.__latencyTick=()=>{const canvas=document.querySelector("[data-spectrogram-phase=ready] canvas"),key=canvas?.dataset.spectrogramPaintKey;if(key&&key!==window.__lastPaint){window.__lastPaint=key;window.__latency.push(Number(canvas.dataset.spectrogramPaintMs));if(window.__latency.length>500)window.__latency.shift()}window.__latencyRaf=requestAnimationFrame(window.__latencyTick)};window.__latencyTick();true')
 await delay(12000);const times=await c.evaluate('cancelAnimationFrame(window.__latencyRaf);window.__latency');assert(times.length>=70,'insufficient real painted query samples');assert(times.every(Number.isFinite))
 const sorted=[...times].sort((a,b)=>a-b);report.samples=times;report.p50=sorted[Math.floor(sorted.length*.5)];report.p95=sorted[Math.floor(sorted.length*.95)];report.maximum=sorted.at(-1)
 report.info=(await c.request('app.info')).data;assert.equal(report.info.windowVisible,true);assert(report.p95<=100,'end-to-end cached query/paint p95 exceeds 100 ms')
 report.checks.push('Maximum instrument settings publish enough actual painted views','Cached viewport query through actual canvas paint meets p95 100 ms');report.status='pass'
}
main().catch(e=>{report.error=String(e);report.status='fail';console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m9/latency-latest.json'),JSON.stringify(report,null,2));console.log('M9_LATENCY',report.status,'p95',report.p95,'samples',report.samples?.length)})
