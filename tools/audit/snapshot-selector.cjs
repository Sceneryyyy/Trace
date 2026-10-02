// Real React client rendering in an isolated Chromium page; no Trace hardware.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{build}=require('esbuild')
const root=path.resolve(__dirname,'../..'),delay=ms=>new Promise(r=>setTimeout(r,ms))
async function main(){
 const base=path.join(root,'artifacts/cloud-regression');await fs.mkdir(base,{recursive:true})
 const folder=await fs.mkdtemp(path.join(base,'selector-')),source=path.join(folder,'probe.jsx'),bundle=path.join(folder,'probe.js'),profile=path.join(folder,'profile')
 await fs.writeFile(source,`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {publishSnapshot,useSnapshotSelector} from ${JSON.stringify(path.join(root,'src/trace/renderer/snapshotStore.ts'))};
 import {useChromeFlags} from ${JSON.stringify(path.join(root,'src/trace/renderer/viewModel.ts'))};
 let renders=0,chromeRenders=0;
 const inputs={state:{revision:0,deviceId:'device',active:true,error:null},devices:[],windowDraft:null,recordWindow:{mode:'all',start:'0',end:'0'},seconds:30};
 function Probe({factor}){const v=useSnapshotSelector(s=>({active:s?.active,scaled:Number(s?.positionFrame||0)*factor}),(a,b)=>a.active===b.active&&a.scaled===b.scaled);renders++;return <span id="value">{v.scaled}</span>}
 function Chrome(){useChromeFlags(inputs);chromeRenders++;return null}
 const root=createRoot(document.getElementById('root'));const frame={active:true,positionFrame:'1',sourceKind:'live',sourceId:'device',format:{sampleRate:48000,channelCount:1},diagnostics:{replayFrames:'48000'},error:null,continuity:'complete'};
 flushSync(()=>publishSnapshot(frame));flushSync(()=>root.render(<><Probe factor={1}/><Chrome/></>));
 const before=renders,chromeBefore=chromeRenders;
 for(let i=0;i<30;i++)flushSync(()=>publishSnapshot({...frame,eventSequence:i}));
 const stable=renders-before,chromeStable=chromeRenders-chromeBefore;
 flushSync(()=>publishSnapshot({...frame,active:false}));const changed=renders-before-stable;
 flushSync(()=>root.render(<><Probe factor={2}/><Chrome/></>));const propValue=document.getElementById('value').textContent;
 const propBefore=renders;for(let i=0;i<10;i++)flushSync(()=>publishSnapshot({...frame,active:false,eventSequence:i}));
 const stableAfterProps=renders-propBefore;
 flushSync(()=>publishSnapshot({...frame,active:false,positionFrame:'2'}));const nextValue=document.getElementById('value').textContent;
 flushSync(()=>root.unmount());const unmountBefore=renders;publishSnapshot({...frame,positionFrame:'3'});
 window.__result={stable,chromeStable,changed,propValue,stableAfterProps,nextValue,afterUnmount:renders-unmountBefore};`)
 const plugins=process.argv.includes('--baseline')?[{name:'committed-selector',setup(b){b.onLoad({filter:/[\\/]snapshotStore\.ts$/},()=>({contents:execFileSync('git',['show','d2981fd:src/trace/renderer/snapshotStore.ts'],{cwd:root,encoding:'utf8'}),loader:'ts'}))}}]:[]
 await build({entryPoints:[source],outfile:bundle,bundle:true,platform:'browser',format:'iife',jsx:'automatic',plugins})
 const browser=spawn(process.env.TRACE_AUDIT_CHROMIUM||'chromium',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-dev-shm-usage','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
 let startupError;browser.on('error',e=>startupError=e);browser.stderr.resume();let ws
 try{
  let port;for(let i=0;i<200;i++){if(startupError)throw startupError;try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{}await delay(50)}
  assert(port,'Chromium CDP did not start')
  const pages=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  let sequence=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}}
  const call=(method,params)=>new Promise((r,j)=>{const id=++sequence,t=setTimeout(()=>{pending.delete(id);j(Error('CDP_TIMEOUT'))},20000);pending.set(id,m=>{clearTimeout(t);m.error?j(Error(JSON.stringify(m.error))):r(m)});ws.send(JSON.stringify({id,method,params}))})
  const code="document.body.innerHTML='<div id=\"root\"></div>';"+await fs.readFile(bundle,'utf8'),evaluation=await call('Runtime.evaluate',{expression:code})
  assert(!evaluation.result.exceptionDetails,JSON.stringify(evaluation.result.exceptionDetails))
  const response=await call('Runtime.evaluate',{expression:'window.__result',returnByValue:true}),result=response.result.result.value
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2))
  assert.deepEqual(result,{stable:0,chromeStable:0,changed:1,propValue:'2',stableAfterProps:0,nextValue:'4',afterUnmount:0})
  console.log('SNAPSHOT_SELECTOR_PASS',JSON.stringify(result),folder)
 }finally{ws?.close();browser.kill('SIGTERM')}
}
main().catch(e=>{console.error(e);process.exitCode=1})
