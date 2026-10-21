const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{launch,delay}=require('./cdp.cjs')
const folder=path.resolve(process.argv[2]),file=path.join(folder,'progress.json'),report=JSON.parse(fs.readFileSync(file)),userData=path.join(folder,'user-data')
let session
async function main(){
 const settingsFile=path.join(userData,'trace-settings.json'),settings=JSON.parse(fs.readFileSync(settingsFile))
 fs.copyFileSync(settingsFile,path.join(folder,'settings-before-pause.json'));settings.monitoringRequested=false;fs.writeFileSync(settingsFile,JSON.stringify(settings))
 report.status='paused';report.stage='recovering-after-controller-exit';report.pausedAt=new Date().toISOString();report.pauseReason='User requested restart; terminating controller also terminated owned child processes before normal REC stop';report.interrupted=true
 fs.writeFileSync(file,JSON.stringify(report,null,2))
 session=await launch(report.executable,folder,{userData,args:report.controllerFlags||[],visible:false});const c=session.cdp
 report.beforeRecovery=(await c.state()).recordings.find(t=>t.id===report.takeId);assert(report.beforeRecovery)
 await c.request('record.recover',{takeId:report.takeId})
 for(const begin=Date.now();Date.now()-begin<600000;){const take=(await c.state()).recordings.find(t=>t.id===report.takeId);if(take?.status==='recovered'){report.take=take;break}if(take?.status==='failed')throw Error(take.error);await delay(250)}
 assert.equal(report.take?.status,'recovered');report.recoveredFrames=report.take.frames;report.verificationRole='recovered'
 assert(BigInt(report.recoveredFrames)>=BigInt(report.samples.at(-1).writtenFrames),'Recovered prefix shorter than last observation')
 report.durationSeconds=Number(report.recoveredFrames)/report.take.sampleRate
 report.stage='paused-by-user';report.unknownTail=true
 await session.close();session=null
 for(const name of ['progress.json','report.json','pause-report.json'])fs.writeFileSync(path.join(folder,name),JSON.stringify(report,null,2))
 fs.writeFileSync(path.resolve('artifacts/acceptance/machine-latest.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify({status:report.status,frames:report.recoveredFrames,durationSeconds:report.durationSeconds,take:report.take},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(()=>{})})
