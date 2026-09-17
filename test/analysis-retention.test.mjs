import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m4',{recursive:true})
await build({entryPoints:['src/trace/analysisService.ts'],outfile:'artifacts/m4/analysis-retention.cjs',platform:'node',format:'cjs',bundle:true})
const {AnalysisService}=(await import(pathToFileURL(resolve('artifacts/m4/analysis-retention.cjs')))).default
const next=()=>new Promise(resolve=>setImmediate(resolve))
test('active file analysis survives bounded job-history eviction until released',async()=>{
 const run=async()=>({directory:'test-only',cacheHit:false,manifest:{frames:'1',sampleRate:48000,channelCount:1,summary:{},cacheKey:'test-only'}})
 const service=new AnalysisService('test-only',()=>{},run)
 async function start(index){const id=service.start({takeId:String(index),role:'source',label:'test-only',sources:['unused'],cacheRoot:'unused',sampleRate:48000,channelCount:1,frames:'1'});while(service.snapshots().find(j=>j.id===id)?.phase!=='ready')await next();return id}
 const pinned=await start(0);service.retain(pinned)
 for(let i=1;i<=80;i++)await start(i)
 assert(service.snapshots().some(j=>j.id===pinned));assert.equal(service.snapshots().length,64)
 service.retain(pinned);service.release(pinned);await start(81)
 assert(service.snapshots().some(j=>j.id===pinned),'the report lease survives closing the playback consumer')
 service.release(pinned);await start(82)
 assert(!service.snapshots().some(j=>j.id===pinned));assert.equal(service.snapshots().length,64)
 await service.shutdown()
})

test('releasing a selection cancels only after every playback/reference consumer is gone',async()=>{
 let signal;const run=async(_path,_sources,_cache,options)=>{signal=options.signal;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))};const service=new AnalysisService('test-only',()=>{},run),id=service.start({takeId:'take',role:'source',label:'range',sources:['unused'],cacheRoot:'unused',sampleRate:48000,channelCount:1,frames:'10'});service.retain(id);service.retain(id);while(!signal)await next();service.release(id,true);assert.equal(signal.aborted,false);service.release(id,true);assert.equal(signal.aborted,true);await service.shutdown()
})
