const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m6','resources-'+Date.now()),exe=path.join(root,packageOutput+'/win-unpacked/Trace.exe')
const original=path.join(root,'artifacts/m2/long-1789459514556/takes'),source=fs.readdirSync(original).map(n=>path.join(original,n)).find(p=>fs.existsSync(path.join(p,'session.json')))
if(!source)throw Error('Preserved M2 long recording is required')
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes'),copy=path.join(takes,'long-recording');fs.mkdirSync(copy,{recursive:true})
const originalDoc=JSON.parse(fs.readFileSync(path.join(source,'session.json'),'utf8'))
fs.copyFileSync(path.join(source,'session.json'),path.join(copy,'session.json'))
for(const asset of originalDoc.assets.filter(a=>a.role==='source')){const from=path.resolve(source,asset.relativePath),to=path.resolve(copy,asset.relativePath);assert(from.startsWith(source+path.sep)&&to.startsWith(copy+path.sep));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to)}
const report={status:'running',folder,source:'Preserved M2 actual 1800.84-second recording; copied audio, no new long recording',machine:{platform:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()},checks:[],samples:[]};let session
async function wait(fn,label,timeout=30000){const t=Date.now();while(Date.now()-t<timeout){const v=await fn();if(v)return v;await delay(20)}throw Error('Timeout '+label)}
async function sample(phase){const pid=session.child.pid,r=spawnSync('C:/Windows/System32/tasklist.exe',['/FI','PID eq '+pid,'/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true}),line=r.stdout.trim().split('\n').find(l=>l.includes('","'+pid+'","'));assert(line,'Main process memory unavailable');const kb=Number(line.split('","').at(-1).replace(/\D/g,''));const ui=await session.cdp.evaluate('({heapBytes:performance.memory?.usedJSHeapSize,diagnostics:window.__resource?.diagnostics,wavePoints:window.__resource?.waveform.length,loudnessPoints:window.__resource?.loudnessHistory.length})');report.samples.push({phase,milliseconds:Date.now()-report.startedAt,mainWorkingSetKB:kb,...ui})}
async function main(){
 report.startedAt=Date.now();session=await launch(exe,folder);const {cdp}=session;await wait(async()=>(await cdp.state()).active,'LIVE')
 await cdp.evaluate('window.__resource=null;window.trace.onSnapshot(s=>window.__resource=s);true');await wait(()=>cdp.evaluate('!!window.__resource'),'snapshot')
 for(let i=0;i<10;i++){await sample('LIVE');await delay(1000)}
 report.checks.push('Ten-second packaged LIVE resource samples collected without starting REC')
 const start=Date.now();await cdp.request('file.open',{takeId:originalDoc.sessionId,role:'source'})
 const file=await wait(async()=>{const f=(await cdp.state()).playback;return f?.phase==='paused'?f:null},'long FILE')
 while(Date.now()-start<300000){
  const snapshot=await cdp.evaluate('window.__resource')
  if(snapshot?.sourceId===file.id&&snapshot.fileView?.analysisPhase==='ready')break
  if((await cdp.state()).playback?.error)throw Error((await cdp.state()).playback.error)
  await sample('long-file-analysis');await delay(750)
 }
 assert(await cdp.evaluate('window.__resource?.sourceId==='+JSON.stringify(file.id)+'&&window.__resource.fileView?.analysisPhase==="ready"'),'Long file did not finish analysis')
 report.analysisMilliseconds=Date.now()-start;assert.equal(file.totalFrames,'86440320');await sample('long-file-ready')
 const position=(BigInt(file.totalFrames)-BigInt(file.sampleRate)*2n).toString()
 await cdp.request('playback.seek',{playbackId:file.id,positionFrame:position,resume:false})
 await wait(()=>cdp.evaluate('window.__resource?.positionFrame==='+JSON.stringify(position)),'near EOF')
 await cdp.request('playback.play',{playbackId:file.id});await delay(400);await cdp.request('playback.pause',{playbackId:file.id});await sample('long-file-playback')
 assert(!(await cdp.state()).playback.error);report.checks.push('Current packaged engine analyzes and plays the preserved 30-minute file with 86440320 frames')
 await session.close();session=null
 for(const asset of originalDoc.assets.filter(a=>a.role==='source'))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(source,asset.relativePath))).digest('hex'),asset.hash)
 report.checks.push('Original long recording hashes remain unchanged')
 report.peakMainWorkingSetKB=Math.max(...report.samples.map(s=>s.mainWorkingSetKB));report.peakRendererJSHeapBytes=Math.max(...report.samples.map(s=>s.heapBytes||0));report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(console.error);fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m6/resources-latest.json'),JSON.stringify(report,null,2));console.log('M6_RESOURCES',report.status,report.checks.length)})
