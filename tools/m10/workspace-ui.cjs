const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m10/ui-'+Date.now()),takes=path.join(folder,'takes'),userData=path.join(folder,'user-data')
fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData);const fixture=require('../m4/fixture.cjs')(takes);fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const scale=Number(process.env.TRACE_UI_SCALE||1),report={folder,scale,status:'running',checks:[]};let session;const pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function wait(fn,label,max=30000){for(const t=Date.now();Date.now()-t<max;){const v=await fn();if(v)return v;await delay(25)}throw Error('Timeout '+label)}
async function start(){process.env.TRACE_TEST_GPU='1';return launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,recordDirectory:takes,scale,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})}
async function main(){
 session=await start();let c=session.cdp;await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:scale,mobile:false})
 await wait(async()=>Boolean((await c.state()).spectrogramSettings?.surface),'settings')
 await c.evaluate('window.__sp=null;window.__frame=null;window.trace.onSpectrogram(p=>window.__sp=p);window.trace.onSnapshot(s=>window.__frame=s);true')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback.analysisPhase==='ready','analysis')
 const point=()=>wait(async()=>{try{return await c.request('spectrogram.point',{queryId:await c.evaluate('window.__sp.requestId'),positionFrame:'96000',frequency:997})}catch(e){if(/STALE|Cannot/.test(String(e)))return false;throw e}},'current point')
 await wait(()=>c.evaluate('window.__sp?.phase==="ready"'),'2D');const before=(await point()).data
 await c.evaluate('([...document.querySelectorAll("[aria-label=声谱图维度] button")].find(b=>b.textContent==="3D").click())')
 await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.surfaceMode==="3d"&&Number(document.querySelector(".surface-gl")?.dataset.surfaceVertices)>0'),'3D surface')
 const after=(await point()).data;assert.equal(before.decibels,after.decibels);assert.equal(before.nativeFrame,after.nativeFrame)
 pass('2D and real 3D use the same file, FFT window and exact-bin values')
 const rect=await c.evaluate('(()=>{const r=document.querySelector(".surface-gl").getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5}})()'),initial=(await c.state()).spectrogramSettings.surface
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:rect.x+90,y:rect.y-45});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:rect.x+90,y:rect.y-45})
 await wait(async()=>(await c.state()).spectrogramSettings.surface.yaw!==initial.yaw,'camera drag');assert.equal((await c.state()).playback.positionFrame,'0')
 for(const title of ['正面','侧面','俯视','斜视','视角复位'])await c.evaluate('([...document.querySelectorAll(".surface-controls button")].find(b=>b.textContent==='+JSON.stringify(title)+').click())')
 await c.evaluate('(()=>{const e=document.querySelector(".surface-controls select");e.value="256";e.dispatchEvent(new Event("change",{bubbles:true}))})()');await wait(async()=>(await c.state()).spectrogramSettings.surface.detail===256,'detail')
 assert.equal((await point()).data.decibels,before.decibels);pass('Orbit, camera presets and display detail preserve the selected audio position and readings')
 const ruler=await c.evaluate('(()=>{const e=document.querySelector(".surface-ruler .time-ruler"),r=e.getBoundingClientRect(),x=r.x+36+(r.width-46)*.35,y=r.y+r.height*.5,hit=document.elementFromPoint(x,y);return {x,y,height:r.height,parentHeight:e.parentElement.getBoundingClientRect().height,hit:hit?.className,hitRuler:hit?.closest(".time-ruler")===e}})()');report.ruler=ruler;assert(ruler.hitRuler,JSON.stringify(ruler))
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:ruler.x,y:ruler.y});await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:ruler.x+100,y:ruler.y});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:ruler.x+100,y:ruler.y});await wait(async()=>Boolean((await c.state()).playback.selection),'shared selection')
 pass('The linear 3D time ruler creates the same shared selection')
 const shot=await c.send('Page.captureScreenshot',{format:'jpeg',quality:92,fromSurface:true});fs.writeFileSync(path.join(folder,'file-3d.jpg'),Buffer.from(shot.data,'base64'))
 await c.evaluate('window.__loss=document.querySelector(".surface-gl").getContext("webgl2").getExtension("WEBGL_lose_context");window.__loss.loseContext();true')
 await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.surfaceMode==="2d"'),'2D fallback');assert.equal((await point()).data.decibels,before.decibels)
 await c.evaluate('window.__loss.restoreContext();true');await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.surfaceMode==="3d"'),'restored graphics')
 pass('Forced GPU loss falls back to 2D and restores the same data')
 await c.request('view.live');await c.request('record.start');const take=(await c.state()).currentRecord
 await wait(()=>c.evaluate('window.__sp?.source.kind==="take"&&window.__sp.phase==="ready"'),'REC 3D');const frames=await c.evaluate('window.__frame.recording.writtenFrames')
 await c.evaluate('document.querySelector(".surface-gl").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext();true');await delay(600)
 assert.equal((await c.state()).currentRecord.id,take.id);assert(BigInt(await c.evaluate('window.__frame.recording.writtenFrames'))>BigInt(frames));await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'stop')
 pass('Graphics failure during REC keeps the original take writing and permits normal finalization')
 const saved=(await c.state()).spectrogramSettings;await session.close();session=null;session=await start();c=session.cdp;await wait(async()=>(await c.state()).spectrogramSettings.surface.detail===256,'persisted view');assert.deepEqual((await c.state()).spectrogramSettings,saved)
 for(const a of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,a.relativePath))).digest('hex'),a.hash)
 pass('3D settings survive restart and original audio hashes remain unchanged');report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.status='fail';report.closeError=String(e);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m10/ui-latest.json'),JSON.stringify(report,null,2));console.log('M10_UI',report.status,report.checks.length)})
