// Full real fixture files + production portable DSP + production TS cache/view.
// No WASAPI/Electron renderer/Windows WavReader claim; synthetic PCM is explicit.
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir,mkdtemp,readFile,readdir,stat,rm} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import assert from 'node:assert/strict'
const folder=resolve('artifacts/performance');await mkdir(folder,{recursive:true})
await build({stdin:{contents:"export * from './src/trace/spectrogramService';export * from './src/trace/performance'",resolveDir:resolve('.')},outfile:join(folder,'runtime.cjs'),bundle:true,format:'cjs',platform:'node'})
const {SpectrogramService,PerformanceWindow}=(await import(pathToFileURL(join(folder,'runtime.cjs')))).default
const probe=resolve(process.env.TRACE_SPECTRAL_PROBE||'build/portable/spectral_file_probe'),results=[]
const hash=async file=>{const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex')}
const disk=async root=>{let size=0;for(const e of await readdir(root,{withFileTypes:true}).catch(()=>[])){const p=join(root,e.name);if(e.isDirectory())size+=await disk(p);else if(e.isFile())size+=(await stat(p)).size}return size}
const signature=v=>createHash('sha256').update(Buffer.from(v.decibels.buffer)).update(v.status).update(Buffer.from(v.coverage.buffer)).digest('hex')
function transport(file,rate,seconds){
 const child=spawn(probe,['serve',file,String(rate),String(seconds)],{stdio:['pipe','pipe','pipe']});let buffer=Buffer.alloc(0),pending,tail=Promise.resolve(),calls=0,bytes=0,error=''
 child.stderr.on('data',c=>error=(error+c).slice(-2000));child.on('error',e=>pending?.reject(e));child.on('exit',code=>{if(code&&pending)pending.reject(Error(error||'PROBE_FAILED'))})
 child.stdout.on('data',chunk=>{
  bytes+=chunk.length;buffer=Buffer.concat([buffer,chunk]);if(buffer.length<32)return
  const columns=buffer.readUInt32LE(0),fftSize=buffer.readUInt32LE(4),hop=buffer.readUInt32LE(8),bins=buffer.readUInt32LE(12),sampleRate=buffer.readUInt32LE(16),channels=buffer.readUInt32LE(20),length=32+columns+columns*bins*4
  if(columns<1||columns>64||length>4*1024*1024){pending?.reject(Error('INVALID_PROBE_TRANSPORT'));child.kill();return}
  if(buffer.length<length)return
  const powers=new Float32Array(columns*bins);new Uint8Array(powers.buffer).set(buffer.subarray(32+columns,length));const tile={columns,fftSize,hop,bins,sampleRate,channels,firstFrame:buffer.readBigUInt64LE(24).toString(),status:Uint8Array.from(buffer.subarray(32,32+columns)),decibels:powers};buffer=buffer.subarray(length);const p=pending;pending=undefined;p?.resolve(tile)
 })
 return {pid:child.pid,get calls(){return calls},get bytes(){return bytes},spectrogramTile:r=>{const job=tail.then(()=>new Promise((resolve,reject)=>{pending={resolve,reject};calls++;child.stdin.write(`${r.firstFrame} ${r.columns} ${r.config.fftSize}\n`)}));tail=job.catch(()=>{});return job},close:async()=>{await tail;const exited=once(child,'exit');child.stdin.end();await exited}}
}
const rss=async pid=>{const text=await readFile(`/proc/${pid}/status`,'utf8').catch(()=>''),match=text.match(/^VmRSS:\s+(\d+) kB/m);return match?Number(match[1])*1024:0}
const quick=process.argv.includes('--quick'),rates=quick?[48000]:[44100,48000,96000],durations=quick?[30]:[30,600,7200]
for(const rate of rates)for(const seconds of durations){
 const root=await mkdtemp(join(folder,'long-')),file=join(root,'synthetic-mono-float32.wav'),generate=performance.now()
 try{
  const child=spawn(probe,['generate',file,String(rate),String(seconds)],{stdio:'inherit'});const [code]=await once(child,'exit');assert.equal(code,0);const sourceHash=await hash(file),generationMs=performance.now()-generate
  for(const fftSize of [2048,16384]){
   const native=transport(file,rate,seconds),svc=new SpectrogramService(native),cache=join(root,'cache-'+fftSize),source={identity:sourceHash,channelCount:1,gridOrigin:'0',availableStart:'0',availableEnd:String(rate*seconds),cacheRoot:cache,request:{kind:'file',sampleRate:rate,positionFrame:'0',sources:[file]}},config={fftSize,channel:'stereo'},range={startFrame:'0',endFrame:source.availableEnd,width:512,height:128,minFrequency:20,maxFrequency:rate/2}
   let nodeRss=0,nativeRss=0;const sampler=setInterval(()=>{nodeRss=Math.max(nodeRss,process.memoryUsage().rss);void rss(native.pid).then(n=>nativeRss=Math.max(nativeRss,n))},100)
   const cpu=process.cpuUsage(),start=performance.now(),cold=await svc.query(source,config,range),coldMs=performance.now()-start,coldSignature=signature(cold),hot=new PerformanceWindow(),seek=new PerformanceWindow(),hover=new PerformanceWindow(),switches=new PerformanceWindow()
   for(let i=0;i<24;i++){let began=performance.now();const view=await svc.query(source,config,range);hot.observe(performance.now()-began);assert.equal(signature(view),coldSignature)}
   for(let i=0;i<24;i++){const from=Math.max(0,Math.floor((rate*seconds-rate*2)*(i/24))),to=Math.min(rate*seconds,from+rate*2);let began=performance.now();const v=await svc.query(source,config,{...range,startFrame:String(from),endFrame:String(to)});seek.observe(performance.now()-began);began=performance.now();const point=await svc.point(v.key,String(Math.max(fftSize,Math.floor((from+to)/2))),997);hover.observe(performance.now()-began);assert(['ready','silence'].includes(point.status))}
   for(let i=0;i<6;i++){const began=performance.now();await svc.query({...source,identity:sourceHash+':comparison-'+i%2},config,{...range,startFrame:String(rate*(seconds-2)),endFrame:source.availableEnd});switches.observe(performance.now()-began)}
   let cancelled=false;const hidden=svc.query(source,config,range).catch(e=>{cancelled=String(e).includes('CANCELLED')});svc.cancel();await hidden;assert(cancelled)
   const usage=svc.usage,cacheBytes=await disk(cache),cpuUsage=process.cpuUsage(cpu);assert(usage.bytes+usage.projectionBytes+usage.overviewBytes<=64*1024*1024);assert(cacheBytes<100*1024*1024)
   clearInterval(sampler);await svc.close();assert.equal(svc.usage.views,0);assert.equal(svc.usage.bytes,0);await native.close()
   const result={rate,durationSeconds:seconds,fftSize,fixtureFrames:String(rate*seconds),fixtureBytes:(await stat(file)).size,fixtureSha256:sourceHash,generationAndHashMs:generationMs,coldMs,hot:hot.snapshot(),seek:seek.snapshot(),rawHover:hover.snapshot(),alternatingSources:switches.snapshot(),hiddenCancellation:cancelled,cacheBytes,nodePeakRssBytes:nodeRss,nativePeakRssBytes:nativeRss,nativeRequests:native.calls,transportBytes:native.bytes,nodeCpuMicroseconds:cpuUsage,overviewLevel:cold.overviewLevel||0,rawAndHotIdentical:true,usage}
   results.push(result);console.log(JSON.stringify(result));await rm(cache,{recursive:true,force:true})
  }
 }finally{await rm(root,{recursive:true,force:true})}
}
await import('node:fs/promises').then(fs=>fs.writeFile(join(folder,quick?'long-quick.json':'long-files.json'),JSON.stringify({scope:'Full physically written synthetic float32 mono WAV fixtures; test-only bounded PCM reader; production portable DSP and TypeScript spectrogram services; cold means empty derived cache, not dropped OS page cache. Alternating sources are spectral service workloads, not WASAPI audition. No renderer frame timing or native capture/writer evidence.',results},null,2)+'\n'))
