const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{launch,delay}=require('./cdp.cjs')
const folder=path.resolve(process.argv[2]),r=JSON.parse(fs.readFileSync(path.join(folder,'report.json')))
let session;const result={status:'running',recordingStatus:r.status,unknownTail:r.unknownTail}
async function main(){
 session=await launch(r.executable,folder,{userData:path.join(folder,'user-data'),args:r.controllerFlags||[],visible:false});const c=session.cdp
 await c.evaluate('window.__pauseFile=null;window.trace.onSnapshot(s=>window.__pauseFile=s);true')
 await c.request('file.open',{takeId:r.takeId,role:r.verificationRole||'source'})
 let p
 for(const start=Date.now();Date.now()-start<600000;){p=(await c.state()).playback;if(p?.analysisPhase==='ready')break;if(p?.analysisPhase==='failed')throw Error(p.analysisError);await delay(100)}
 assert.equal(p.analysisPhase,'ready');assert.equal(p.totalFrames,r.recoveredFrames||r.final.writtenFrames)
 result.frames=p.totalFrames;result.positions=[]
 for(const fraction of [0,.5,.99]){
  const positionFrame=String(Math.floor(Number(p.totalFrames)*fraction));await c.request('playback.seek',{playbackId:p.id,positionFrame,resume:false})
  let found=false;for(const start=Date.now();Date.now()-start<10000;){if(await c.evaluate('window.__pauseFile?.positionFrame==='+JSON.stringify(positionFrame))){found=true;break}await delay(50)}
  assert(found,'File cursor failed to reach '+positionFrame);result.positions.push(positionFrame)
 }
 result.status='pass';result.checkedAt=new Date().toISOString()
}
main().catch(e=>{result.status='fail';result.error=String(e);process.exitCode=1;console.error(e)}).finally(async()=>{
 if(session)await session.close().catch(e=>{result.status='fail';result.closeError=String(e);process.exitCode=1})
 fs.writeFileSync(path.join(folder,'file-reopen.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
})
