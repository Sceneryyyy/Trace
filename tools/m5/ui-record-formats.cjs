const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','record-ui-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true});process.env.TRACE_RECORD_TEST_DIR=takes
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'));require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',folder,checks:[],takes:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}throw Error('stale request')}
async function wait(fn,label){const begin=Date.now();while(Date.now()-begin<30000){const v=await fn();if(v)return v;await delay(10)}throw Error('Timeout '+label)}
async function click(selector){const p=await wait(()=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"),selector);win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)});await delay(35)}
async function select(label,value){await evaluate("(()=>{const e=document.querySelector('select[aria-label="+JSON.stringify(label)+"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('change',{bubbles:true}));})()");await delay(25)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'LIVE')
  const device=(await request('devices.list')).data.find(d=>d.supported&&/Realtek/i.test(d.label));if(device)await request('live.start',{deviceId:device.id})
  for(const [format,container,rate]of [['mp3',null,44100],['aac','m4a',48000],['aac','adts',44100]]){
   await click('.save-settings');await select('录音格式',format)
   if(container)await select('录音 AAC 封装',container)
   await select('录音采样率',String(rate))
   assert.deepEqual(await evaluate("Array.from(document.querySelector('select[aria-label=\"录音采样率\"]').options).map(o=>o.value)"),['44100','48000'])
   assert.equal(await evaluate("Boolean(document.querySelector('select[aria-label=\"录音采样精度\"]'))"),false)
   await click('.primary-button');assert.equal((await state()).recordSettings.format,format)
   await click('.record-button');await wait(()=>native.recordStatus().phase==='recording','record boundary')
   const id=(await state()).currentRecord.id;assert.equal(native.recordStatus().encoding,'float32');await delay(650)
   await click('.record-button');await wait(async()=>!(await state()).currentRecord,'record stopped')
   const output=await wait(async()=>{const e=(await state()).exportJobs?.find(e=>e.takeId===id&&e.automatic);if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'automatic compressed output')
   const take=(await state()).recordings.find(t=>t.id===id)
   assert.equal(take.preferredExportId,output.id);assert.equal(take.sampleRate,rate);assert.equal(take.encoding,format);assert((await state()).active)
   const dir=fs.readdirSync(takes).map(n=>path.join(takes,n)).find(dir=>JSON.parse(fs.readFileSync(path.join(dir,'session.json'),'utf8')).sessionId===id)
   const document=JSON.parse(fs.readFileSync(path.join(dir,'session.json'),'utf8'))
   assert(document.assets.some(a=>a.role==='source'&&a.encoding==='float32'))
   const exported=document.exports.find(e=>e.id===output.id)
   assert.equal(exported.result.container,container==='adts'?'adts':container||'mp3')
   assert(fs.existsSync(path.join(dir,exported.result.directory,exported.result.files[0].file)))
   report.takes.push({id,format,container,sourceFrames:document.frames,outputFrames:output.frames,preset:document.preset})
   report.checks.push(format+' '+(container||'')+' recording automatically produces the selected format and retains source')
  }
  await click('.files-button');fs.writeFileSync(path.join(folder,'compressed-recordings.png'),(await win.webContents.capturePage()).toPNG())
  report.status='pass'
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;report.state=await state().catch(()=>null);console.error(error);if(win)fs.writeFileSync(path.join(folder,'failure.png'),(await win.webContents.capturePage()).toPNG())}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m5/record-ui-latest.json'),JSON.stringify(report,null,2));console.log('M5_RECORD_FORMATS',report.status);app.quit()}
})
