const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','service-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true})
const fixture=require('../m4/fixture.cjs')(takes),api=path.join(folder,'api.cjs')
require('esbuild').buildSync({entryPoints:[path.join(root,'tools/m5/service-api.ts')],outfile:api,platform:'node',format:'cjs',bundle:true})
require('esbuild').buildSync({entryPoints:[path.join(root,'src/trace/file-worker.ts')],outfile:path.join(folder,'file-worker.js'),platform:'node',format:'cjs',bundle:true})
require('esbuild').buildSync({entryPoints:[path.join(root,'src/trace/media-runner.ts')],outfile:path.join(folder,'media-runner.js'),platform:'node',format:'cjs',bundle:true})
const {RecordingService,ExportService,AnalysisService}=require(api),lock=require(path.join(root,'ffmpeg.lock.json'))
const tools={ffmpeg:path.join(root,'.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe:path.join(root,'.tools/ffmpeg/bin/ffprobe.exe'),nativePath:path.join(root,'build/trace-engine/Release/trace_engine.node'),ffmpegSha256:lock.ffmpegSha256,ffprobeSha256:lock.ffprobeSha256}
const native=require(tools.nativePath),delay=ms=>new Promise(r=>setTimeout(r,ms)),report={status:'running',folder,checks:[]}
const source={takeId:fixture.document.sessionId,role:'source',range:{startFrame:'0',endFrame:'96000'}}
let recordings,exportsService,analysis
async function wait(fn,label){const start=Date.now();while(Date.now()-start<40000){const v=await fn();if(v)return v;await delay(5)}throw Error('Timeout '+label)}
async function terminal(id){return wait(()=>{const r=exportsService.views().find(r=>r.id===id);return ['ready','failed','cancelled'].includes(r?.phase)?r:null},'export terminal')}
async function ready(id){const r=await terminal(id);assert.equal(r.phase,'ready',r.error);return recordings.session(source.takeId).document.exports.find(r=>r.id===id)}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function pcm(files,directory){return Buffer.concat(files.map(f=>{const b=fs.readFileSync(path.join(directory,f.file));let at=12;while(at+8<=b.length){const n=b.readUInt32LE(at+4);if(b.toString('ascii',at,at+4)==='data')return b.subarray(at+8,at+8+n);at+=8+n+n%2}throw Error('No PCM')}))}
async function main(){
 const dummy={recordStart(){throw Error('not used')},recordStop(){throw Error('not used')},recordStatus(){return {phase:'idle'}}}
 recordings=new RecordingService(dummy,tools.ffmpeg,tools.ffprobe,tools.nativePath,()=>{});await recordings.setDirectory(takes)
 let pauseOnce=false,pausePromise
 exportsService=new ExportService(recordings,tools,()=>{if(pauseOnce&&exportsService.views().some(j=>j.phase==='encoding')){pauseOnce=false;pausePromise=exportsService.pauseForRecording()}})
 recordings.setExportResolver((take,id)=>exportsService.resolve(take,id))
 const m4a=await ready(await exportsService.start(source,{format:'aac',container:'m4a',sampleRate:48000,bitrate:192}))
 const adts=await ready(await exportsService.start(source,{format:'aac',container:'adts',sampleRate:48000,bitrate:192}))
 const m=pcm(m4a.result.decoded,path.join(fixture.folder,m4a.result.directory)),a=pcm(adts.result.decoded,path.join(fixture.folder,adts.result.directory))
 const offset=Number(adts.result.recipe.startFrame)*8,length=Number(adts.result.frames)*8
 assert(m.equals(a.subarray(offset,offset+length)))
 report.checks.push('M4A and mapped ADTS decode to exactly the same logical PCM')
 const resolved=await recordings.analysisSource(source.takeId,'export',undefined,adts.id)
 assert.equal(resolved.frames,'96000');assert.equal(resolved.decodeRange.startFrame,'1024');assert.equal(resolved.decodeRange.endFrame,'97024')
 const device=native.devices().find(d=>d.supported&&/Realtek/i.test(d.label))
 const opened=await native.playbackOpen('mapped-adts',resolved.sources,device.id,true,resolved.decodeRange);assert.equal(opened.totalFrames,'96000')
 const generation=native.playbackSeek('48000',false,false,'0','0')
 await wait(()=>{const s=native.playbackSnapshot();return s.generation===generation&&s.positionFrame==='48000'},'logical ADTS seek')
 await native.playbackClose();report.checks.push('Playback exposes logical frames after AAC priming')
 analysis=new AnalysisService(tools.nativePath,()=>{})
 const jobId=analysis.start(resolved),job=await wait(()=>{const j=analysis.snapshots().find(j=>j.id===jobId);if(j?.phase==='failed')throw Error(j.error);return j?.phase==='ready'?j:null},'mapped analysis')
 assert.equal(job.totalFrames,'96000')
 const reference=native.analyzeWaves([path.join(fixture.folder,m4a.result.directory,m4a.result.decoded[0].file)],path.join(folder,'reference-analysis'),2048,()=>{})
 assert.deepEqual(job.summary,reference.summary)
 report.checks.push('Analysis excludes ADTS priming and padding and matches M4A exactly')
 const originalHash=hash(path.join(fixture.folder,adts.result.directory,adts.result.files[0].file))
 const damaged=path.join(fixture.folder,adts.result.directory,adts.result.decoded[0].file),bytes=fs.readFileSync(damaged);bytes[128]^=64;fs.writeFileSync(damaged,bytes)
 const rebuilt=await exportsService.resolve(source.takeId,adts.id)
 assert.notEqual(rebuilt.sources[0],damaged);assert.equal(hash(path.join(fixture.folder,adts.result.directory,adts.result.files[0].file)),originalHash)
 report.checks.push('Corrupt decoded cache rebuilds without modifying the encoded file')
 const saved=path.join(folder,'user-copy.aac');await exportsService.saveCopy(adts.id,saved);assert.equal(hash(saved),originalHash)
 const occupied=path.join(folder,'existing.aac');fs.writeFileSync(occupied,'keep');await assert.rejects(exportsService.saveCopy(adts.id,occupied),/PUBLISH_NEW_FILE_FAILED/);assert.equal(fs.readFileSync(occupied,'utf8'),'keep')
 assert(!fs.readdirSync(folder).some(n=>n.startsWith('.trace-export-')));report.checks.push('Save-copy verifies bytes and cannot overwrite an existing file')
 m4a.phase='failed';delete m4a.result;await recordings.session(source.takeId).save();await exportsService.retry(m4a.id);assert.equal(m4a.phase,'ready');assert(m4a.result)
 report.checks.push('An atomically published export is recovered after interrupted session metadata save')

 pauseOnce=true
 const pausedId=await exportsService.start(source,{format:'mp3',sampleRate:48000,bitrate:192})
 await wait(()=>Boolean(pausePromise),'export paused');await pausePromise
 assert.equal(exportsService.views().find(r=>r.id===pausedId).phase,'queued')
 exportsService.resume();await ready(pausedId);report.checks.push('Recording priority cancels work and resumes the same export job')
 const cancelId=await exportsService.start(source,{format:'mp3',sampleRate:48000,bitrate:192});exportsService.cancel(cancelId);assert.equal((await terminal(cancelId)).phase,'cancelled')
 await exportsService.retry(cancelId);await ready(cancelId);report.checks.push('Cancelled exports can retry without overwriting source')
 const collision=await exportsService.start(source,{format:'mp3',sampleRate:48000,bitrate:128})
 const collisionDir=path.join(fixture.folder,'exports',collision);fs.mkdirSync(collisionDir,{recursive:true});fs.writeFileSync(path.join(collisionDir,'keep.txt'),'untouched')
 assert.equal((await terminal(collision)).phase,'failed');assert.equal(fs.readFileSync(path.join(collisionDir,'keep.txt'),'utf8'),'untouched')
 report.checks.push('Publication conflicts leave existing destination content untouched')
 await exportsService.shutdown();await analysis.shutdown()
 const loaded=new RecordingService(dummy,tools.ffmpeg,tools.ffprobe,tools.nativePath,()=>{});await loaded.setDirectory(takes)
 const reader=new ExportService(loaded,tools,()=>{});loaded.setExportResolver((t,id)=>reader.resolve(t,id))
 const reopened=await loaded.analysisSource(source.takeId,'export',undefined,adts.id);assert.equal(reopened.frames,'96000');assert(reopened.mediaIdentity)
 report.checks.push('Persisted compressed exports reopen with their logical timeline')
 for(const asset of fixture.document.assets)assert.equal(hash(path.join(fixture.folder,asset.relativePath)),asset.hash)
 assert(!fs.readdirSync(fixture.folder).some(n=>n.startsWith('.media-')))
 report.checks.push('Sources remain unchanged and owned temporary directories are removed')
 await reader.shutdown();report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;report.jobs=exportsService?.views();console.error(error);process.exitCode=1}).finally(async()=>{
 await exportsService?.shutdown();await analysis?.shutdown();await native.playbackClose()
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m5/service-latest.json'),JSON.stringify(report,null,2));console.log('M5_EXPORT_SERVICE',report.status,report.checks.length)
})
