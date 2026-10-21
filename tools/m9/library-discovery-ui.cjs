// Isolated mixed recording root; all files are synthetic, playback is muted.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9','library-discovery-'+Date.now()),takes=path.join(folder,'takes'),userData=path.join(folder,'user-data')
fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData,{recursive:true})
const fixture=require('../m4/fixture.cjs')(takes),foreign=path.join(takes,'External WAV folder')
fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'voice.wav'),'ordinary external WAV fixture')
for(const name of ['Empty folder','.Temp'])fs.mkdirSync(path.join(takes,name))
fs.mkdirSync(path.join(takes,'Other application'));fs.writeFileSync(path.join(takes,'Other application','session.json'),JSON.stringify({product:'Another recorder'}))
fs.mkdirSync(path.join(takes,'Damaged Trace'));fs.writeFileSync(path.join(takes,'Damaged Trace','session.json'),'{"product":"Trace",')
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
let session;const report={status:'running',kind:'Synthetic files in actual Electron; muted output',checks:[]}
const wait=async(fn,label)=>{for(const start=Date.now();Date.now()-start<30000;){if(await fn())return;await delay(40)}throw Error('Timeout '+label)}
const pass=text=>{report.checks.push(text);console.log('PASS',text)}
async function main(){
 const exe=process.env.TRACE_PACKAGE_EXE||require('electron')
 session=await launch(exe,folder,{userData,recordDirectory:takes,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp,s=await c.state()
 assert.deepEqual(s.recordings.map(t=>t.name).sort(),['Damaged Trace',fixture.document.name].sort())
 assert.equal(s.recordings.find(t=>t.name==='Damaged Trace').status,'unreadable')
 await c.click('.files-button')
 await wait(()=>c.evaluate("document.querySelectorAll('[data-take-id]').length===2"),'only two recording rows')
 await c.screenshot(path.join(folder,'mixed-root.png'))
 pass('Mixed root shows only the valid recording and damaged Trace manifest, excluding ordinary WAV/empty/foreign folders')
 await c.request('library.refresh');assert.equal((await c.state()).recordings.length,2)
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 await c.evaluate("window.__snapshot=null;window.addEventListener('message',e=>{if(e.data?.type==='trace-meter-stream-v1')window.__snapshot=e.data.snapshot});true")
 await wait(()=>c.evaluate("window.__snapshot?.fileView?.analysisPhase==='ready'"),'real recording analysis')
 const p=(await c.state()).playback
 await c.request('playback.seek',{playbackId:p.id,positionFrame:'96000',resume:false})
 await wait(()=>c.evaluate("window.__snapshot?.positionFrame==='96000'"),'seek')
 pass('Valid Trace recording still loads and seeks through its actual file analysis')
 await c.request('playback.volume',{playbackId:p.id,gain:0})
 await c.request('playback.play',{playbackId:p.id})
 await wait(()=>c.evaluate("window.__snapshot?.playback?.playing&&BigInt(window.__snapshot.positionFrame)>100800n"),'muted playback clock')
 await c.request('playback.pause',{playbackId:p.id})
 pass('Muted playback advances the real output clock and pauses normally')
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
 assert.equal(fs.readFileSync(path.join(foreign,'voice.wav'),'utf8'),'ordinary external WAV fixture')
 pass('Trace PCM and unrelated audio remain unchanged');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(error=>{report.status='fail';report.closeError=String(error);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('LIBRARY_DISCOVERY',report.status,folder)})
