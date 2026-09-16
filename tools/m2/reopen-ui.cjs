const {app,BrowserWindow}=require('electron')
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..')
const previous=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m2/ui-latest.json'),'utf8'))
if(previous.status!=='pass')throw Error('Previous UI fixture must pass')
process.env.TRACE_RECORD_TEST_DIR=path.join(previous.folder,'takes')
require(path.join(root,'out-trace/main/index.js'))
const delay=ms=>new Promise(r=>setTimeout(r,ms))
app.whenReady().then(async()=>{
 let result={status:'fail'}
 try{
  const win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  let state
  for(let i=0;i<200;i++){
   state=(await win.webContents.executeJavaScript("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state
   if(state.recordings?.length===2)break
   await delay(50)
  }
  if(state.recordings?.length!==2||state.recordings.some(t=>t.status!=='ready'))throw Error('Saved sessions did not reopen ready')
  for(const expected of previous.sessions){
   const found=state.recordings.find(t=>t.id===expected.sessionId)
   const assets=expected.assets.filter(a=>a.role==='deliverable').length?expected.assets.filter(a=>a.role==='deliverable'):expected.assets.filter(a=>a.role==='source')
   const frames=assets.reduce((n,a)=>n+BigInt(a.frameCount),0n).toString()
   if(!found||found.frames!==frames||found.sampleRate!==assets[0].sampleRate)throw Error('Reopened summary frame/rate mismatch')
  }
  result={status:'pass',checkedAt:new Date().toISOString(),source:previous.folder,recordings:state.recordings,check:'Persisted source and converted sessions reopen with their own frames/rates'}
 }catch(error){result.error=String(error);console.error(error)}
 finally{fs.writeFileSync(path.join(root,'artifacts/m2/reopen-ui-latest.json'),JSON.stringify(result,null,2));console.log('M2_REOPEN_UI',result.status);app.quit()}
})
