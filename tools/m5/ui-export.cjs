const {app,BrowserWindow,dialog}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','ui-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true})
const fixture=require('../m4/fixture.cjs')(takes);process.env.TRACE_RECORD_TEST_DIR=takes
const copies=[];dialog.showSaveDialog=async(...args)=>{const options=args.at(-1);const filePath=path.join(folder,'saved-'+copies.length+path.extname(options.defaultPath));copies.push(filePath);return {canceled:false,filePath}}
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',folder,checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}throw Error('stale request')}
async function wait(fn,label){const begin=Date.now();while(Date.now()-begin<30000){const v=await fn();if(v)return v;await delay(10)}throw Error('Timeout '+label)}
async function click(selector){const p=await wait(()=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),selector);win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)});await delay(40)}
async function select(label,value){await evaluate("(()=>{const e=document.querySelector('select[aria-label="+JSON.stringify(label)+"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('change',{bubbles:true}));})()");await delay(30)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'LIVE');await evaluate("window.__m5=null;window.trace.onSnapshot(s=>window.__m5=s);true")
  await click('.files-button');await click('[data-export-source="source"]')
  assert.deepEqual(await evaluate("Array.from(document.querySelector('select[aria-label=\"导出采样率\"]').options).map(o=>o.value)"),['44100','48000'])
  assert(!(await evaluate("document.querySelector('select[aria-label=\"导出采样精度\"]')!==null")))
  report.checks.push('MP3 export UI exposes only 44.1/48 kHz and bitrate')
  await click('[data-export-submit]')
  const mp3=await wait(async()=>{const e=(await state()).exportJobs?.find(e=>e.preset.format==='mp3');if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'MP3 export')
  await click('[data-export-id="'+mp3.id+'"] [data-export-save]');await wait(()=>copies[0]&&fs.existsSync(copies[0]),'saved MP3 copy');assert(fs.statSync(copies[0]).size>0);report.checks.push('The save dialog publishes a standalone MP3 copy')
  await click('[data-export-id="'+mp3.id+'"] [data-export-play]')
  await wait(async()=>{const f=(await state()).playback;return f?.exportId===mp3.id&&await evaluate('window.__m5?.sourceId==='+JSON.stringify(f.id)+'&&window.__m5.fileView.analysisPhase===\'ready\'&&!document.querySelector(\'[role=dialog]\')')},'MP3 file')
  const file=(await state()).playback;assert.equal(file.role,'export');assert.equal(file.exportId,mp3.id);assert.equal(file.totalFrames,'384000')
  await request('playback.seek',{playbackId:file.id,positionFrame:'192000',resume:false})
  await wait(()=>evaluate("window.__m5?.positionFrame==='192000'"),'MP3 seek')
  report.checks.push('Exported MP3 opens its own decoded file and seeks on its own timeline')
  await request('playback.selection',{playbackId:file.id,startFrame:'48000',endFrame:'144000',loop:false})
  await click('.file-export-button');await select('导出格式','aac');await select('AAC 封装','adts')
  await click('[data-export-submit]')
  const aac=await wait(async()=>{const e=(await state()).exportJobs?.find(e=>e.preset.format==='aac');if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'ADTS selection')
  assert.equal(aac.frames,'96000');assert.deepEqual(aac.range,{startFrame:'48000',endFrame:'144000'})
  report.checks.push('A selected range from a compressed file exports as AAC ADTS')
  await click('[data-export-id="'+aac.id+'"] [data-export-play]')
  await wait(async()=>{const s=(await state()).playback;return s?.exportId===aac.id&&s.totalFrames==='96000'},'ADTS open')
  await wait(async()=>{const f=(await state()).playback;return f?.exportId===aac.id&&await evaluate('window.__m5?.sourceId==='+JSON.stringify(f.id)+'&&window.__m5.fileView.analysisPhase===\'ready\'&&!document.querySelector(\'[role=dialog]\')')},'ADTS analysis')
  report.checks.push('ADTS playback and history use the recorded logical range after priming')
  const current=(await state()).playback;await request('playback.seek',{playbackId:current.id,positionFrame:'48000',resume:false})
  await wait(()=>evaluate('window.__m5?.sourceId==='+JSON.stringify(current.id)+'&&window.__m5.positionFrame===\'48000\''),'ADTS own cursor')
  const expected=(await request('metrics.query',{analysisId:current.analysisId,positionFrame:'48000',requestGeneration:1})).data.metrics
  assert.deepEqual(await evaluate('window.__m5.integratedToCursor'),expected.integratedToCursor);report.checks.push('The new AAC asset cannot display a previous MP3 snapshot')
  await delay(40)
  fs.writeFileSync(path.join(folder,'adts-playback.png'),(await win.webContents.capturePage()).toPNG())
  await click('.return-live');await wait(async()=>(await state()).active,'return LIVE')
  await click('.files-button')
  fs.writeFileSync(path.join(folder,'exports-list.png'),(await win.webContents.capturePage()).toPNG())
  report.status='pass'
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;report.state=await state().catch(()=>null);report.dom=await evaluate('document.body.innerText').catch(()=>null);console.error(error);if(win)fs.writeFileSync(path.join(folder,'failure.png'),(await win.webContents.capturePage()).toPNG())}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m5/ui-latest.json'),JSON.stringify(report,null,2));console.log('M5_EXPORT_UI',report.status,report.checks.length);app.quit()}
})
