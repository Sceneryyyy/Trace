const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m6','retention-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const api=path.join(folder,'api.cjs');for(const [entry,output]of [['tools/m6/api.ts','api.cjs'],['src/trace/file-worker.ts','file-worker.js'],['src/trace/media-runner.ts','media-runner.js']])require('esbuild').buildSync({entryPoints:[path.join(root,entry)],outfile:path.join(folder,output),platform:'node',format:'cjs',bundle:true})
const {RecordingService,ExportService,AnalysisService,SourceRetention}=require(api),lock=require(path.join(root,'ffmpeg.lock.json'))
const tools={ffmpeg:path.join(root,'.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe:path.join(root,'.tools/ffmpeg/bin/ffprobe.exe'),nativePath:path.join(root,'build/trace-engine/Release/trace_engine.node'),ffmpegSha256:lock.ffmpegSha256,ffprobeSha256:lock.ffprobeSha256}
const delay=ms=>new Promise(r=>setTimeout(r,ms)),report={status:'running',folder,checks:[]}
async function wait(fn,label){const start=Date.now();while(Date.now()-start<30000){const value=await fn();if(value)return value;await delay(10)}throw Error('Timeout '+label)}
async function scenario(name,modify){
 const takes=path.join(folder,name);fs.mkdirSync(takes)
 const fixture=require('../m4/fixture.cjs')(takes),dummy={recordStart(){},recordStop(){},recordStatus(){return {phase:'idle'}}}
 const recordings=new RecordingService(dummy,tools.ffmpeg,tools.ffprobe,tools.nativePath,()=>{});await recordings.setDirectory(takes)
 const take=recordings.session(fixture.document.sessionId);take.document.preset={format:'mp3',sampleRate:48000,bitrate:192,namePrefix:'Retention',keepOriginal:false}
 const exporter=new ExportService(recordings,tools,()=>{});recordings.setExportResolver((t,id)=>exporter.resolve(t,id))
 const analysis=new AnalysisService(tools.nativePath,()=>{});let view=null
 const playback={view:()=>view};const retention=new SourceRetention(recordings,exporter,playback,analysis,tools.nativePath,()=>{})
 const id=await exporter.start({takeId:take.document.sessionId,role:'source'},{format:'mp3',sampleRate:48000,bitrate:192},true)
 await wait(()=>{const r=exporter.views().find(r=>r.id===id);if(r?.phase==='failed')throw Error(r.error);return r?.phase==='ready'},'output')
 await wait(()=>!exporter.busy(),'export settled')
 const originalPaths=take.document.assets.filter(a=>a.role==='source').map(a=>path.join(take.directory,a.relativePath))
 await modify({take,originalPaths,retention,setView:v=>view=v,exporter,id,recordings})
 await retention.shutdown();await exporter.shutdown();await analysis.shutdown()
}
async function main(){
 await scenario('kept',async({take,originalPaths,retention})=>{delete take.document.preset.keepOriginal;retention.schedule();await delay(100);assert(originalPaths.every(fs.existsSync));report.checks.push('Default policy preserves all original files')})
 await scenario('removed',async({take,originalPaths,retention,exporter,id,recordings})=>{
  retention.schedule();await wait(()=>take.document.retention?.phase==='removed','source removal')
  assert(originalPaths.every(p=>!fs.existsSync(p)));assert(!recordings.summaries()[0].roles.includes('source'))
  const source=await exporter.resolve(take.document.sessionId,id);assert.equal(source.frames,'384000')
  report.checks.push('Original removal follows independent decoded/analysis validation and leaves export playable')
 })
 await scenario('deferred',async({take,originalPaths,retention,setView})=>{
  setView({takeId:take.document.sessionId,role:'source'});retention.schedule();await delay(100);assert(originalPaths.every(fs.existsSync))
  setView(null);retention.schedule();await wait(()=>take.document.retention?.phase==='removed','deferred removal')
  report.checks.push('An original file being auditioned is not removed')
 })
 await scenario('changed',async({take,originalPaths,retention})=>{
  const bytes=fs.readFileSync(originalPaths[0]);bytes[100]^=1;fs.writeFileSync(originalPaths[0],bytes)
  const hashes=originalPaths.map(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))
  retention.schedule();await wait(()=>take.document.retention?.phase==='error','changed source rejected')
  assert(originalPaths.every((p,i)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')===hashes[i]))
  report.checks.push('Changed original identity prevents the entire cleanup batch')
 })
 report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(()=>{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m6/retention-latest.json'),JSON.stringify(report,null,2));console.log('M6_RETENTION',report.status)})
