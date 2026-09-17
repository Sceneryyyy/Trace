// A component-only fixture. The bridge is explicitly fake; no audio or application storage.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=process.env.TRACE_BOUNDARY_FIXTURE||path.join(root,'artifacts/public-beta/react-'+Date.now())
if(!process.versions.electron){
 fs.mkdirSync(folder,{recursive:true})
 require('esbuild').buildSync({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RecoveryBoundary}from'./src/trace/renderer/RecoveryBoundary';window.calls=[];window.trace={onState:()=>()=>{},request:async r=>{window.calls.push(r);return {ok:true,state:{revision:1,currentRecord:{phase:'recording'}}}}};function Broken(){throw Error('PRIVATE_COMPONENT_TEXT')}createRoot(document.getElementById('root')).render(<RecoveryBoundary><Broken/></RecoveryBoundary>);`,resolveDir:root,loader:'tsx'},outfile:path.join(folder,'fixture.js'),bundle:true,platform:'browser'})
 fs.writeFileSync(path.join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><title>TEST ONLY React boundary</title><div id="root"></div><script src="fixture.js"></script>')
 const env={...process.env,TRACE_BOUNDARY_FIXTURE:folder};delete env.ELECTRON_RUN_AS_NODE
 const r=spawnSync(require('electron'),[__filename],{env,windowsHide:true,encoding:'utf8',timeout:20000});console.log(r.stdout||'');if(r.status!==0)console.error(r.stderr||r.error);process.exitCode=r.status||r.error?1:0
}else{
 const {app,BrowserWindow}=require('electron');let w
 app.setPath('userData',path.join(folder,'user-data'));app.disableHardwareAcceleration()
 app.whenReady().then(async()=>{
  w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await w.loadFile(path.join(folder,'index.html'))
  let ready=false;for(let i=0;i<100;i++){ready=await w.webContents.executeJavaScript('Boolean(document.querySelector(".recovery-screen")&&window.calls.some(r=>r.command==="app.rendererFault"))');if(ready)break;await new Promise(r=>setTimeout(r,20))}assert(ready)
  const result=await w.webContents.executeJavaScript('({text:document.body.innerText,calls:window.calls})')
  assert(result.text.includes('录音任务仍在后台'));assert(!JSON.stringify(result.calls).includes('PRIVATE_COMPONENT_TEXT'))
  assert.deepEqual(result.calls.find(r=>r.command==='app.rendererFault').payload,{kind:'react'})
  fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({status:'pass',fixtureOnly:true,kind:'React render error boundary and private-message exclusion'},null,2));console.log('REACT_BOUNDARY pass',folder);w.destroy();app.exit(0)
 }).catch(e=>{console.error(e);w?.destroy();app.exit(1)})
}
