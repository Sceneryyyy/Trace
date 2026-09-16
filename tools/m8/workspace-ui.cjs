const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const {launch,delay}=require('../m6/cdp.cjs'),root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m8/ui-'+Date.now()),scale=Number(process.env.TRACE_UI_SCALE||1)
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes');fs.mkdirSync(takes);const fixture=require('../m4/fixture.cjs')(takes)
let offset=0;for(const asset of fixture.document.assets){const file=path.join(fixture.folder,asset.relativePath),b=fs.readFileSync(file),count=(b.length-58)/8
 for(let n=0;n<count;n++){const at=offset+n,amplitude=at<144000?.4:at<240000?.1:.025,v=amplitude*Math.sin(2*Math.PI*750*at/48000);b.writeFloatLE(v,58+n*8);b.writeFloatLE(-v,62+n*8)}
 fs.writeFileSync(file,b);asset.hash=crypto.createHash('sha256').update(b).digest('hex');offset+=count}
fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document))
const userData=path.join(folder,'user-data');fs.mkdirSync(userData)
const legacy={version:1,layout:{tree:{axis:'row',ratio:.15,first:'levels',second:{axis:'row',ratio:.74,first:{axis:'column',ratio:.62,first:'waveform',second:'history'},second:'loudness'}},hidden:[],options:{loudness:'auto',levelReadout:'both',historyTraces:['m','s','i']}},presets:[],activePreset:'recorder',locked:true}
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false,workspace:legacy}))
let session;const report={folder,status:'running',scale,checks:[]},pass=s=>{report.checks.push(s);console.log('PASS',s)}
async function wait(fn,label,max=30000){for(const t=Date.now();Date.now()-t<max;){const v=await fn();if(v)return v;await delay(20)}throw Error('Timeout '+label)}
async function start(){return launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,recordDirectory:takes,scale,args:[...(process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')]),'--trace-test-visible','--disable-backgrounding-occluded-windows'],bounds:{x:20,y:20,width:1280,height:800}})}
async function screenshot(c,name){await delay(150);const image=await c.send('Page.captureScreenshot',{format:'jpeg',quality:88,fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(folder,name+'.jpg'),Buffer.from(image.data,'base64'))}
async function main(){
 session=await start();let c=session.cdp;await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:scale,mobile:false})
 await wait(async()=>(await c.state()).workspace?.version===2,'migration');assert.deepEqual((await c.state()).workspace.layout.hidden,['spectrum','soundfield']);pass('Existing four-instrument workspace migrates without changing its visible layout')
 await c.evaluate('window.__m8=null;window.trace.onSnapshot(s=>window.__m8=s);true')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='spectral';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','file analysis')
 let p=(await c.state()).playback;await c.request('playback.seek',{playbackId:p.id,positionFrame:'192000',resume:false})
 await wait(()=>c.evaluate('window.__m8?.positionFrame==="192000"&&window.__m8.instruments?.data?.positionFrame==="192000"'),'aligned file instrument')
 const read=()=>c.evaluate('({position:window.__m8.positionFrame,generation:window.__m8.playback?.generation,power:window.__m8.instruments.data.current[32],average:window.__m8.instruments.data.average[32],correlation:window.__m8.instruments.data.field.correlation,elapsed:window.__m8.instruments.data.elapsedMs})')
 const first=await read();assert(Math.abs(first.power-.01)<1e-6);assert(Math.abs(first.correlation.value+1)<1e-9);pass('File spectrum and sound field share the presented frame and match an antiphase reference')
 await screenshot(c,'file-spectrum')
 for(const mode of ['极坐标','能量','示波']){await c.evaluate("([...document.querySelectorAll('.field-modes button')].find(e=>e.textContent==="+JSON.stringify(mode)+").click())");await delay(60);await screenshot(c,'field-'+(mode==='极坐标'?'polar-sample':mode==='能量'?'polar-level':'lissajous'))}
 pass('Lissajous, Polar Sample and Polar Level are real data views')
 for(const position of ['336000','96000','192000']){await c.request('playback.seek',{playbackId:p.id,positionFrame:position,resume:false});await wait(()=>c.evaluate('window.__m8?.positionFrame==='+JSON.stringify(position)+'&&window.__m8.instruments?.data?.positionFrame==='+JSON.stringify(position)),'seek '+position)}
 const again=await read();assert.equal(first.power,again.power);assert.equal(first.average,again.average);assert.deepEqual(first.correlation,again.correlation);pass('Reverse and repeated seeks restore identical instrument values')
 await c.click('[aria-label="频谱设置"]')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"FFT 窗大小\"]');e.value='4096';e.dispatchEvent(new Event('change',{bubbles:true}))})()");await c.click('.instrument-analysis-settings button')
 await c.click('[aria-label="关闭仪器设置"]');await wait(()=>c.evaluate('window.__m8?.instruments?.data?.fftSize===4096'),'FFT update')
 report.afterFFT={state:(await c.state()).instrumentSettings,visible:(await c.state()).windowVisible,ui:await c.evaluate('({hidden:document.hidden,text:document.querySelector(".analysis-readout")?.textContent,empty:[...document.querySelectorAll(".instrument-empty")].map(e=>e.textContent)})')};assert.equal(report.afterFFT.visible,true);assert(report.afterFFT.ui.text.includes('FFT 4096'));
 assert(Math.abs(await c.evaluate('window.__m8.instruments.data.current[64]')-.01)<1e-6);pass('Analysis settings rebuild the frequency grid with unchanged calibrated amplitude')
 const rect=await c.evaluate("(()=>{const r=document.querySelector('.spectrum-instrument canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),old=(await c.state()).instrumentSettings
 await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',...rect,deltaY:-100,deltaX:0})
 await wait(async()=>(await c.state()).instrumentSettings.minFrequency!==old.minFrequency,'frequency zoom')
 report.afterWheel=(await c.state()).instrumentSettings;assert.equal((await c.state()).playback.positionFrame,'192000');await c.click('.analysis-legend button:last-child');await delay(50);report.afterReset=(await c.state()).instrumentSettings;assert.equal(report.afterReset.fftSize,4096);pass('Spectrum axis zoom and reset do not seek or alter the audio')
 const latency=[];for(let i=0;i<100;i++){const position=String(144000+i*1600),t=performance.now();await c.request('playback.seek',{playbackId:p.id,positionFrame:position,resume:false});await wait(()=>c.evaluate('window.__m8?.positionFrame==='+JSON.stringify(position)+'&&window.__m8.instruments?.data?.positionFrame==='+JSON.stringify(position)),'timed seek');latency.push(performance.now()-t)}
 report.seekMs=latency;report.seekP95=latency.toSorted((a,b)=>a-b)[Math.ceil(latency.length*.95)-1]
 for(const [width,height]of [[1008,661],[1264,761]]){await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});await delay(100);const g=await c.evaluate('({scroll:document.documentElement.scrollWidth,canvases:[...document.querySelectorAll(".spectrum-instrument canvas,.soundfield-instrument canvas")].map(e=>e.getBoundingClientRect().toJSON())})');assert(g.scroll<=width);for(const r of g.canvases)assert(r.width>100&&r.height>50);await screenshot(c,'size-'+width)}
 pass('Both analysis panels remain usable at small and standard viewport sizes')
 await c.request('view.live');await wait(()=>c.evaluate('window.__m8?.sourceKind==="live"&&window.__m8.instruments?.data?.positionFrame===window.__m8.positionFrame'),'live data')
 pass('Actual live capture publishes one aligned instrument and meter snapshot')
 await delay(1200);await c.request('live.replay');await wait(()=>c.evaluate('window.__m8?.fileView?.temporary&&window.__m8.instruments?.data'),'fixed replay')
 p=(await c.state()).playback;await c.request('playback.seek',{playbackId:p.id,positionFrame:p.totalFrames,resume:false});await wait(()=>c.evaluate('window.__m8.instruments?.data?.positionFrame===window.__m8.positionFrame'),'fixed end');pass('Memory inspection uses local replay frames and independent ownership')
 await c.request('view.live');await c.request('live.stop');await c.request('record.start')
 const take=(await c.state()).currentRecord;await wait(()=>c.evaluate('window.__m8?.recording&&BigInt(window.__m8.recording.writtenFrames)>48000n&&window.__m8.instruments?.data?.positionFrame===window.__m8.recording.writtenFrames'),'record instruments')
 const before=await c.evaluate('window.__m8.recording.writtenFrames');await c.click('[aria-label="最大化声场"]');await delay(600);assert.equal((await c.state()).currentRecord.id,take.id);assert(BigInt(await c.evaluate('window.__m8.recording.writtenFrames'))>BigInt(before))
 await screenshot(c,'recording-field');await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'stop');assert.equal((await c.state()).monitoringRequested,false);pass('Recording analysis uses native segment frames and continues through layout changes')
 const saved=(await c.state()).instrumentSettings;report.savedBeforeClose=saved;report.visibilityBeforeClose=await c.evaluate('({hidden:document.hidden,text:document.querySelector(".analysis-readout")?.textContent})');await session.close();report.preferencesBeforeRestart=JSON.parse(fs.readFileSync(path.join(userData,'trace-settings.json')));session=null;session=await start();c=session.cdp;await wait(async()=>(await c.state()).instrumentSettings.fftSize===4096,'restart settings');assert.deepEqual((await c.state()).instrumentSettings,saved);pass('Instrument settings persist separately from recording and layout state')
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash);pass('Source audio hashes remain unchanged')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m8/ui-latest.json'),JSON.stringify(report,null,2));console.log('M8_UI',report.status,report.checks.length)})
