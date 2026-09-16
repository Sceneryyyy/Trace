import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m9',{recursive:true})
for(const name of ['spectrogramService','spectrogramSource','spectrogramView'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m9/'+name+'.cjs',bundle:true,platform:'node',format:'cjs'})
const mod=async name=>(await import(pathToFileURL(resolve('artifacts/m9/'+name+'.cjs')))).default
const {SpectrogramService}=await mod('spectrogramService')
const {sourceKey,firstWindowEnd,fileSpectrogramSource,replaySpectrogramSource,liveSpectrogramSource,takeSpectrogramSource}=await mod('spectrogramSource')
const {SpectrogramRaster}=await mod('spectrogramView')
const config={fftSize:512,channel:'stereo'}
const source=(identity='source',end='8192')=>({identity,channelCount:2,gridOrigin:'0',availableStart:'0',availableEnd:end,request:{kind:'live',sourceId:identity,epochId:'1',measurementEpoch:'1',sampleRate:8000,positionFrame:'0'}})
const range=(start='512',end='8192')=>({startFrame:start,endFrame:end,width:100,height:40,minFrequency:100,maxFrequency:4000})
function tile(r) {
  const fftSize=r.config.fftSize,bins=fftSize/2+1,hop=Math.min(fftSize/4,Math.floor(r.sampleRate/50))
  const decibels=new Float32Array(r.columns*bins).fill(-60)
  for(let c=0;c<r.columns;c++){decibels[c*bins+9]=-12;decibels[c*bins+10]=-48}
  return {firstFrame:r.firstFrame,columns:r.columns,fftSize,bins,hop,sampleRate:r.sampleRate,channels:2,decibels,status:new Uint8Array(r.columns).fill(1)}
}
test('four source descriptors preserve real frame origins, replay phase and private file identity',()=>{
  const s=liveSpectrogramSource({sourceId:'device',epochId:'4',measurementEpoch:'7',positionFrame:'15000',measurementFrames:'5000',format:{sampleRate:8000,channelCount:2},error:null,diagnostics:{replayStartFrame:'10000',replayEndFrame:'15000'}})
  assert.equal(s.gridOrigin,'10000');assert.equal(firstWindowEnd(s,config),10512n)
  const replay=replaySpectrogramSource({sourceId:'device',epochId:'4',measurementEpoch:'7',originFrame:'987',captureStartFrame:'10987',frames:'2000',sampleRate:8000,channelCount:2})
  assert.equal(firstWindowEnd(replay,config),549n);assert.equal((firstWindowEnd(replay,config)+987n-512n)%128n,0n)
  const take=takeSpectrogramSource({id:'native-region',error:null,sourceFormat:{sampleRate:8000,channelCount:2},replayStartFrame:'100',replayEndFrame:'8100'})
  assert.equal(take.request.sourceId,'native-region');assert.equal(firstWindowEnd(take,config),512n)
  const file=fileSpectrogramSource({mediaIdentity:'content:one',sources:[resolve('fixture.wav')],cacheRoot:resolve('artifacts/m9/file-cache'),sampleRate:8000,channelCount:2,frames:'7000',decodeRange:{startFrame:'1000',endFrame:'8000'}})
  assert.equal(file.gridOrigin,'0');assert.equal(file.request.startFrame,'1000');assert.equal(file.availableEnd,'7000')
  assert.equal(sourceKey(s,config),sourceKey({...s,availableEnd:'16000'},config))
  assert.notEqual(sourceKey(file,config),sourceKey({...file,request:{...file.request,endFrame:'9000'}},config))
  assert.throws(()=>fileSpectrogramSource({}),/IDENTITY_REQUIRED/)
  assert.throws(()=>fileSpectrogramSource({cacheRoot:'',sources:['relative.wav']},'verified-content'),/INVALID/)
  assert.throws(()=>sourceKey({...s,cacheRoot:'not-allowed'},config),/INVALID/)
})
test('raster retains gap/unavailable coverage instead of presenting their placeholders as audio',()=>{
  const r=new SpectrogramRaster({...range('512','1024'),width:2,height:1,minFrequency:100,maxFrequency:400},'key',1,8000,512)
  const t=tile({sampleRate:8000,config,firstFrame:'512',columns:4});t.status.set([1,2,0,1]);t.decibels.fill(0,257,257*3)
  r.add(t,0n,1024n);const v=r.snapshot(1,true)
  assert.deepEqual([...v.coverage],[.5,.5]);assert.deepEqual([...v.status],[6,3]);assert.deepEqual([...v.decibels],[-12,-12])
  const copy=r.snapshot(1,true);v.decibels[0]=9;assert.equal(copy.decibels[0],-12)
})
test('large uint64 frames and uneven pixel widths have no one-frame holes',()=>{
  const base=1152921504606847488n
  const raster=new SpectrogramRaster({...range(String(base),String(base+10n)),width:3,height:1,minFrequency:100,maxFrequency:400},'key',1,8000,512)
  raster.add(tile({sampleRate:8000,config,firstFrame:String(base),columns:1}),base-512n,base+10n)
  const view=raster.snapshot(1,true);assert.deepEqual([...view.coverage],[1,1,1]);assert.deepEqual([...view.status],[2,2,2])
})
test('display peak aggregation and precise bin readings remain distinct',async()=>{
  let calls=0;const s=new SpectrogramService({spectrogramTile:async r=>{calls++;return tile(r)}})
  const v=await s.query(source('one','768'),config,{...range('512','768'),width:1,height:1,minFrequency:100,maxFrequency:400})
  assert.equal(v.decibels[0],-12)
  const p=await s.point(v.key,'600',156.25)
  assert.equal(p.frame,'512');assert.equal(p.windowStart,'0');assert.equal(p.bin,10);assert.equal(p.frequency,156.25);assert.equal(p.decibels,-48)
  assert.equal(calls,1);await s.close()
})
test('short files and silence remain different from unavailable data',async()=>{
  let calls=0;const s=new SpectrogramService({spectrogramTile:async r=>{calls++;const t=tile(r);t.decibels.fill(-Infinity);return t}})
  const short=await s.query(source('short','200'),config,range('0','200'));assert.equal(calls,0);assert(short.status.every(v=>v===1))
  const v=await s.query(source('silence','1000'),config,range('0','1000'))
  assert.equal((await s.point(v.key,'700',1000)).status,'silence');assert.equal((await s.point(v.key,'10',1000)).status,'unavailable')
  assert.equal((await s.point(v.key,'1001',1000)).status,'unavailable');await s.close()
})
test('latest request replaces queued views, cancels stale publication and preserves bounded work',async()=>{
  let release,entered;const entry=new Promise(r=>entered=r);let calls=0
  const s=new SpectrogramService({spectrogramTile:async r=>{if(++calls===1){entered();await new Promise(done=>release=done)}return tile(r)}})
  const old=s.query(source('old'),config,range());const oldRejected=assert.rejects(old,/CANCELLED/);await entry
  const skipped=s.query(source('skipped'),config,range());const skippedRejected=assert.rejects(skipped,/CANCELLED/)
  const latest=s.query(source('latest'),config,range());assert(s.usage.views<=2);release()
  await oldRejected;await skippedRejected;const v=await latest;assert.equal(v.key,sourceKey(source('latest'),config));assert.equal(calls,2)
  // Query issued immediately by a resolved consumer must not get stuck behind a settled pump.
  const again=await s.query(source('latest'),config,range());assert.equal(again.key,v.key);assert.equal(calls,2)
  await s.close();assert.equal(s.usage.bytes,0)
})
test('passive history evicts expired tiles and never walks the whole recording duration',async()=>{
  let calls=0;const s=new SpectrogramService({spectrogramTile:async r=>{calls++;return tile(r)}})
  const start=8000n*60n*60n*10n
  const s1={...source('long',String(start+8000n)),availableStart:String(start)}
  await s.query(s1,config,range('0',s1.availableEnd));assert(calls<=2)
  const s2={...s1,availableStart:String(start+16000n),availableEnd:String(start+24000n)}
  const v=await s.query(s2,config,range(s2.availableStart,s2.availableEnd))
  assert.equal((await s.point(v.key,String(start+1000n),1000)).status,'unavailable')
  assert(s.usage.tiles<=3);assert.equal(s.usage.pending,0);await s.close()
})
test('cache reopen reuses file blocks, configuration switches separate identities, original stays intact',async()=>{
  const dir=await mkdtemp(resolve('artifacts/m9/service-')),audio=join(dir,'original.wav');await writeFile(audio,'source sentinel')
  const file=fileSpectrogramSource({mediaIdentity:'original-content',sources:[audio],cacheRoot:join(dir,'cache'),sampleRate:8000,channelCount:2,frames:'8192'})
  let calls=0;const native={spectrogramTile:async r=>{calls++;return tile(r)}}
  const a=new SpectrogramService(native);const one=await a.query(file,config,range());await a.close()
  const b=new SpectrogramService(native);await b.query(file,config,range());assert.equal(calls,1)
  const two=await b.query(file,{...config,channel:'left'},range());assert.notEqual(one.key,two.key);assert.equal(calls,2)
  await b.close();assert.equal(await readFile(audio,'utf8'),'source sentinel');assert.equal((await readdir(file.cacheRoot)).length,2)
})
test('closing in-flight work rejects late results and releases bounded storage',async()=>{
  let release,entered;const entry=new Promise(r=>entered=r)
  const s=new SpectrogramService({spectrogramTile:async r=>{entered();await new Promise(done=>release=done);return tile(r)}})
  const pending=s.query(source(),config,range());const rejected=assert.rejects(pending,/CANCELLED/);await entry
  const closed=s.close();release();await rejected;await closed;assert.equal(s.usage.bytes,0)
  await assert.rejects(s.query(source(),config,range()),/CLOSED/)
})
test('wrong native shape, impossible view and untrusted frame text cannot become ready data',async()=>{
  const s=new SpectrogramService({spectrogramTile:async r=>({...tile(r),channels:1})})
  await assert.rejects(s.query(source(),config,range()),/STALE/)
  for(const patch of [{width:1025},{height:513},{startFrame:'-1'},{startFrame:'01'},{endFrame:'18446744073709551616'},{minFrequency:0},{maxFrequency:4001}])await assert.rejects(s.query(source(),config,{...range(),...patch}),/INVALID/)
  await s.close()
})
