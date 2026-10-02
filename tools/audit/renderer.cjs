// Current React/CSS/canvas with explicitly simulated IPC and sample data. This
// validates UI interactions and creates honest documentation illustrations;
// it is not a Windows/Electron/device or metering acceptance test.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{build}=require('esbuild'),{browserPage}=require('./browser.cjs')
const root=path.resolve(__dirname,'../..')
async function main(){
 const base=path.join(root,'artifacts/release-cloud');await fs.mkdir(base,{recursive:true});const folder=await fs.mkdtemp(path.join(base,'renderer-'))
 const source=path.join(folder,'probe.tsx')
 await fs.writeFile(source,`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import '@fontsource/inter/400.css';import '@fontsource/inter/500.css';import '@fontsource/inter/600.css';import '@fontsource/jetbrains-mono/400.css';
 import App from '${root}/src/trace/renderer/App';
 import '${root}/src/trace/renderer/styles.css';import '${root}/src/trace/renderer/instruments.css';
 import {defaultWorkspace} from '${root}/src/trace/workspace';
 import {defaultDisplaySettings} from '${root}/src/trace/displaySettings';
 import {defaultTargetSettings} from '${root}/src/trace/targetSettings';
 import {defaultInstrumentSettings} from '${root}/src/trace/instrumentTypes';
 import {defaultSpectrogramSettings} from '${root}/src/trace/spectrogramProtocol';
 import {applyTheme} from '${root}/src/trace/renderer/themeRuntime';
 const format={sampleRate:48000,channelCount:2,containerBits:32,validBits:32,encoding:'ieee-float',channelMask:3,blockAlign:8};
 const devices=[{id:'demo',label:'演示信号 · 云端界面示例',isDefault:true,supported:true,error:null,format}];
 let state={revision:1,eventSequence:1,active:true,monitoringRequested:true,deviceId:'demo',windowSeconds:10,error:null,windowVisible:true,instrumentTheme:'trace-green',workspace:defaultWorkspace(),displaySettings:defaultDisplaySettings,targetSettings:defaultTargetSettings,instrumentSettings:defaultInstrumentSettings,spectrogramSettings:defaultSpectrogramSettings,recordings:[],analysisJobs:[],exportJobs:[],reportJobs:[],imports:[],recordSettings:{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'},recordDirectory:'演示目录'};
 const metric=(value,unit)=>({value,unit,status:'ready'}),waveform=Array.from({length:1000},(_,i)=>({frame:String(i*480),min:[-.15*(1+Math.sin(i/25)), -.12*(1+Math.cos(i/27))],max:[.15*(1+Math.sin(i/25)),.12*(1+Math.cos(i/27))],flags:0}));
 let snapshot={protocolVersion:1,sourceKind:'live',sourceId:'demo',epochId:'demo-epoch',measurementEpoch:'demo-meter',active:true,error:null,format,measurementConfigId:'demo-only',positionFrame:'480000',measurementFrames:'480000',levelIndexFrame:'480000',loudnessIndexFrame:'480000',continuity:'complete',channels:[0,1].map(()=>({samplePeak:metric(-12,'dBFS'),rms:metric(-18,'dBFS'),truePeak:metric(-11.9,'dBTP')})),momentary:metric(-23,'LUFS'),shortTerm:metric(-23.1,'LUFS'),integratedToCursor:metric(-23,'LUFS'),loudnessRange:metric(2,'LU'),maxTruePeak:metric(-11.9,'dBTP'),lraProvisional:true,waveform,loudnessHistory:Array.from({length:100},(_,i)=>({frame:String(i*4800),m:metric(-23+Math.sin(i/8),'LUFS'),s:metric(-23+.3*Math.sin(i/12),'LUFS'),i:metric(-23,'LUFS'),flags:0})),diagnostics:{replayFrames:'480000'},eventSequence:1,stateRevision:1};
 const states=new Set(),snapshots=new Set();window.__uiErrors=[];window.addEventListener('error',e=>window.__uiErrors.push(e.error?.stack||e.message));window.addEventListener('unhandledrejection',e=>window.__uiErrors.push(String(e.reason)));
 window.__publish=(quality)=>{snapshot={...snapshot,continuity:quality,eventSequence:snapshot.eventSequence+1,stateRevision:state.revision};for(const fn of snapshots)fn(snapshot)};
 window.trace={onState:fn=>{states.add(fn);return()=>states.delete(fn)},onSnapshot:fn=>{snapshots.add(fn);setTimeout(()=>fn(snapshot),0);return()=>snapshots.delete(fn)},onSpectrogram:()=>()=>{},onReference:()=>()=>{},importFiles:async()=>({accepted:[],errors:[]}),request:async req=>{
  let data;
  if(req.command==='devices.list')data=devices;
  else if(req.command==='view.theme'){state={...state,instrumentTheme:req.payload.theme,revision:state.revision+1};for(const fn of states)fn(state)}
  else if(req.command==='view.settings')state={...state,displaySettings:req.payload,revision:state.revision+1};
  else if(req.command==='app.configure')state={...state,...req.payload,revision:state.revision+1};
  else if(req.command==='workspace.configure')state={...state,workspace:req.payload.workspace,revision:state.revision+1};
  return {requestId:req.requestId,ok:true,state,data};
 }};
 applyTheme('trace-green');createRoot(document.getElementById('root')).render(<App/>);window.__savedTheme=()=>state.instrumentTheme;
 `)
 await build({entryPoints:[source],outfile:path.join(folder,'probe.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.woff':'dataurl','.woff2':'dataurl'}})
 await fs.writeFile(path.join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="probe.css"><div id="root"></div><script src="probe.js"></script>')
 const output=path.join(root,'docs/assets/quick-start-preview31');await fs.mkdir(output,{recursive:true})
 const report={status:'running',scope:'Actual React renderer in headless Chromium; simulated IPC/metrics, no Windows device acceptance',checks:[],captures:[]}
 await browserPage(folder,'index.html',async c=>{
  try{await c.wait("document.querySelectorAll('[data-instrument]').length>=4")}catch(e){console.error(await c.evaluate("JSON.stringify({errors:window.__uiErrors,text:document.body.innerText.slice(0,1200),count:document.querySelectorAll('[data-instrument]').length})"));throw e}await c.evaluate('document.fonts.ready.then(()=>true)');await c.delay(500)
  const shot=async(name,selector)=>{let clip;if(selector)clip=await c.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);const image=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(image.data,'base64'));report.captures.push(name)}
  await shot('workbench');await shot('waveform','[data-instrument="waveform"]');await shot('layout-toolbar','.workspace-toolbar')
  for(const quality of ['estimated-silence','unknown','gaps']){await c.evaluate('window.__publish('+JSON.stringify(quality)+')');await c.delay(100);const text=await c.evaluate('document.body.innerText');assert(text.includes(quality==='estimated-silence'?'包含估计静音':quality==='unknown'?'采集完整性未知':'音频有中断'));report.checks.push('Visible quality: '+quality)}
  await c.evaluate("window.__publish('complete')")
  const values=await c.evaluate("document.querySelector('[data-instrument=loudness]').innerText")
  for(const theme of ['trace-green','ocean','ember','graphite','duo']){
   await c.evaluate("document.querySelector('[aria-label=\"显示与帮助\"]').click()");await c.wait("!!document.querySelector('[role=radiogroup]')")
   await c.evaluate("document.querySelector('[data-theme-choice="+theme+"]').click()");await c.wait("document.documentElement.dataset.traceTheme==="+JSON.stringify(theme))
   const tabStops=await c.evaluate("[...document.querySelectorAll('[role=radio]')].filter(e=>e.tabIndex===0).length");assert.equal(tabStops,1)
   for(const [key,expected]of [['Home','trace-green'],['End','duo']]){
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})
    await c.wait("document.documentElement.dataset.traceTheme==="+JSON.stringify(expected))
    assert.equal(await c.evaluate('document.activeElement.dataset.themeChoice'),expected)
   }
   await c.evaluate("document.querySelector('[data-theme-choice="+theme+"]').click()")
   if(theme==='ocean')await shot('themes')
   await c.evaluate("document.querySelector('.trace-modal .primary-button').click()");await c.wait("!document.querySelector('[role=dialog]')")
   assert.equal(await c.evaluate('window.__savedTheme()'),theme)
   assert.equal(await c.evaluate("document.querySelector('[data-instrument=loudness]').innerText"),values)
   report.checks.push('Theme entry/preview/apply: '+theme)
  }
  await c.evaluate("document.querySelector('[aria-label=\"显示与帮助\"]').click()");await c.wait("!!document.querySelector('[role=radiogroup]')")
  await c.evaluate("document.querySelector('[data-theme-choice=ocean]').click()")
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await c.wait("!document.querySelector('[role=dialog]')")
  assert.equal(await c.evaluate('document.documentElement.dataset.traceTheme'),'duo');report.checks.push('Escape restores saved theme')
  report.frameCadence=await c.evaluate(`new Promise(resolve=>{const frames=[];let last=performance.now();const step=now=>{frames.push(now-last);last=now;window.__publish('complete');if(frames.length<120)requestAnimationFrame(step);else{const sorted=[...frames.slice(1)].sort((a,b)=>a-b);resolve({samples:sorted.length,meanMs:sorted.reduce((a,b)=>a+b,0)/sorted.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),scope:'Simulated snapshots and headless CPU-rendered browser; not Windows realtime performance'})}};requestAnimationFrame(step)})`)
  assert.deepEqual(await c.evaluate('window.__uiErrors'),[])
  report.status='pass'
 })
 await fs.writeFile(path.join(folder,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(output,'capture.json'),JSON.stringify({version:'0.1.0-preview.31',source:report.scope,captures:report.captures},null,2));console.log('TRACE_RENDERER',report.status,report.checks.length,folder)
}
main().catch(e=>{console.error(e);process.exitCode=1})
