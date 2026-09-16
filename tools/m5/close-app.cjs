const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=process.env.TRACE_M5_CLOSE_DIR,mode=process.env.TRACE_M5_CLOSE_MODE;process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
const native=require(path.join(root,'build/trace-engine/Release/trace_engine.node'));require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}throw Error('stale')}
async function wait(fn,label){const start=Date.now();while(Date.now()-start<30000){const v=await fn();if(v)return v;await delay(10)}throw Error('Timeout '+label)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  await wait(async()=>(await state()).active,'LIVE')
  if(mode==='seed'){
   await request('record.configure',{format:'mp3',sampleRate:48000,bitrate:192,namePrefix:'CloseTest'})
   await request('record.start');await wait(()=>native.recordStatus().phase==='recording','recording');await delay(500)
   const id=(await state()).currentRecord.id;fs.writeFileSync(path.join(folder,'seed.json'),JSON.stringify({id}));app.quit()
  }else{
   const id=JSON.parse(fs.readFileSync(path.join(folder,'seed.json'),'utf8')).id
   const take=await wait(async()=>(await state()).recordings?.find(t=>t.id===id),'take reopened')
   assert.equal(take.status,'ready');const output=take.exports.find(e=>e.automatic);assert(output&&['failed','cancelled'].includes(output.phase))
   await request('export.retry',{exportId:output.id})
   const done=await wait(async()=>{const e=(await state()).exportJobs.find(e=>e.id===output.id);if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'retry ready')
   fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({status:'pass',takeId:id,output:done},null,2));app.quit()
  }
 }catch(error){fs.writeFileSync(path.join(folder,'error.json'),JSON.stringify({error:String(error),stack:error.stack}));console.error(error);app.exit(1)}
})
