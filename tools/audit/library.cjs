// Actual React/CSS and renderer command orchestration, with explicitly simulated
// IPC, files and devices. This is not Windows playback, WASAPI or disk acceptance.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{build}=require('esbuild'),{browserPage}=require('./browser.cjs')
const {execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..')
async function main(){
 const base=path.join(root,'artifacts/library');await fs.mkdir(base,{recursive:true});const folder=await fs.mkdtemp(path.join(base,'browser-'))
 const source=path.join(folder,'probe.tsx')
 await fs.writeFile(source,`
 import React from 'react';import {createRoot} from 'react-dom/client';import App from '${root}/src/trace/renderer/App';import '${root}/src/trace/renderer/styles.css';import '${root}/src/trace/renderer/instruments.css';import {applyTheme} from '${root}/src/trace/renderer/themeRuntime';import {defaultWorkspace} from '${root}/src/trace/workspace';import {defaultDisplaySettings} from '${root}/src/trace/displaySettings';
 const format={sampleRate:48000,channelCount:2,containerBits:32,validBits:32,encoding:'ieee-float',channelMask:3,blockAlign:8};
 const recordings=n=>Array.from({length:n},(_,i)=>({id:'rec-'+String(i).padStart(5,'0'),name:'录音 '+String(i).padStart(4,'0'),createdAt:'2026-10-15T10:00:00Z',status:'ready',frames:String((i+1)*48000),sampleRate:48000,encoding:'pcm24',segmentCount:1,error:null,continuity:'complete',roles:['source'],regionCount:1}));
 let state={revision:1,eventSequence:1,active:true,monitoringRequested:true,deviceId:'demo',windowSeconds:10,error:null,windowVisible:true,instrumentTheme:'trace-green',workspace:defaultWorkspace(),displaySettings:defaultDisplaySettings,recordings:recordings(5000),analysisJobs:[],exportJobs:[],reportJobs:[],imports:[{id:'import-1',name:'导入示例',sourceName:'example.wav',createdAt:'2026-10-15T10:00:00Z',status:'ready',phase:'ready',fraction:1,hasCache:true,format:{format:'wav',sampleRate:48000,channelCount:2,encoding:'pcm24'},frames:'480000',revision:1,error:null}],recordSettings:{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'},recordDirectory:'模拟录音目录 · 浏览器测试'};
 const subscribers=new Set();const calls=[];let releaseOpen,hold=false,failOpen=false;
 const publish=()=>{state={...state,revision:state.revision+1};for(const fn of subscribers)fn(structuredClone(state))};
 window.__state=()=>structuredClone(state);window.__calls=calls;window.__publish=patch=>{state={...state,...patch};publish()};window.__count=n=>{state={...state,recordings:recordings(n)};publish()};window.__hold=()=>{hold=true};window.__release=()=>releaseOpen?.();window.__fail=()=>{failOpen=true};
 window.trace={onState:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn)},onSnapshot:()=>()=>{},onSpectrogram:()=>()=>{},onReference:()=>()=>{},importFiles:async()=>({accepted:[],errors:[]}),request:async req=>{
  calls.push({command:req.command,payload:structuredClone(req.payload)});let data;
  if(req.command==='devices.list')data=[{id:'demo',label:'模拟设备 · 无真实音频',isDefault:true,supported:true,error:null,format}];
  else if(req.command==='file.open'){
   if(hold){hold=false;await new Promise(r=>releaseOpen=r)}
   if(failOpen){failOpen=false;return {requestId:req.requestId,ok:false,state:structuredClone(state),error:{code:'FILE_MISSING',message:'FILE_MISSING'}}}
   const src=req.payload,item=[...state.recordings,...state.imports].find(t=>t.id===src.takeId);if(!item)throw Error('UNKNOWN_FIXTURE');
   state={...state,playback:{...src,id:crypto.randomUUID(),label:item.name,phase:'paused',error:null,positionFrame:'0',totalFrames:item.frames,sampleRate:48000,channelCount:2,generation:'1',analysisId:'mock-analysis',analysisPhase:'analyzing',gain:1,loop:false,follow:false,selection:null,startFrame:'0',endFrame:item.frames,outputReady:false}};publish();
  }else if(req.command==='playback.play'||req.command==='playback.pause'){if(req.payload.playbackId!==state.playback?.id)throw Error('STALE_FIXTURE_PLAYBACK');state={...state,playback:{...state.playback,outputReady:req.command==='playback.play',phase:req.command==='playback.play'?'playing':'paused'},active:req.command==='playback.pause'};publish()}
  else if(req.command==='library.storage')data={audioBytes:'1024',cacheBytes:'2048',incomplete:false};
  else if(req.command==='export.describe')data={label:'模拟来源',sampleRate:48000,frames:'480000',assetFormat:{format:'wav',sampleRate:48000,channelCount:2,encoding:'pcm24'}};
  else if(req.command==='library.rename'){state={...state,recordings:state.recordings.map(t=>t.id===req.payload.takeId?{...t,name:req.payload.name}:t)};publish()}
  else if(req.command==='record.start'){state={...state,currentRecord:{id:'mock-rec',phase:'recording'}};publish()}
  else if(req.command==='record.stop'){state={...state,currentRecord:null};publish()}
  return {requestId:req.requestId,ok:true,state:structuredClone(state),data};
 }};
 applyTheme('trace-green');createRoot(document.getElementById('root')).render(<App/>);
 `)
 await build({entryPoints:[source],outfile:path.join(folder,'probe.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.woff':'dataurl','.woff2':'dataurl'}})
 const product=await fs.readFile(path.join(root,'src/trace/renderer/index.html'),'utf8'),csp=product.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0]
 await fs.writeFile(path.join(folder,'index.html'),'<!doctype html><meta charset="utf-8">'+csp+'<link rel="stylesheet" href="probe.css"><div id="root"></div><script src="probe.js"></script>')
 const report={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),scope:'Actual React renderer, production CSP, simulated IPC/devices/metadata only; no native/Windows/disk/audio acceptance',checks:[],sizes:[],screenshots:[]}
 await browserPage(folder,'index.html',async c=>{
  const ev=c.evaluate,wait=c.wait
  const click=async selector=>{await wait('!!document.querySelector('+JSON.stringify(selector)+')');const p=await ev('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');n.scrollIntoView({block:"nearest"});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await c.delay(35)}
  const input=async(selector,value)=>{await ev('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,'+JSON.stringify(value)+');n.dispatchEvent(new Event("input",{bubbles:true}))})()');await c.delay(40)}
  const key=async(key,code=key,modifiers=0)=>{await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await c.delay(25)}
  const shot=async name=>{const r=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),p=path.join(base,name+'.png');await fs.writeFile(p,Buffer.from(r.data,'base64'));report.screenshots.push(path.relative(root,p))}
  const count=command=>ev('window.__calls.filter(c=>c.command==='+JSON.stringify(command)+').length')
  const row='[data-library-row="rec-00000"]',play='[data-library-play="rec-00000"]'
  await wait('document.querySelector("[data-open-files]")?.innerText.includes("5001")')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false})
  await click('[data-open-files]');await wait('!document.querySelector(".library-panel").hidden')
  assert.equal(await ev('document.querySelector(".library-panel").getAttribute("role")'),'complementary')
  assert.equal(await ev('document.querySelectorAll("[data-library-row]").length'),50)
  assert.equal(await ev('(()=>{const a=document.querySelector(".trace-main").getBoundingClientRect(),b=document.querySelector(".library-panel").getBoundingClientRect();return a.right<=b.left+1&&b.top===0&&b.bottom<=innerHeight&&a.width>=980})()'),true,'wide panel must sit beside the complete workbench, not below it')
  const initial=await count('file.open');await click(row);assert.equal(await count('file.open'),initial);assert.equal(await count('playback.play'),0)
  report.checks.push('Single click selects only; wide sidebar coexists with workbench; 50 mounted rows')
  await click('[data-take-open]');await wait('window.__state().playback?.takeId==="rec-00000"');assert.equal(await count('playback.play'),0)
  assert.equal(await ev('document.querySelector(".library-panel").hidden'),false)
  await ev('window.__publish({playback:{...window.__state().playback,positionFrame:"12000",selection:{startFrame:"1000",endFrame:"24000"}}})')
  const opened=await count('file.open');await click(play);await wait('window.__state().playback.outputReady');await click(play);await wait('!window.__state().playback.outputReady')
  assert.equal(await count('file.open'),opened);assert.equal(await ev('window.__state().playback.positionFrame'),'12000');assert.equal(await ev('window.__state().playback.selection.endFrame'),'24000')
  report.checks.push('Inspect stays paused; play/pause uses real returned context and preserves selection/cursor')
  await ev('window.__hold()');await click('[data-library-play="rec-00001"]');await wait('window.__calls.some(c=>c.command==="file.open"&&c.payload.takeId==="rec-00001")')
  await click('[data-library-play="rec-00002"]');await ev('window.__release()');await wait('window.__state().playback?.takeId==="rec-00002"&&window.__state().playback.outputReady')
  const calls=await ev('window.__calls');const aOpen=calls.findIndex(c=>c.command==='file.open'&&c.payload.takeId==='rec-00001'),bOpen=calls.findIndex((c,i)=>i>aOpen&&c.command==='file.open'&&c.payload.takeId==='rec-00002');assert.equal(calls.slice(aOpen+1,bOpen).filter(c=>c.command==='playback.play').length,0)
  report.checks.push('Rapid A→B supersedes pending autoplay; only newest source is started')
  await click('[data-row-more="rec-00002"]');await wait('!!document.querySelector("[role=menu]")');await click('[role=menu] [data-take-export]');await wait('!!document.querySelector("[data-export-submit]")');assert.equal(await ev('document.querySelector(".library-panel").inert'),true)
  await key('Escape');await wait('!document.querySelector(".trace-modal")');assert.equal(await ev('document.activeElement.dataset.rowMore'),'rec-00002')
  report.checks.push('Export dialog isolates sidebar focus and returns focus to invoking row')
  await input('[aria-label="搜索音频文件"]','录音 00');await click('.library-pagination button:last-child');await ev('document.querySelector(".library-scroll").scrollTop=220');await c.delay(40)
  const scroll=await ev('document.querySelector(".library-scroll").scrollTop');await click('[aria-label="关闭音频文件"]');await click('[data-open-files]')
  assert.equal(await ev('document.querySelector("[aria-label=\\"搜索音频文件\\"]").value'),'录音 00');assert.equal(await ev('document.querySelector(".library-pagination span").textContent'),'51–100 / 100');assert.equal(await ev('document.querySelector(".library-scroll").scrollTop'),scroll)
  report.checks.push('Closing/reopening retains query, selected row, page and scroll')
  await click('[aria-label="定位当前文件"]');await wait('document.activeElement.dataset.libraryRow==="rec-00002"')
  await input('[aria-label="搜索音频文件"]','不存在');await click('[aria-label="定位当前文件"]');await wait('document.activeElement.dataset.libraryRow==="rec-00002"');assert.equal(await ev('document.querySelector("[aria-label=\\"搜索音频文件\\"]").value'),'')
  report.checks.push('Locate current crosses pages and explicitly clears hiding filters')
  await click('.library-categories button:nth-child(2)');await wait('!!document.querySelector("[data-import-id]")');await click('[data-import-id]');await click('[data-import-open]');await wait('window.__state().playback.takeId==="import-1"')
  await click('.library-categories button:first-child')
  await ev('window.__publish({recordings:[{...window.__state().recordings[0],continuity:"estimated-silence",name:"估计静音示例"},{...window.__state().recordings[1],id:"unknown",continuity:"unknown",name:"完整性未知示例"},{...window.__state().recordings[2],id:"broken",status:"unreadable",createdAt:"",roles:[],error:"BROKEN",name:"损坏记录示例"}]})')
  await wait('document.querySelector(".library-scroll").textContent.includes("包含估计静音")');assert.match(await ev('document.querySelector(".library-scroll").textContent'),/采集完整性未知/)
  await click('[data-library-row="broken"]');await click('.library-selected button[aria-expanded]');assert.match(await ev('document.querySelector(".library-detail-content").textContent'),/音频文件仍保留/)
  report.checks.push('Import category uses existing source path; unreadable/estimated/unknown quality remain visible')
  await click('[data-library-row="rec-00000"]');await click('.library-selected button:last-child');await wait('window.__state().playback.takeId==="rec-00000"')
  await ev('window.__publish({playback:{...window.__state().playback,role:"export",exportId:"alternate-output",outputReady:true,phase:"playing",positionFrame:"12000"}})')
  const versionOpen=await count('file.open');await click('[data-library-play="rec-00000"]');await wait('!window.__state().playback.outputReady');assert.equal(await count('file.open'),versionOpen);assert.equal(await ev('window.__state().playback.exportId'),'alternate-output')
  report.checks.push('Row audition preserves an explicitly loaded alternate export instead of reopening preferred source')
  await click('[data-library-row="rec-00000"]');await click('.library-selected button[aria-expanded]');
  // It may already be expanded; make sure it is visible before testing a form.
  if(!await ev('!!document.querySelector(".library-detail-content")'))await click('.library-selected button[aria-expanded]')
  await ev('[...document.querySelectorAll(".library-detail-content button")].find(b=>b.textContent==="重命名").click()');await wait('!!document.querySelector("[aria-label=录音名称]")')
  const playBeforeTyping=await count('playback.play'),recordBeforeTyping=await count('record.start');await click('[aria-label="录音名称"]');await key('r','KeyR');await key(' ','Space');assert.equal(await count('playback.play'),playBeforeTyping);assert.equal(await count('record.start'),recordBeforeTyping)
  await key('Escape');assert.equal(await ev('!!document.querySelector("[aria-label=录音名称]")'),false);assert.equal(await ev('document.querySelector(".library-panel").hidden'),false)
  await ev('document.querySelector("[data-library-row=rec-00000]").focus()');await key('End');assert.equal(await ev('document.activeElement.dataset.libraryRow'),'broken')
  await key('F10','F10',8);await wait('!!document.querySelector("[role=menu]")');await key('Escape');assert.equal(await ev('document.activeElement.dataset.rowMore'),'broken')
  await ev('document.querySelector(".file-home").focus()');await key(' ','Space');await wait('window.__state().playback.outputReady');await key(' ','Space');await wait('!window.__state().playback.outputReady')
  report.checks.push('Rename input suppresses global R/Space; Escape cancels form; row End and keyboard context menu keep local focus')

  const beforeFailure=await count('playback.play');await ev('window.__fail()');await click('[data-library-play="unknown"]');await wait('!!document.querySelector(".library-panel [role=alert]")');assert.equal(await count('playback.play'),beforeFailure);await click('[aria-label="关闭列表提示"]');report.checks.push('Failed opening stays visible inside the drawer, sends no play and can be dismissed')
  await ev('window.__publish({currentRecord:{id:"rec",phase:"recording"}})');assert.equal(await ev('[...document.querySelectorAll("[data-library-play]")].every(b=>b.disabled)'),true)
  report.checks.push('REC leaves list browsable and disables audition')
  await ev('window.__publish({currentRecord:null})')
  for(const size of [50,500,5000]){
   const result=await ev('(async()=>{const start=performance.now();window.__count('+size+');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {items:'+size+',settleMs:performance.now()-start,rows:document.querySelectorAll("[data-library-row]").length,panelNodes:document.querySelector(".library-panel").querySelectorAll("*").length}})()')
   assert.equal(result.rows,50);report.sizes.push(result)
   await click('.library-pagination button:last-child');assert.equal(await ev('document.querySelectorAll("[data-library-row]").length'),50)
  }
  report.checks.push('50/500/5000 metadata items keep mounted rows bounded at 50')
  await click('[aria-label="定位当前文件"]');await click('.library-categories button:first-child');await click('[data-library-row="rec-00000"]');if(await ev('!!document.querySelector(".library-detail-content")'))await click('.library-selected button[aria-expanded]');await shot('library-wide')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1024,height:700,deviceScaleFactor:1.5,mobile:false});await wait('document.querySelector(".library-panel").getAttribute("role")==="dialog"')
  assert.equal(await ev('document.querySelector(".trace-main").inert'),true)
  await ev('document.querySelector("[aria-label=\\"关闭音频文件\\"]").focus()');await key('Tab','Tab',8);assert.equal(await ev('document.querySelector(".library-panel").contains(document.activeElement)'),true)
  await shot('library-drawer-150')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1024,height:700,deviceScaleFactor:2,mobile:false});assert.equal(await ev('document.querySelector(".library-panel").getBoundingClientRect().right<=innerWidth'),true);await shot('library-drawer-200')
  await key('Escape');await wait('document.querySelector(".library-panel").hidden');assert.equal(await ev('document.activeElement.hasAttribute("data-open-files")'),true)
  report.checks.push('Narrow drawer isolates background, traps focus, Escape closes and restores trigger (simulated 150% raster scale)')
 })
 report.status='passed';await fs.writeFile(path.join(base,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1})
