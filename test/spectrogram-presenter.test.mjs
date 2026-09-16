import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m9',{recursive:true})
for(const name of ['spectrogramPresenter','contracts','spectrogramProtocol'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m9/'+name+'.cjs',platform:'node',format:'cjs',bundle:true})
const load=async name=>(await import(pathToFileURL(resolve('artifacts/m9/'+name+'.cjs')))).default
const {SpectrogramPresenter}=await load('spectrogramPresenter'),{validateRequest,isMutation}=await load('contracts'),{defaultSpectrogramSettings:settings}=await load('spectrogramProtocol')
const payload={source:{kind:'file',sourceId:'file-one',epochId:'0',measurementEpoch:'0'},range:{startFrame:'0',endFrame:'4000',width:100,height:40}}
const source={identity:'one',request:{kind:'replay',sampleRate:8000,positionFrame:'0'},channelCount:2,gridOrigin:'0',availableStart:'0',availableEnd:'4000'}
const binding={source,range:{...payload.range,minFrequency:20,maxFrequency:4000},toNative:s=>String(BigInt(s)-100000n),toAxis:s=>String(BigInt(s)+100000n),valid:()=>true}
function tile(r){return {firstFrame:r.firstFrame,columns:r.columns,fftSize:r.config.fftSize,bins:r.config.fftSize/2+1,hop:Math.min(r.config.fftSize/4,160),sampleRate:8000,channels:2,decibels:new Float32Array(r.columns*(r.config.fftSize/2+1)).fill(-24),status:new Uint8Array(r.columns).fill(1)}}
const wait=()=>new Promise(r=>setTimeout(r,15))
test('spectral IPC validates complete source/range, rejects paths and keeps queries independent',()=>{
 const base={protocolVersion:1,requestId:'q',expectedStateRevision:0}
 assert.equal(validateRequest({...base,command:'spectrogram.query',payload}).command,'spectrogram.query')
 assert(!isMutation('spectrogram.query'));assert(!isMutation('spectrogram.point'));assert(!isMutation('spectrogram.cancel'));assert(isMutation('spectrogram.configure'))
 for(const p of [{...payload,path:'c:/secret'},{...payload,source:{...payload.source,paths:['secret']}},{...payload,range:{...payload.range,width:1025}},{...payload,source:{...payload.source,epochId:'-1'}}])assert.throws(()=>validateRequest({...base,command:'spectrogram.query',payload:p}))
 assert.throws(()=>validateRequest({...base,command:'spectrogram.point',payload:{queryId:'q',positionFrame:'0',frequency:NaN}}))
 assert.throws(()=>validateRequest({...base,command:'spectrogram.configure',payload:{settings:{...settings,cacheRoot:'secret'}}}))
})
test('presenter correlates request IDs, maps points to shared axis and ignores stale cancellation',async()=>{
 const packets=[],p=new SpectrogramPresenter({spectrogramTile:async r=>tile(r)},async()=>binding,v=>packets.push(v))
 p.request('one',payload,settings);await wait();assert.equal(packets.at(-1).requestId,'one');assert.equal(packets.at(-1).axisStartFrame,'100000')
 const point=await p.point('one','103000',750);assert(BigInt(point.frame)>=100000n);assert(BigInt(point.nativeFrame)<4000n)
 p.request('two',payload,settings);p.cancel('one');await wait();assert.equal(packets.at(-1).requestId,'two')
 await assert.rejects(p.point('one','103000',750),/STALE/);await p.close();assert.equal(p.usage.bytes,0)
})
test('release waits for native work and source teardown cannot publish a late packet',async()=>{
 let release,entered;const entry=new Promise(r=>entered=r),packets=[]
 const p=new SpectrogramPresenter({spectrogramTile:async r=>{entered();await new Promise(done=>release=done);return tile(r)}},async()=>binding,v=>packets.push(v))
 p.request('old',payload,settings);await entry;let done=false;const closing=p.release().then(()=>done=true);await wait();assert(!done)
 assert.throws(()=>p.request('during-close',payload,settings),/CHANGING/);release();await closing;assert.deepEqual(packets,[])
 await p.close()
})
test('late source resolution and invalidated source never overwrite the new source',async()=>{
 let finish;const packets=[]
 const p=new SpectrogramPresenter({spectrogramTile:async r=>tile(r)},q=>q.source.sourceId==='file-one'?new Promise(r=>finish=r):Promise.resolve(binding),v=>packets.push(v))
 p.request('old',payload,settings);p.request('new',{...payload,source:{...payload.source,sourceId:'file-two'}},settings);finish(binding);await wait()
 assert(packets.length>0);assert(packets.every(v=>v.requestId==='new'));await p.close()
})
