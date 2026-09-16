const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','precision-ui-'+Date.now()),takes=path.join(folder,'takes')
fs.mkdirSync(takes,{recursive:true})
const fixtures=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m2-regions/precision-fixtures.json'),'utf8'))
for(const fixture of fixtures)fs.cpSync(fixture.folder,path.join(takes,fixture.encoding),{recursive:true,errorOnExist:true})
process.env.TRACE_RECORD_TEST_DIR=takes
require(path.join(root,'out-trace/main/index.js'))
const report={status:'running',folder,kind:'synthetic-overload-files-in-real-Electron-UI',checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
const evaluate=code=>win.webContents.executeJavaScript(code)
async function state(){return(await evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
async function wait(fn,label){for(let i=0;i<400;i++){const value=await fn();if(value)return value;await delay(25)}throw Error('Timeout '+label)}
app.whenReady().then(async()=>{
 try{
  win=BrowserWindow.getAllWindows()[0]
  if(win.webContents.isLoadingMainFrame())await new Promise(r=>win.webContents.once('did-finish-load',r))
  const loaded=await wait(async()=>{const s=await state();return s.recordings?.length===3?s:null},'fixtures')
  await evaluate("document.querySelector('.files-button').click()")
  for(const fixture of fixtures){
   const count=fixture.encoding==='float32'?'0':'2400',take=loaded.recordings.find(t=>t.id===fixture.sessionId)
   assert.equal(take.clippedSamples,count)
   const selector='[data-take-id="'+fixture.sessionId+'"]'
   const text=await wait(()=>evaluate('document.querySelector('+JSON.stringify(selector)+')?.innerText'),'file row')
   assert.equal(text.includes('保存文件发生削波：2400'),count!=='0')
   report.checks.push(fixture.encoding+' clipping metadata and visible warning agree')
  }
  await evaluate('document.querySelector('+JSON.stringify('[data-take-id="'+fixtures[0].sessionId+'"]')+').scrollIntoView({block:"center"})')
  fs.writeFileSync(path.join(folder,'clipping-warning.png'),(await win.webContents.capturePage()).toPNG())
  report.status='pass'
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error)}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m2-regions/precision-ui-latest.json'),JSON.stringify(report,null,2));console.log('PRECISION_UI',report.status);app.quit()}
})
