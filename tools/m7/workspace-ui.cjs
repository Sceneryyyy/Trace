const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const {launch,delay}=require('../m6/cdp.cjs')
const scale=Number(process.env.TRACE_UI_SCALE||1)
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m7/ui-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes');fs.mkdirSync(takes)
const fixture=require('../m4/fixture.cjs')(takes),userData=path.join(folder,'user-data');fs.mkdirSync(userData)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false,windowSeconds:30}))
const sources=fixture.document.assets.map(a=>path.join(fixture.folder,a.relativePath)),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),original=sources.map(hash)
const report={folder,status:'running',checks:[],scale,kind:'Actual isolated Electron renderer; generated file and WASAPI recording'}
let session
const wait=async(fn,label)=>{for(const begin=Date.now();Date.now()-begin<30000;){const v=await fn();if(v)return v;await delay(30)}throw Error('Timeout: '+label)}
const pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function start(){return launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{scale,userData,recordDirectory:takes,args:[...(process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')]),'--disable-backgrounding-occluded-windows','--trace-test-visible'],bounds:{x:20,y:20,width:1280,height:800}})}
async function capture(c,name){await delay(200);const splits=await c.evaluate('([...document.querySelectorAll(".instrument-split")].map(e=>{const r=e.getBoundingClientRect(),row=e.classList.contains("row");return {axis:row?"row":"column",available:row?r.width:r.height,used:[...e.children].reduce((a,x)=>a+(row?x.getBoundingClientRect().width:x.getBoundingClientRect().height),0)}}))');for(const s of splits)assert(Math.abs(s.available-s.used)<2,JSON.stringify(s));const dom=await c.evaluate('({text:document.body.innerText,width:innerWidth,height:innerHeight,panels:[...document.querySelectorAll("[data-instrument]")].map(e=>({id:e.dataset.instrument,...e.getBoundingClientRect().toJSON()}))})');fs.writeFileSync(path.join(folder,name+'-dom.json'),JSON.stringify(dom,null,2));try{await c.send('Page.bringToFront');const result=await c.send('Page.captureScreenshot',{format:'jpeg',quality:85,fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(folder,name+'.jpg'),Buffer.from(result.data,'base64'))}catch(e){(report.screenshotErrors??=[]).push({name,error:String(e)});console.log('SCREENSHOT_UNAVAILABLE',name)}}
async function main(){
 session=await start();let c=session.cdp
 await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:scale,mobile:false})
 await wait(()=>c.evaluate("document.querySelectorAll('[data-instrument]').length===4"),'four instruments')
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','file analysis')
 let p=(await c.state()).playback;await c.request('playback.seek',{playbackId:p.id,positionFrame:'192000',resume:false})
 await c.request('playback.selection',{playbackId:p.id,startFrame:'96000',endFrame:'240000',loop:false})
 await wait(()=>c.evaluate("document.querySelector('.workspace')?.dataset.historyPosition==='192000'"),'presentation')
 const before=(await c.state()).playback
 await capture(c,'file-default')
 await c.click('[aria-label="隐藏波形"]')
 await wait(async()=>((await c.state()).workspace.layout.hidden.includes('waveform')),'hide saved')
 assert.equal((await c.state()).playback.id,before.id);assert.equal((await c.state()).playback.positionFrame,before.positionFrame)
 assert.deepEqual((await c.state()).playback.selection,before.selection)
 assert.equal(await c.evaluate("document.querySelectorAll('.wave-panel canvas').length"),0);pass('Hiding a canvas keeps file, cursor and selection unchanged')
 await c.click('.instrument-chooser');await c.click('[aria-label="显示仪器"] label:nth-child(2) input');await c.click('.instrument-chooser')
 await c.click('[aria-label="最大化响度"]');assert.equal(await c.evaluate("document.querySelectorAll('[data-instrument]').length"),1)
 await c.click('[aria-label="响度设置"]')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"响度显示方式\"]');e.value='meters';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await wait(async()=>(await c.state()).workspace.layout.options.loudness==='meters','meter settings saved');await c.click('[aria-label="关闭仪器设置"]');await capture(c,'loudness-maximized')
 await c.click('[aria-label="恢复响度"]');assert.equal(await c.evaluate("document.querySelectorAll('[data-instrument]').length"),4);pass('Instrument settings, maximization and restoration keep one shared history source')
 await c.click('[aria-label="电平设置"]')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=电平读数]');e.value='rms';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await wait(async()=>(await c.state()).workspace.layout.options.levelReadout==='rms','RMS mode')
 const meter=await c.evaluate("(()=>{const e=document.querySelector('[data-instrument=levels] [role=meter]');return {name:e.getAttribute('aria-label'),value:e.getAttribute('aria-valuenow'),text:e.getAttribute('aria-valuetext')}})()")
 assert(meter.name.includes('RMS'));assert(meter.text.includes('dBFS'));assert(Number(meter.value)<-22)
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=电平读数]');e.value='both';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.click('[aria-label="关闭仪器设置"]');pass('Meter accessibility follows the visible RMS or peak mode')
 await c.click('.edit-layout')
 await wait(async()=>!(await c.state()).workspace.locked,'edit')
 const oldRatio=(await c.state()).workspace.layout.tree.ratio
 await c.evaluate("document.querySelector('[role=separator]').focus()");await c.key('ArrowRight','ArrowRight',39)
 await wait(async()=>(await c.state()).workspace.layout.tree.ratio>oldRatio,'keyboard resize')
 const grip=await c.evaluate("(()=>{const r=document.querySelector('[role=separator]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 await c.evaluate('window.__pointerEvents=[];for(const k of ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture"])document.addEventListener(k,e=>{window.__lastPointerTarget=e.target;window.__lastPointerId=e.pointerId;window.__pointerEvents.push({type:k,target:e.target.className,x:e.clientX,y:e.clientY,buttons:e.buttons,button:e.button,pointerId:e.pointerId})},true);true')
 const ratioBefore=(await c.state()).workspace.layout.tree.ratio
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...grip})
 report.captureAfterDown=await c.evaluate('({id:window.__lastPointerId,connected:window.__lastPointerTarget?.isConnected,captured:window.__lastPointerTarget?.hasPointerCapture(window.__lastPointerId),same:window.__lastPointerTarget===document.querySelector("[role=separator]"),html:window.__lastPointerTarget?.outerHTML})');
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:grip.x+45,y:grip.y})
 await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:grip.x+45,y:grip.y})
 await delay(100);report.pointer={grip,before:ratioBefore,workspace:(await c.state()).workspace,events:await c.evaluate('window.__pointerEvents'),errors:c.events.filter(e=>e.method==='Runtime.exceptionThrown')};
 await wait(async()=>(await c.state()).workspace.layout.tree.ratio>ratioBefore,'pointer resize')
 const treeBefore=JSON.stringify((await c.state()).workspace.layout.tree)
 const target=await c.evaluate("(()=>{const r=document.querySelector('[data-instrument=loudness]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom-12}})()")
 const data={items:[{mimeType:'application/x-trace-instrument',data:'levels'}],dragOperationsMask:1}
 for(const type of ['dragEnter','dragOver','drop'])await c.send('Input.dispatchDragEvent',{type,...target,data})
 await wait(async()=>JSON.stringify((await c.state()).workspace.layout.tree)!==treeBefore,'drag docking')
 assert.equal((await c.state()).playback.positionFrame,before.positionFrame);pass('Pointer divider resize and browser drag/drop docking preserve the cursor')
 await c.click('[aria-label="电平设置"]');await c.click('.instrument-settings .layout-actions button:last-child')
 await wait(async()=>(await c.state()).workspace.layout.tree.first!=='levels','dock using menu')
 assert.equal((await c.state()).playback.positionFrame,before.positionFrame);pass('Keyboard divider and menu docking change layout without seeking')
 await c.click('.manage-layouts');await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"布局名称\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'检查工作台');e.dispatchEvent(new Event('input',{bubbles:true}))})()")
 await c.click('.layout-presets .layout-actions button:first-child')
 await wait(async()=>(await c.state()).workspace.presets.length===1,'preset save')
 const saved=(await c.state()).workspace.presets[0]
 await c.click('.manage-layouts')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"工作台布局\"]');e.value='metering';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await wait(async()=>(await c.state()).workspace.activePreset==='metering','factory preset')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"工作台布局\"]');e.value="+JSON.stringify(saved.id)+";e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await wait(async()=>(await c.state()).workspace.activePreset===saved.id,'custom preset')
 assert.deepEqual((await c.state()).workspace.layout,saved.layout);pass('Custom preset saves and recalls independently of built-in layouts')
 for(const id of ['levels','waveform','history','loudness'])await c.click('[data-instrument="'+id+'"] .instrument-heading button:last-child')
 await wait(()=>c.evaluate("!!document.querySelector('.empty-workspace')"),'empty')
 await c.click('.empty-workspace button');await wait(()=>c.evaluate("document.querySelectorAll('[data-instrument]').length===4"),'restore all')
 pass('All instruments can be hidden and recovered with a visible action')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='recorder';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await wait(async()=>(await c.state()).workspace.activePreset==='recorder','default restored')
 await delay(200)
 for(const [width,height] of [[1008,661],[1264,761]]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});await delay(150)
  const geometry=await c.evaluate("({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('[data-instrument],.transport,.wave-panel canvas,.loudness-panel canvas')].map(e=>({name:e.dataset.instrument||e.className||e.tagName,...e.getBoundingClientRect().toJSON()}))})")
  assert(geometry.scroll<=width);for(const b of geometry.boxes){assert(b.width>25&&b.height>25,JSON.stringify(b));assert(b.x>=0&&b.right<=width+1&&b.bottom<=height+1,JSON.stringify(b))}
  report['geometry'+width]=geometry;await capture(c,'layout-'+width)
 }
 pass('Default panels, wave/history canvases and transport fit small and standard windows')
 await wait(()=>{const pref=JSON.parse(fs.readFileSync(path.join(userData,'trace-settings.json')));return pref.workspace?.activePreset==='recorder'},'persist')
 await session.close();session=null;session=await start();c=session.cdp
 await wait(async()=>(await c.state()).workspace?.presets.length===1,'restart')
 assert.equal((await c.state()).monitoringRequested,false);assert.equal((await c.state()).workspace.activePreset,'recorder')
 pass('Restart restores workspace and user presets without changing monitoring intent')
 assert((await c.state()).deviceId,'WASAPI device required for lifecycle check')
 await c.evaluate('window.__m7Frame=null;window.trace.onSnapshot(s=>window.__m7Frame=s);true')
 await c.request('record.start');const take=(await c.state()).currentRecord;assert(take)
 await wait(()=>c.evaluate('BigInt(window.__m7Frame?.recording?.writtenFrames||0)>0n'),'recorded frames')
 const a=await c.evaluate('window.__m7Frame.recording.writtenFrames')
 await c.click('[aria-label="隐藏波形"]')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"工作台布局\"]');e.value='metering';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.click('.edit-layout');await delay(1200)
 const b=(await c.state()).currentRecord
 assert.equal(b.id,take.id);const written=await c.evaluate('window.__m7Frame.recording.writtenFrames');assert(BigInt(written)>BigInt(a));report.recordingFrames={before:a,after:written};assert.equal((await c.state()).monitoringRequested,false)
 await capture(c,'recording-layout');await c.request('record.stop')
 await wait(async()=>!(await c.state()).currentRecord,'record stop')
 assert.equal((await c.state()).active,false);assert.equal((await c.state()).monitoringRequested,false)
 pass('Real WASAPI take continues through hide/preset/edit and restores prior monitoring intent')
 assert.deepEqual(sources.map(hash),original);pass('Original fixture files remain unchanged')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{
 if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1})
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m7/ui-latest.json'),JSON.stringify(report,null,2));console.log('M7_UI',report.status,report.checks.length)
})
