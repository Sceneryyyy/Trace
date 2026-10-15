import assert from 'node:assert/strict'
import test from 'node:test'
import {build} from 'esbuild'
import {mkdir,mkdtemp,readFile,readdir} from 'node:fs/promises'
import {writeFileSync} from 'node:fs'
import {resolve,join,basename} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m2-regions',{recursive:true})
const modulePath=resolve('artifacts/m2-regions/continuation.cjs')
await build({entryPoints:['src/trace/recording.ts'],outfile:modulePath,platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/file-worker.ts'],outfile:resolve('artifacts/m2-regions/file-worker.js'),platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/media-runner.ts'],outfile:resolve('artifacts/m2-regions/media-runner.js'),platform:'node',format:'cjs',bundle:true})
const {RecordingService}=(await import(pathToFileURL(modulePath))).default
const delay=ms=>new Promise(r=>setTimeout(r,ms))
const metric=unit=>({value:null,status:'insufficient',unit})
const meters={channels:[{samplePeak:metric('dBFS'),rms:metric('dBFS'),truePeak:metric('dBTP')}],momentary:metric('LUFS'),shortTerm:metric('LUFS'),integratedToCursor:metric('LUFS'),loudnessRange:metric('LU'),maxTruePeak:metric('dBTP'),levelIndexFrame:'0',loudnessIndexFrame:'0'}
function wav(path,rate,frames,encoding,constant){
 const bits=encoding==='float32'?32:encoding==='pcm24'?24:16,bytes=bits/8,header=encoding==='float32'?58:44
 const out=Buffer.alloc(header+frames*bytes)
 out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(encoding==='float32'?18:16,16)
 out.writeUInt16LE(encoding==='float32'?3:1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*bytes,28);out.writeUInt16LE(bytes,32);out.writeUInt16LE(bits,34)
 if(encoding==='float32'){out.write('fact',38);out.writeUInt32LE(4,42);out.writeUInt32LE(frames,46);out.write('data',50);out.writeUInt32LE(frames*bytes,54)}
 else{out.write('data',36);out.writeUInt32LE(frames*bytes,40)}
 for(let i=0;i<frames;i++){const value=constant??.1*Math.sin(2*Math.PI*1000*i/rate),at=header+i*bytes;if(encoding==='float32')out.writeFloatLE(value,at);else out.writeIntLE(Math.round(value*(2**(bits-1)-1)),at,bytes)}
 writeFileSync(path,out)
}
class FakeNative {
 constant=undefined;rate=96000;qpc=100000000n;starts=0;snapshot={phase:'idle',id:''}
 recordStart(id,base,encoding){
  this.starts++;const frames=this.rate/20,path=base+'-1.wav';wav(path,this.rate,frames,encoding,this.constant)
  this.snapshot={phase:'recording',id,error:null,sourceFormat:{sampleRate:this.rate,channelCount:1,containerBits:32,validBits:32,blockAlign:4,channelMask:0,encoding:'ieee-float'},
   encoding,startFrame:'0',endFrameExclusive:String(frames),acceptedFrames:String(frames),writtenFrames:String(frames),estimatedFrames:'0',clippedSamples:'0',
   startQpc100ns:String(this.qpc),endQpc100ns:String(this.qpc+500000n),startQpcEstimated:false,endQpcEstimated:false,queueDepth:0,queueHighWater:1,
   meters:{...meters,levelIndexFrame:String(frames),loudnessIndexFrame:String(frames)},segments:[{file:basename(path),frames:String(frames),bytes:String(frames*(encoding==='float32'?4:encoding==='pcm24'?3:2))}],
   waveform:[{frame:String(frames),min:[-.1],max:[.1],flags:0}],loudnessHistory:[]}
  return this.recordStatus()
 }
 recordStop(){if(this.snapshot.phase==='recording')this.snapshot.phase='complete';return this.recordStatus()}
 recordStatus(){return structuredClone(this.snapshot)}
 fail(error='DEVICE_UNAVAILABLE'){this.snapshot.phase='failed';this.snapshot.error=error}
}
async function setup(){
 const root=await mkdtemp(resolve('artifacts/m2-regions/lifecycle-')),native=new FakeNative()
 const service=new RecordingService(native,resolve('.tools/ffmpeg/bin/ffmpeg.exe'),resolve('.tools/ffmpeg/bin/ffprobe.exe'),resolve('build/trace-engine/Release/trace_engine.node'),()=>{},2147483648,10)
 await service.setDirectory(root);service.configure({encoding:'float32',sampleRate:'source',namePrefix:'RegionTest'})
 return {root,native,service}
}
async function wait(check){for(let i=0;i<300;i++){if(await check())return;await delay(10)}throw Error('condition timed out')}
async function document(root){const name=(await readdir(root))[0];return JSON.parse(await readFile(join(root,name,'session.json'),'utf8'))}
test('same session survives two rate changes; view contains only saved frames',async()=>{
 const {root,native,service}=await setup()
 service.setReconnectHandler(async(deviceId,current)=>{assert(current());native.qpc+=2500000n;native.rate=native.starts===1?48000:44100;return {format:{sampleRate:native.rate,channelCount:1},source:{deviceId,captureEpochId:'clock:epoch-'+(native.starts+1)}}})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:epoch-1'})
 const id=service.activeSummary().id
 for(let index=2;index<=3;index++){
  native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'injected device reset'})
  await wait(()=>native.starts===index)
  assert.equal(service.activeSummary().id,id)
 }
 await service.stop();await service.finish(native.recordStatus())
 const d=await document(root)
 assert.equal(d.schemaVersion,2);assert.equal(d.sessionId,id);assert.equal(d.regions.length,3)
 assert.deepEqual(d.regions.map(r=>r.format.sampleRate),[96000,48000,44100])
 assert.equal(d.durationNs,'150000000');assert.equal(d.hasDiscontinuities,true)
 assert.equal(d.captureEndFrameExclusive,null);assert.equal(d.status,'ready')
 assert.equal(d.assets.filter(a=>a.role==='source').length,3)
 const view=d.assets.filter(a=>a.role==='session')
 assert(view.length>0);assert.equal(view.reduce((n,a)=>n+BigInt(a.frameCount),0n),14400n);assert(view.every(a=>a.sampleRate===96000))
 assert.equal(d.segments[1].gapBeforeNs,'200000000')
 assert(d.assets.every(a=>a.hash&&a.hash.length===64))
})
test('stop during a pending reconnect prevents a late new recording',async()=>{
 const {native,service,root}=await setup();let resolveReconnect,entered=false
 service.setReconnectHandler(async()=>{entered=true;return new Promise(resolve=>resolveReconnect=resolve)})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'injected reset'});await wait(()=>entered)
 await Promise.race([service.stop(),delay(300).then(()=>{throw Error('stop waited for the deferred reconnect')})])
 resolveReconnect({format:{sampleRate:48000,channelCount:1},source:{deviceId:'device',captureEpochId:'clock:2'}})
 await delay(30);await service.finish(native.recordStatus())
 assert.equal(native.starts,1);assert.equal(service.activeSummary(),null);assert.equal((await document(root)).regions.length,1)
})
test('disk failure ends the take and never enters a reconnect loop',async()=>{
 const {native,service,root}=await setup();let reconnects=0
 service.setReconnectHandler(async()=>{reconnects++;throw Error('must not run')})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 native.fail('DISK_BACKPRESSURE');service.observe(native.recordStatus(),{recoverable:true,error:'device metadata cannot override disk failure'})
 await wait(()=>!service.busy());await service.finish(native.recordStatus())
 assert.equal(reconnects,0);assert.equal((await document(root)).status,'failed')
})
test('reconnect attempts for unavailable format stop when requested',async()=>{
 const {native,service}=await setup();let attempts=0
 service.setReconnectHandler(async()=>{attempts++;throw Error('UNSUPPORTED_FORMAT')})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'injected reset'});await wait(()=>attempts>=2)
 await service.stop();const before=attempts;await delay(80);await service.finish(native.recordStatus())
 assert.equal(attempts,before);assert.equal(native.starts,1)
})

test('reconnect cannot silently switch endpoints or reuse an old capture epoch',async()=>{
 for(const variant of ['device','epoch']){
  const {native,service,root}=await setup()
  service.setReconnectHandler(async()=>({format:{sampleRate:48000,channelCount:1},source:{deviceId:variant==='device'?'other':'device',captureEpochId:variant==='epoch'?'clock:1':'clock:2'}}))
  await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
  native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'injected reset'})
  await wait(()=>!service.busy());await service.finish(native.recordStatus())
  assert.equal(native.starts,1);assert.equal((await document(root)).status,'failed')
 }
})
test('failure preparing a resumed region is fatal, not a device retry loop',async()=>{
 const {native,service,root}=await setup(),original=native.recordStart.bind(native);let reconnects=0
 native.recordStart=(...args)=>{if(native.starts)throw Error('DISK_OPEN_FAILED');return original(...args)}
 service.setReconnectHandler(async()=>{reconnects++;return {format:{sampleRate:48000,channelCount:1},source:{deviceId:'device',captureEpochId:'clock:2'}}})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'injected reset'})
 await wait(()=>!service.busy());await service.finish(native.recordStatus())
 assert.equal(reconnects,1);assert.equal((await document(root)).status,'failed')
})

test('manual-rate session delivers the selected PCM format and keeps original regions',async()=>{
 const {native,service,root}=await setup()
 service.configure({encoding:'pcm24',sampleRate:48000,namePrefix:'ManualRegions'})
 service.setReconnectHandler(async(deviceId)=>{native.rate=48000;native.qpc+=1500000n;return {format:{sampleRate:48000,channelCount:1},source:{deviceId,captureEpochId:'clock:2'}}})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'injected reset'});await wait(()=>native.starts===2)
 await service.stop();await service.finish(native.recordStatus())
 const d=await document(root),delivered=d.assets.filter(a=>a.role==='deliverable'),sources=d.assets.filter(a=>a.role==='source')
 assert(delivered.length>0&&delivered.every(a=>a.sampleRate===48000&&a.encoding==='pcm24'))
 assert.equal(delivered.reduce((n,a)=>n+BigInt(a.frameCount),0n),4800n)
 assert.deepEqual(sources.map(a=>a.sampleRate),[96000,48000])
 const target=await service.analysisSource(d.sessionId,'source',d.regions[1].id)
 assert.equal(target.sampleRate,48000);assert.equal(target.frames,'2400');assert.equal(target.regionId,d.regions[1].id)
 const directory=(await readdir(root))[0]
 assert(!(await readdir(join(root,directory))).some(name=>name.startsWith('conversion-')))
})

test('snapshot failure stops the take and preserves its actual written prefix',async()=>{
 const {native,service,root}=await setup()
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 const invalid=native.recordStatus();invalid.waveform[0].frame=String(BigInt(invalid.writtenFrames)+1n)
 assert.throws(()=>service.display(invalid),/REGION_POSITION_OUT_OF_RANGE/)
 await service.fail('RECORD_SNAPSHOT_FAILED: REGION_POSITION_OUT_OF_RANGE')
 await service.finish(native.recordStatus())
 const d=await document(root)
 assert.equal(service.busy(),false);assert.equal(service.display(invalid),undefined)
 assert.equal(d.status,'failed');assert.match(d.error,/RECORD_SNAPSHOT_FAILED/)
 assert.equal(d.regions[0].frames,'4800')
 assert.equal(d.assets.filter(a=>a.role==='source').length,1)
 assert.equal(d.assets[0].frameCount,'4800');assert.match(d.assets[0].hash,/^[a-f0-9]{64}$/)
})

test('resampled integer WAV reports clipped samples while float WAV retains headroom',async()=>{
 const fixtures=[]
 for(const encoding of ['pcm16','pcm24','float32']){
  const {native,service,root}=await setup();native.constant=1.5
  service.configure({encoding,sampleRate:48000,namePrefix:'ClipFixture'})
  await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
  await service.stop();await service.finish(native.recordStatus())
  const d=await document(root),asset=d.assets.find(a=>a.role==='deliverable')
  assert.equal(d.status,'ready');assert.equal(asset.frameCount,'2400')
  assert.equal(asset.clippedSamples,encoding==='float32'?'0':'2400')
  assert.equal(service.summaries()[0].clippedSamples,asset.clippedSamples)
  assert.equal(d.events.some(e=>e.type==='asset.clipped'),encoding!=='float32')
  const takeDir=join(root,(await readdir(root))[0])
  const saved=await readFile(join(takeDir,asset.relativePath))
  let offset=12,payload
  while(offset+8<=saved.length){const size=saved.readUInt32LE(offset+4);if(saved.toString('ascii',offset,offset+4)==='data'){payload=saved.subarray(offset+8,offset+8+size);break}offset+=8+size+size%2}
  assert(payload)
  for(let i=0;i<2400;i++){
   if(encoding==='float32')assert(Math.abs(payload.readFloatLE(i*4)-1.5)<1e-5)
   else assert.equal(payload.readIntLE(i*(encoding==='pcm16'?2:3),encoding==='pcm16'?2:3),encoding==='pcm16'?32767:8388607)
  }
  const source=d.assets.find(a=>a.role==='source'),raw=await readFile(join(takeDir,source.relativePath))
  assert.equal(raw.readFloatLE(58),1.5)
  fixtures.push({folder:takeDir,sessionId:d.sessionId,encoding})
 }
 writeFileSync(resolve('artifacts/m2-regions/precision-fixtures.json'),JSON.stringify(fixtures,null,2))
})

test('compressed presets create one fixed-rate session view after all regions close',async()=>{
 const {native,service,root}=await setup(),finished=[]
 service.configure({format:'aac',container:'adts',sampleRate:44100,bitrate:192,namePrefix:'CompressedRegions'})
 service.setFinalizedHandler(async id=>finished.push(id))
 service.setReconnectHandler(async deviceId=>{native.rate=48000;native.qpc+=1500000n;return {format:{sampleRate:48000,channelCount:1},source:{deviceId,captureEpochId:'clock:2'}}})
 await service.start({sampleRate:96000,channelCount:1},{deviceId:'device',captureEpochId:'clock:1'})
 native.fail();service.observe(native.recordStatus(),{recoverable:true,error:'reset'});await wait(()=>native.starts===2)
 await service.stop();await service.finish(native.recordStatus())
 const d=await document(root)
 assert.equal(d.preset.format,'aac');assert.equal(d.preset.container,'adts')
 assert.deepEqual(d.assets.filter(a=>a.role==='source').map(a=>[a.sampleRate,a.encoding]),[[96000,'float32'],[48000,'float32']])
 const view=d.assets.filter(a=>a.role==='session')
 assert(view.length&&view.every(a=>a.sampleRate===44100));assert.equal(view.reduce((n,a)=>n+BigInt(a.frameCount),0n),4410n)
 assert.equal(d.assets.filter(a=>a.role==='deliverable').length,0);assert.deepEqual(finished,[d.sessionId])
})
