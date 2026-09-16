import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/m8',{recursive:true})
for(const n of ['instrumentTypes','instrumentService','contracts'])await build({entryPoints:['src/trace/'+n+'.ts'],outfile:'artifacts/m8/'+n+'.cjs',platform:'node',format:'cjs',bundle:true})
const mod=async n=>(await import(pathToFileURL(resolve('artifacts/m8/'+n+'.cjs')))).default
const {InstrumentService}=await mod('instrumentService'),{defaultInstrumentSettings:s,validateInstrumentSettings,instrumentConfigKey}=await mod('instrumentTypes'),{validateRequest}=await mod('contracts')
const request={kind:'file',sampleRate:48000,positionFrame:'48000',identity:'one',sources:['fixture']}
function result(r=request){return {status:'ready',sampleRate:48000,channelCount:2,positionFrame:r.positionFrame,windowStart:String(BigInt(r.positionFrame)-2048n),fftSize:2048,hop:512,binHz:48000/2048,averageWindows:29,holdWindows:94,partialAverage:false,partialHold:false,current:new Float64Array(1025).fill(.01),average:new Float64Array(1025).fill(.01),peakHold:new Float64Array(1025).fill(.04),elapsedMs:1,field:{correlation:{status:'ready',value:1},balance:{status:'ready',value:0},firstFrame:String(BigInt(r.positionFrame)-14400n),endFrame:r.positionFrame,partial:false,points:new Float32Array([0,.1,0,0]),polarRms:new Float64Array(181),polarPeak:new Float64Array(181),polarEnvelope:new Float64Array(181)}}}
test('settings are bounded and display controls do not change analysis identity',()=>{
 assert.deepEqual(validateInstrumentSettings(s),s)
 assert.equal(instrumentConfigKey({...s,fieldGain:8,fieldMode:'polarLevel',showAverage:false}),instrumentConfigKey(s))
 for(const v of [{...s,fftSize:513},{...s,holdMs:2001},{...s,fieldGain:0},{...s,minFrequency:s.maxFrequency},{...s,paths:['x']}])assert.throws(()=>validateInstrumentSettings(v))
 const r={protocolVersion:1,requestId:'config',expectedStateRevision:0,command:'instrument.configure',payload:{settings:s}}
 assert.equal(validateRequest(r).command,'instrument.configure');assert.throws(()=>validateRequest({...r,payload:{...r.payload,sources:['secret']}}))
})
test('bounded async service waits for shutdown and rejects excess work',async()=>{
 const resolvers=[],service=new InstrumentService({instrumentAnalyze:r=>new Promise(resolve=>resolvers.push(()=>resolve(result(r))))})
 const a=service.query(request,s),b=service.query({...request,positionFrame:'50000'},s);await Promise.resolve()
 assert.equal(service.pending,2);assert.equal((await service.query({...request,positionFrame:'51000'},s)).error,'INSTRUMENT_QUEUE_FULL')
 let closed=false;const closing=service.shutdown().then(()=>closed=true);await Promise.resolve();assert(!closed)
 for(const resolve of resolvers)resolve();assert.equal((await a).phase,'ready');await b;await closing;assert.equal(service.pending,0)
 assert.equal((await service.query(request,s)).error,'INSTRUMENT_CLOSED')
})
test('two-result cache is keyed by asset, position and algorithm config rather than visual controls',async()=>{
 let calls=0;const service=new InstrumentService({instrumentAnalyze:async r=>{++calls;return result(r)}})
 await service.query(request,s);await service.query(request,{...s,fieldGain:8});assert.equal(calls,1)
 await service.query({...request,identity:'two'},s);assert.equal(calls,2)
 await service.query({...request,identity:'three'},s);await service.query(request,s);assert.equal(calls,4)
 await service.shutdown()
})
test('wrong-frame and nonfinite native results never become valid display packets',async()=>{
 const bad=result();bad.positionFrame='47000'
 const service=new InstrumentService({instrumentAnalyze:async()=>bad});assert.equal((await service.query(request,s)).phase,'error')
 const nan=result();nan.current[5]=NaN;const service2=new InstrumentService({instrumentAnalyze:async()=>nan});assert.equal((await service2.query(request,s)).phase,'error')
})
test('transient native failures are not cached as success',async()=>{
 let calls=0;const service=new InstrumentService({instrumentAnalyze:async r=>{if(++calls===1)throw Error('STALE_INSTRUMENT_SOURCE');return result(r)}})
 assert.equal((await service.query(request,s)).phase,'error');assert.equal((await service.query(request,s)).phase,'ready');assert.equal(calls,2)
})
