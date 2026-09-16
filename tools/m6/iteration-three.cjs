const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/iteration/three-'+Date.now()),userData=path.join(folder,'user-data')
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:true}))
const report={folder,status:'running',checks:[],saved:[]};let session
const wait=async(fn,label,max=45000)=>{for(const t=Date.now();Date.now()-t<max;){const v=await fn();if(v)return v;await delay(35)}throw Error('Timeout '+label)}
const pass=s=>{report.checks.push(s);console.log('PASS',s)}
function audioFiles(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?audioFiles(path.join(dir,e.name)):/\.(wav|mp3|m4a|aac)$/i.test(e.name)?[path.join(dir,e.name)]:[])}
function sessionDocument(id){const takes=path.join(folder,'takes');for(const e of fs.readdirSync(takes)){const p=path.join(takes,e,'session.json');if(fs.existsSync(p)){const d=JSON.parse(fs.readFileSync(p,'utf8'));if(d.sessionId===id)return {d,dir:path.dirname(p)}}}throw Error('Missing saved take')}
async function start(){
 const packaged=process.env.TRACE_PACKAGE_EXE;session=await launch(packaged||require('electron'),folder,{userData,args:[...(packaged?[]:[path.join(root,'out-trace/main/index.js')]),'--disable-gpu','--disable-renderer-backgrounding']});const c=session.cdp
 await wait(async()=>(await c.state()).active,'live');await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:1,mobile:false})
 await c.evaluate('window.__cacheFrame=null;window.trace.onSnapshot(s=>window.__cacheFrame=s);true');return c
}
async function main(){
 let c=await start();await delay(4200)
 assert.equal(audioFiles(path.join(folder,'takes')).length,0);const before=await c.evaluate('window.__cacheFrame');assert.equal((await c.state()).currentRecord,null);pass('Monitoring builds memory history without creating audio files')
 await c.request('record.configure',{encoding:'float32',sampleRate:'source',namePrefix:'CacheAcceptance'})
 await c.request('live.replay');let p=(await c.state()).playback;assert(BigInt(p.totalFrames)>BigInt(p.sampleRate*3));const firstId=p.id
 await c.request('playback.selection',{playbackId:p.id,startFrame:String(p.sampleRate),endFrame:String(p.sampleRate*3),loop:false})
 await c.click('.file-export-button')
 const first=await wait(async()=>{const items=(await c.state()).recordings;return items?.find(t=>t.name.includes('缓存')&&t.status==='ready')},'saved selection')
 const saved=sessionDocument(first.id);assert.equal(saved.d.origin.kind,'memory');assert.equal(saved.d.frames,String(p.sampleRate*2));assert.equal(saved.d.origin.startFrame,String(p.sampleRate));assert.equal(saved.d.regions[0].startFrame,'0')
 assert.equal((await c.state()).playback.id,firstId);assert.equal((await c.state()).playback.temporary,true);assert.equal((await c.state()).active,true);assert.equal((await c.state()).currentRecord,null)
 await wait(async()=>(await c.state()).analysisJobs?.some(j=>j.takeId===first.id&&j.role==='source'&&j.phase==='ready'),'independent analysis')
 const job=(await c.state()).analysisJobs.find(j=>j.takeId===first.id&&j.role==='source');assert.equal(job.totalFrames,String(p.sampleRate*2));assert.equal(job.summary.levelIndexFrame,String(p.sampleRate*2))
 report.saved.push({id:first.id,frames:first.frames,format:'wav',range:saved.d.origin});pass('Selection saves as an independent file with exact frame count and fresh automatic analysis')
 await c.screenshot(path.join(folder,'saved-cache.png'))
 await c.request('view.live');await wait(()=>c.evaluate('window.__cacheFrame?.sourceKind==="live"'),'live after save');const after=await c.evaluate('window.__cacheFrame')
 assert.equal(after.epochId,before.epochId);assert(BigInt(after.positionFrame)>BigInt(before.positionFrame));assert.equal(after.recording.phase,'idle');pass('Cache saving does not start REC or restart healthy monitoring')
 for(const preset of [{format:'mp3',sampleRate:44100,bitrate:192,namePrefix:'CacheMP3'},{format:'aac',container:'m4a',sampleRate:48000,bitrate:192,namePrefix:'CacheAAC'}]){
  await c.request('record.configure',preset);await c.request('live.replay');p=(await c.state()).playback
  await c.request('playback.selection',{playbackId:p.id,startFrame:'17',endFrame:String(p.sampleRate*2+17),loop:false})
  const result=await c.request('cache.save',{playbackId:p.id,useSelection:true}),id=result.data.takeId
  await wait(async()=>{const state=await c.state(),take=state.recordings.find(t=>t.id===id),output=take?.exports?.find(e=>e.automatic);if(output?.phase==='failed')throw Error(output.error);return output?.phase==='ready'&&state.analysisJobs?.some(j=>j.takeId===id&&j.role==='export'&&j.exportId===output.id&&j.phase==='ready')},preset.format+' canonical analysis')
  const take=(await c.state()).recordings.find(t=>t.id===id);assert.equal(take.encoding,preset.format);assert.equal(take.sampleRate,preset.sampleRate);assert.equal(take.frames,String(preset.sampleRate*2))
  report.saved.push({id,frames:take.frames,format:preset.format});await c.request('view.live');pass(preset.format+' cache selection produces a verified canonical file and its own analysis')
 }
 const count=audioFiles(path.join(folder,'takes')).length;await session.close();session=null;c=await start();await delay(300)
 assert.equal((await c.state()).recordings.length,3);assert.equal(audioFiles(path.join(folder,'takes')).length,count)
 for(const entry of report.saved){const take=(await c.state()).recordings.find(t=>t.id===entry.id),output=take.exports?.find(e=>e.automatic&&e.phase==='ready');await c.request('file.open',{takeId:take.id,role:output?'export':'source',...(output?{exportId:output.id}:{})});await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','reopen '+entry.format);assert.equal((await c.state()).playback.totalFrames,entry.frames)}
 await assert.rejects(c.request('cache.save',{playbackId:firstId,useSelection:false}),/STALE_PLAYBACK_SOURCE/);assert.equal((await c.state()).recordings.length,3);pass('All three saved formats reopen after restart; stale cache requests cannot create another recording')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session){try{report.finalState=await session.cdp.state()}catch{}await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1})}fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/iteration/three-latest.json'),JSON.stringify(report,null,2));console.log('ITERATION_THREE',report.status,report.checks.length)})
