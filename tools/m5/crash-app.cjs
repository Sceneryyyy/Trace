const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=process.env.TRACE_M5_CRASH_DIR,mode=process.env.TRACE_M5_CRASH_MODE;process.env.TRACE_RECORD_TEST_DIR=path.join(folder,'takes')
let encoder
if(mode==='seed'){
 process.env.TRACE_TEST_MEDIA_READ_RATE='.05'
 const original=cp.spawn
 cp.spawn=function(...args){const child=original.apply(this,args);if(args[1]?.some?.(a=>String(a).endsWith('media-runner.js')))child.on('message',m=>{if(m?.type==='spawn'&&m.args?.includes('libmp3lame'))encoder={runnerPid:child.pid,encoderPid:m.pid}});return child}
}
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms));let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function request(command,payload={}){for(let i=0;i<8;i++){const s=await state(),r=await evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}throw Error('stale')}
async function wait(fn,label){const start=Date.now();while(Date.now()-start<30000){const v=await fn();if(v)return v;await delay(10)}throw Error('Timeout '+label)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  const take=await wait(async()=>(await state()).recordings?.[0],'fixture')
  if(mode==='seed'){
   const {jobId}=(await request('export.start',{takeId:take.id,role:'source',preset:{format:'mp3',sampleRate:48000,bitrate:192}})).data
   await wait(()=>encoder,'encoder started');fs.writeFileSync(path.join(folder,'seed-ready.json'),JSON.stringify({takeId:take.id,jobId,...encoder}))
  }else{
   const seed=JSON.parse(fs.readFileSync(path.join(folder,'seed-ready.json'),'utf8')),record=take.exports.find(e=>e.id===seed.jobId)
   assert.equal(record.phase,'failed')
   await request('export.retry',{exportId:record.id})
   const output=await wait(async()=>{const e=(await state()).exportJobs.find(e=>e.id===record.id);if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'retry complete')
   fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({status:'pass',output},null,2));app.quit()
  }
 }catch(error){fs.writeFileSync(path.join(folder,'error.json'),JSON.stringify({error:String(error),stack:error.stack}));console.error(error);app.exit(1)}
})
