import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m2-regions',{recursive:true})
const target=resolve('artifacts/m2-regions/timeline.mjs')
await build({entryPoints:['src/trace/sessionTimeline.ts'],outfile:target,platform:'node',format:'esm',bundle:true})
const {SessionTimeline}=await import(pathToFileURL(target))
function region(id,rate,frames,start='0',clock={}){
 return {id,captureEpochId:'epoch-'+id,format:{sampleRate:rate,channelCount:2},frames:String(frames),startFrame:start,endFrameExclusive:(BigInt(start)+BigInt(frames)).toString(),
  clock:{domain:'same-boot',startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false,...clock}}
}
test('96 to 48 kHz preserves independent frames and records the missing interval',()=>{
 const a=region('a',96000,96000,'9007199254740993',{startQpc100ns:'100000000',endQpc100ns:'110000000'})
 const b=region('b',48000,48000,'17',{startQpc100ns:'125000000',endQpc100ns:'135000000'})
 const timeline=new SessionTimeline([a,b])
 assert.equal(timeline.durationNs,'2000000000')
 assert.equal(timeline.positions[1].mediaStartNs,'1000000000')
 assert.equal(timeline.positions[1].gapBeforeNs,'1500000000')
 assert.equal(timeline.positions[1].gapQuality,'device')
 assert.equal(timeline.captureFrameToMediaNs('a','9007199254788993'),'500000000')
 assert.deepEqual(timeline.mediaNsToRegion('1000000000'),{regionId:'b',relativeFrame:'0'})
 assert.deepEqual(timeline.mediaNsToRegion('2000000000'),{regionId:'b',relativeFrame:'48000'})
})
test('mixed-rate short regions do not accumulate nanosecond rounding loss',()=>{
 const list=Array.from({length:1000},(_,i)=>region(String(i),i%2?48000:44100,1))
 const timeline=new SessionTimeline(list)
 const expected=(500n*1000000000n*48000n+500n*1000000000n*44100n)/(44100n*48000n)
 assert.equal(timeline.durationNs,expected.toString())
 for(const item of list){
  const position=timeline.frameToMediaNs(item.id,'0')
  assert.deepEqual(timeline.mediaNsToRegion(position),{regionId:item.id,relativeFrame:'0'})
 }
})
test('same-file frame and nanosecond mapping round-trip at every supported rate',()=>{
 for(const rate of [44100,48000,88200,96000]){
  const timeline=new SessionTimeline([region('a',rate,rate+17)])
  for(let f=0;f<=rate+17;f+=97)assert.deepEqual(timeline.mediaNsToRegion(timeline.frameToMediaNs('a',String(f))),{regionId:'a',relativeFrame:String(f)})
 }
})
test('unknown clocks and overlaps are never relabeled as captured silence',()=>{
 const a=region('a',48000,48000,'0',{startQpc100ns:'20000000',endQpc100ns:'30000000'})
 const b=region('b',96000,96000,'0',{startQpc100ns:'29000000',endQpc100ns:'39000000'})
 const c=region('c',44100,44100,'0',{domain:'different-process'})
 const timeline=new SessionTimeline([a,b,c])
 assert.equal(timeline.positions[1].overlapBeforeNs,'100000000')
 assert.equal(timeline.positions[1].gapBeforeNs,'0')
 assert.equal(timeline.positions[2].gapQuality,'unknown')
 assert.equal(timeline.positions[2].gapBeforeNs,null)
 assert.equal(timeline.durationNs,'3000000000')
})
test('bad boundaries, duplicate regions and invalid queries fail explicitly',()=>{
 assert.throws(()=>new SessionTimeline([{...region('a',48000,48000),endFrameExclusive:'47999'}]),/REGION_FRAME_MISMATCH/)
 assert.throws(()=>new SessionTimeline([region('a',48000,1),region('a',48000,1)]),/DUPLICATE_REGION/)
 const timeline=new SessionTimeline([region('a',48000,1)])
 assert.throws(()=>timeline.frameToMediaNs('a','2'),/OUT_OF_RANGE/)
 assert.throws(()=>timeline.mediaNsToRegion('-1'),/OUT_OF_RANGE/)
 assert.equal(new SessionTimeline([]).mediaNsToRegion('0'),null)
 assert.equal(new SessionTimeline([region('empty',48000,0)]).mediaNsToRegion('0'),null)
 assert.throws(()=>new SessionTimeline([region('bad',48000,1,'0',{startQpc100ns:'100',endQpc100ns:'99'})]),/INVALID_REGION_CLOCK/)
})
