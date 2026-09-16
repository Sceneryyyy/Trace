const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process')
const {launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/iteration/one-'+Date.now()),takes=path.join(folder,'takes')
fs.mkdirSync(takes,{recursive:true})
const fixture=require('../m4/fixture.cjs'),short=fixture(takes)
let body=fs.readFileSync(path.join(root,'tools/m4/fixture.cjs'),'utf8').replace("'synthetic-playback'","'synthetic-long'").replace("'M4_Playback_Test'","'Iteration_Long_120s'").replace('frames=rate*8','frames=rate*120').replace('[rate*3,rate*2,rate*3]','[rate*45,rate*30,rate*45]').replace("'8000000000'","'120000000000'").replace("'180000000'","'1300000000'")
const m={exports:{}};vm.runInNewContext(body,{require,module:m,Buffer});const long=m.exports(takes)
for(const asset of short.document.assets){
 const input=path.join(short.folder,asset.relativePath),out=input.replace('.wav','-16.wav')
 execFileSync(path.join(root,'.tools/ffmpeg/bin/ffmpeg.exe'),['-v','error','-i',input,'-c:a','pcm_s16le',out],{windowsHide:true})
 asset.relativePath=asset.relativePath.replace('.wav','-16.wav');asset.encoding='pcm16'
 asset.hash=require('crypto').createHash('sha256').update(fs.readFileSync(out)).digest('hex')
}
short.document.regions[0].encoding='pcm16';short.document.preset.encoding='pcm16'
fs.writeFileSync(path.join(short.folder,'session.json'),JSON.stringify(short.document))
const userData=path.join(folder,'user-data');fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}))
const report={folder,status:'running',fixtureOnly:true,checks:[]};let session
const pass=name=>{report.checks.push(name);console.log('PASS',name)}
const wait=async(fn,label,max=30000)=>{for(const t=Date.now();Date.now()-t<max;){const v=await fn();if(v)return v;await delay(25)}throw Error('Timeout '+label)}
async function main(){
 const packaged=process.env.TRACE_PACKAGE_EXE,exe=packaged||require('electron')
 session=await launch(exe,folder,{userData,args:[...(packaged?[]:[path.join(root,'out-trace/main/index.js')]),'--disable-gpu','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']})
 const c=session.cdp;await wait(async()=>((await c.state()).recordings||[]).length===2,'library')
 await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:1,mobile:false})
 await c.request('file.open',{takeId:long.document.sessionId,role:'source'});let p=(await c.state()).playback
 await c.request('job.cancel',{jobId:p.analysisId});await wait(async()=>((await c.state()).playback.analysisPhase==='cancelled'),'cancel')
 await c.request('playback.seek',{playbackId:p.id,positionFrame:'2496000',resume:false})
 await c.request('playback.window',{playbackId:p.id,startFrame:'2400000',endFrame:'2640000',pixelWidth:900})
 await c.request('playback.selection',{playbackId:p.id,startFrame:'2448000',endFrame:'2544000',loop:false})
 await wait(()=>c.evaluate("document.querySelector('.analysis-feedback')?.textContent.includes('分析已取消')"),'cancel feedback')
 const before=(await c.state()).playback;assert(!(await c.evaluate("document.querySelector('.statusbar')?.textContent||''")).includes('分析中'));pass('Cancelled analysis is explicit on the canvas')
 await c.click('.analysis-feedback button');await wait(async()=>((await c.state()).playback.analysisPhase==='ready'),'retry')
 p=(await c.state()).playback;assert.equal(p.id,before.id);assert.notEqual(p.analysisId,before.analysisId);assert.equal(p.positionFrame,before.positionFrame);assert.deepEqual(p.selection,before.selection);assert.equal(p.startFrame,before.startFrame)
 await wait(()=>c.evaluate("!document.querySelector('.analysis-feedback')"),'feedback cleared');pass('Canvas retry preserves file identity, cursor, selection and window')
 await c.evaluate('document.activeElement?.blur()')
 await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d',windowsVirtualKeyCode:68,modifiers:2});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d',windowsVirtualKeyCode:68,modifiers:2})
 await wait(async()=>(await c.state()).playback.selection===null,'clear selection')
 assert.equal((await c.state()).playback.loop,false);await wait(()=>c.evaluate("!document.querySelector('.selection-statistics')"),'statistics clear');pass('Ctrl+D clears range, loop and statistics')
 const r=await c.evaluate("(()=>{const r=document.querySelector('.wave-panel canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',...r,deltaY:160,deltaX:0,modifiers:8})
 await wait(async()=>((await c.state()).playback.startFrame!==p.startFrame),'pan')
 let shifted=(await c.state()).playback;assert.equal(shifted.positionFrame,p.positionFrame);assert.equal(BigInt(shifted.endFrame)-BigInt(shifted.startFrame),240000n);assert.equal(shifted.follow,false);pass('Shift+wheel pans the viewport without moving history cursor')
 const start=BigInt(shifted.startFrame);await c.key('PageDown','PageDown',34);await wait(async()=>BigInt((await c.state()).playback.startFrame)===start+240000n,'page down');pass('PageDown moves one window with keyboard')
 await c.request('playback.selection',{playbackId:p.id,startFrame:'2448000',endFrame:'2544000',loop:false})
 for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'right',clickCount:1,...r})
 await wait(()=>c.evaluate("!!document.querySelector('[role=menu]')"),'menu')
 await c.click('[role=menuitem]');await wait(async()=>(await c.state()).playback.selection===null,'menu clear');pass('Context menu clears selection')
 await c.request('file.open',{takeId:short.document.sessionId,role:'source'});await wait(async()=>((await c.state()).playback.analysisPhase==='ready'),'PCM16')
 await wait(()=>c.evaluate("document.querySelector('.asset-format')?.textContent.includes('16-bit PCM')"),'format')
 report.format=await c.evaluate("({device:document.querySelector('.format-summary').textContent,file:document.querySelector('.asset-format').textContent})");pass('PCM16 file metadata is separate from capture format')
 await c.request('playback.volume',{playbackId:(await c.state()).playback.id,gain:0})
 await c.click('.return-live');await wait(async()=>(await c.state()).active,'live')
 await delay(2200);await c.evaluate('document.activeElement?.blur()');await c.key('Space',' ',32)
 await wait(async()=>((await c.state()).playback?.outputReady),'Space cache play');assert((await c.state()).playback.temporary)
 await c.key('Space',' ',32);await wait(async()=>!(await c.state()).playback.outputReady,'Space pause');pass('Space starts memory replay and pauses using the same transport behavior')
 await c.request('file.open',{takeId:short.document.sessionId,role:'source'});await wait(async()=>((await c.state()).playback.analysisPhase==='ready'),'final file')
 for(const width of [1008,1264]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:width===1008?661:761,deviceScaleFactor:1,mobile:false});await delay(100)
  const layout=await c.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,boxes:['.wave-panel canvas','.loudness-panel canvas','.timeline-zoom-controls','.transport-buttons','.asset-format'].map(s=>({selector:s,...document.querySelector(s).getBoundingClientRect().toJSON()}))})")
  assert(layout.scroll<=width);for(const b of layout.boxes){assert(b.width>0&&b.height>0);assert(b.x>=0&&b.right<=width)}report['layout'+width]=layout
 }pass('Small and standard workbench layout fits')
 fs.writeFileSync(path.join(folder,'dom.json'),JSON.stringify(await c.evaluate('({text:document.body.innerText,html:document.querySelector(".workspace").outerHTML})'),null,2))
 try{const capture=await c.send('Page.captureScreenshot',{format:'jpeg',quality:80,fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(folder,'workbench.jpg'),Buffer.from(capture.data,'base64'));report.screenshot='workbench.jpg'}catch(e){report.screenshotError=String(e)}
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/iteration/one-latest.json'),JSON.stringify(report,null,2));console.log('ITERATION_ONE',report.status,report.checks.length)})
