const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m6','ui-'+Date.now()),executable=process.env.TRACE_PACKAGE_EXE||path.join(root,packageOutput+'/win-unpacked/Trace.exe')
fs.mkdirSync(folder,{recursive:true});const report={status:'running',folder,kind:'Packaged UI with process DPI and explicit renderer viewport; physical monitor placement separately',checks:[],cases:[]};let session
async function wait(fn,label){const t=Date.now();while(Date.now()-t<30000){const r=await fn();if(r)return r;await delay(20)}throw Error('Timeout '+label)}
async function fit(cdp,label,selectors){const r=await cdp.evaluate('('+function(selectors){const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,boxes:selectors.flatMap(s=>Array.from(document.querySelectorAll(s)).filter(visible).map(e=>{const r=e.getBoundingClientRect();return {selector:s,text:(e.textContent||e.getAttribute('aria-label')||'').slice(0,120),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}))}}+')('+JSON.stringify(selectors)+')')
 assert(r.scrollWidth<=r.width,label+' horizontal overflow')
 for(const b of r.boxes)assert(b.x>=-1&&b.y>=-1&&b.right<=r.width+1&&b.bottom<=r.height+1,label+' clipped '+JSON.stringify(b))
 return r}
async function point(cdp,selector,ratio){const p=await cdp.evaluate("(()=>{const r=document.querySelector("+JSON.stringify(selector)+").getBoundingClientRect();return {x:r.x+36+(r.width-46)*"+ratio+",y:r.y+r.height/2}})()");for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p})}
async function main(){
 for(const scale of [1,1.5,2])for(const [width,height]of [[1024,700],[1280,800]]){
  const name=width+'x'+height+'-dpi'+scale,dir=path.join(folder,name),takes=path.join(dir,'takes');fs.mkdirSync(takes,{recursive:true});const fixture=require('../m4/fixture.cjs')(takes)
  session=await launch(executable,dir,{scale,bounds:{x:20,y:20,width,height}});const {cdp}=session
  await wait(async()=>(await cdp.state()).active,'LIVE '+name)
  const info=(await cdp.request('app.info')).data
  // Explicit content viewport permits the 200% / 800 DIP case on a 1440 px monitor.
  // Physical window bounds and OS monitor scale are reported separately.
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:width-16,height:height-39,deviceScaleFactor:scale,mobile:false})
  await cdp.evaluate('window.__m6=null;window.trace.onSnapshot(s=>window.__m6=s);true')
  await cdp.request('view.settings',{targetEnabled:true,targetLufs:-18,waveGain:4})
  await wait(()=>cdp.evaluate('window.__m6?.active'),'LIVE snapshot')
  const live=await fit(cdp,name+' LIVE',['.topbar','.sourcebar select','.format-summary','.save-settings','.timeline-controls','.timeline-modes','.timeline-zoom-controls','.zoom-control','.transport','.transport-buttons','.transport button','.elapsed','.statusbar','.wave-panel canvas','.loudness-panel canvas'])
  assert.equal(live.dpr,scale);await cdp.screenshot(path.join(dir,'live.png'))
  await cdp.click('[aria-label="显示与帮助"]');await wait(()=>cdp.evaluate('!!document.querySelector("[role=dialog]")'),'display')
  await fit(cdp,name+' display',['.trace-modal'])
  await cdp.evaluate('document.querySelector("[aria-label=显示设置波形倍率]").focus()');await cdp.key('KeyR','r',82);assert(!(await cdp.state()).currentRecord)
  await cdp.screenshot(path.join(dir,'display.png'));await cdp.key('Escape','Escape',27)
  await wait(()=>cdp.evaluate('!document.querySelector("[role=dialog]")'),'close display')
  if(scale===1&&width===1024){
   await cdp.evaluate('document.activeElement?.blur()');await cdp.key('KeyR','r',82)
   const rec=await wait(async()=>(await cdp.state()).currentRecord,'R starts REC');await delay(1600)
   await point(cdp,'.wave-panel canvas',.25);await wait(async()=>(await cdp.state()).playback?.temporary,'REC historical')
   const fixed=(await cdp.state()).playback.positionFrame,before=await cdp.evaluate('window.__m6.recording.writtenFrames');await delay(400)
   assert.equal((await cdp.state()).playback.positionFrame,fixed)
   assert(BigInt(await cdp.evaluate('window.__m6.recording.writtenFrames'))>BigInt(before))
   assert.equal((await cdp.state()).currentRecord.id,rec.id)
   await cdp.screenshot(path.join(dir,'record-browse.png'));await cdp.click('.return-live')
   await wait(async()=>!(await cdp.state()).playback,'REC follow')
   await cdp.key('Escape','Escape',27);await wait(async()=>!(await cdp.state()).currentRecord,'Escape ends REC')
   report.checks.push('REC history browsing keeps its index fixed while the same take keeps writing; follow restores the live head')
  }
  await cdp.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
  const file=await wait(async()=>{const f=(await cdp.state()).playback;return f?.phase==='paused'?f:null},'FILE')
  await wait(()=>cdp.evaluate('window.__m6?.sourceId==='+JSON.stringify(file.id)+'&&window.__m6.fileView?.analysisPhase==="ready"'),'own FILE history')
  await cdp.request('playback.seek',{playbackId:file.id,positionFrame:'192000',resume:false})
  await cdp.request('playback.selection',{playbackId:file.id,startFrame:'96000',endFrame:'240000',loop:false})
  await wait(async()=>(await cdp.state()).playback.selectionAnalysis?.phase==='ready','selection')
  await delay(80)
  const fileLayout=await fit(cdp,name+' FILE',['.file-sourcebar','.file-title','.timeline-actions','.timeline-modes','.timeline-zoom-controls','.zoom-control','.follow-button','.loop-button','.transport','.transport-buttons','.selection-statistics','.wave-panel canvas','.loudness-panel canvas'])
  await cdp.screenshot(path.join(dir,'file.png'))
  if(scale===1&&width===1024){
   await cdp.request('playback.selection',{playbackId:file.id,startFrame:'0',endFrame:file.totalFrames,loop:false})
   await cdp.request('playback.window',{playbackId:file.id,startFrame:'0',endFrame:'48000',pixelWidth:900})
   assert.equal((await cdp.state()).playback.follow,false)
   await cdp.request('playback.seek',{playbackId:file.id,positionFrame:'0',resume:false});await cdp.request('playback.play',{playbackId:file.id});await delay(1400)
   assert.equal((await cdp.state()).playback.startFrame,'0')
   await cdp.click('.follow-button')
   await wait(async()=>BigInt((await cdp.state()).playback.startFrame)>0n,'follow advances window')
   await cdp.request('playback.pause',{playbackId:file.id});report.checks.push('Manual FILE browsing suspends follow; enabling follow moves both plots with the presentation head')
  }
  await cdp.click('.file-export-button');await wait(()=>cdp.evaluate('document.querySelector("#modal-title")?.textContent==="导出音频"'),'export modal')
  await fit(cdp,name+' export',['.trace-modal']);await cdp.screenshot(path.join(dir,'export.png'));await cdp.key('Escape','Escape',27)
  report.cases.push({name,info,live,fileLayout});report.checks.push(name+' LIVE/FILE/selection/display/export fit, own history ready and input shortcut guarded')
  await session.close();session=null
 }
 // Real window placement and restart restoration on each attached work area (without viewport emulation).
 const displays=report.cases[0].info.displays
 for(const display of displays){
  const dir=path.join(folder,'monitor-'+display.id),area=display.workArea,bounds={x:area.x+40,y:area.y+40,width:1024,height:700}
  session=await launch(executable,dir,{bounds});await wait(async()=>(await session.cdp.state()).active,'monitor launch')
  const info=(await session.cdp.request('app.info')).data,b=info.windowBounds
  assert(b.x>=area.x&&b.x+b.width<=area.x+area.width&&b.y>=area.y&&b.y+b.height<=area.y+area.height)
  await session.cdp.screenshot(path.join(dir,'window.png'));await session.close();session=null
  session=await launch(executable,dir);await wait(async()=>(await session.cdp.state()).active,'monitor restart')
  assert.deepEqual((await session.cdp.request('app.info')).data.windowBounds,b)
  await session.close();session=null;report.checks.push('Real monitor '+display.id+' placement and restart geometry restored')
 }
 report.status='pass'
}
main().catch(async e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1;if(session){await session.cdp.screenshot(path.join(folder,'failure.png')).catch(()=>{});report.state=await session.cdp.state().catch(()=>null)}}).finally(async()=>{if(session)await session.close().catch(console.error);fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m6/ui-latest.json'),JSON.stringify(report,null,2));console.log('M6_UI',report.status,report.checks.length)})
