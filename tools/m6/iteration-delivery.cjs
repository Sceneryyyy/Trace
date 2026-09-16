const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/iteration/delivery-real-'+Date.now());fs.mkdirSync(folder,{recursive:true})
for(const [entry,out]of [['tools/m6/api.ts','api.cjs'],['src/trace/file-worker.ts','file-worker.js'],['src/trace/media-runner.ts','media-runner.js']])require('esbuild').buildSync({entryPoints:[path.join(root,entry)],outfile:path.join(folder,out),bundle:true,platform:'node',format:'cjs'})
const {RecordingService,ExportService,DeliveryService,LibraryService}=require(path.join(folder,'api.cjs')),lock=require(path.join(root,'ffmpeg.lock.json'))
const tools={ffmpeg:path.join(root,'.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe:path.join(root,'.tools/ffmpeg/bin/ffprobe.exe'),nativePath:path.join(root,'build/trace-engine/Release/trace_engine.node'),ffmpegSha256:lock.ffmpegSha256,ffprobeSha256:lock.ffprobeSha256}
const takes=path.join(folder,'takes'),destination=path.join(folder,'destination');fs.mkdirSync(takes);fs.mkdirSync(destination)
const fixture=require('../m4/fixture.cjs')(takes),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),report={folder,status:'running',checks:[]}
const inputFiles=fixture.document.assets.map(a=>path.join(fixture.folder,a.relativePath)),before=inputFiles.map(hash)
let exporter,delivery
const wait=async(fn)=>{for(const start=Date.now();Date.now()-start<60000;){if(await fn())return;await new Promise(r=>setTimeout(r,15))}throw Error('Delivery integration timeout')}
async function main(){
 const recordings=new RecordingService({recordStatus:()=>({phase:'idle'})},tools.ffmpeg,tools.ffprobe,tools.nativePath,()=>{});await recordings.setDirectory(takes)
 exporter=new ExportService(recordings,tools,()=>delivery?.observe());recordings.setExportResolver((takeId,id)=>exporter.resolve(takeId,id))
 delivery=new DeliveryService(recordings,exporter,()=>{},()=>true)
 const ids=[]
 for(const preset of [{format:'mp3',sampleRate:44100,bitrate:320},{format:'aac',container:'m4a',sampleRate:48000,bitrate:192},{format:'wav',sampleRate:44100,encoding:'pcm16'}]){
  const id=await exporter.start({takeId:fixture.document.sessionId,role:'source'},preset);await delivery.plan(id,destination)
  await wait(()=>{const job=exporter.views().find(j=>j.id===id);if(job?.phase==='failed'||job?.delivery?.phase==='failed')throw Error(job.error||job.delivery.error);return job?.delivery?.phase==='ready'})
  const record=recordings.session(fixture.document.sessionId).document.exports.find(r=>r.id===id)
  assert.equal(hash(record.delivery.targetPath),record.result.files[0].sha256)
  assert(fs.existsSync(path.join(fixture.folder,record.result.directory,record.result.files[0].file)))
  ids.push(id);report.checks.push(preset.format+' real encode and delivered file hash match');console.log('PASS',report.checks.at(-1))
 }
 await wait(()=>!exporter.busy()&&!delivery.busy())
 const library=new LibraryService(recordings,()=>{throw Error('Unexpected trash')},()=>{})
 const cleared=await library.clearCache(fixture.document.sessionId);assert(BigInt(cleared.freedBytes)>0n);assert.equal(cleared.protectedExports,0)
 for(const id of ids){const source=await exporter.resolve(fixture.document.sessionId,id);assert(source.sources.every(fs.existsSync));assert.equal(source.frames,source.sampleRate===44100?'352800':'384000')}
 assert.deepEqual(inputFiles.map(hash),before);report.checks.push('After cache-only cleanup, all three formats rebuild playback while original audio hashes remain unchanged')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{await delivery?.shutdown();await exporter?.shutdown();fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/iteration/delivery-latest.json'),JSON.stringify(report,null,2));console.log('ITERATION_DELIVERY',report.status,report.checks.length)})
