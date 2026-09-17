import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/transport',{recursive:true})
await build({entryPoints:['src/trace/renderer/snapshotTransport.ts'],outfile:'artifacts/transport/stream.cjs',bundle:true,platform:'node',format:'cjs'})
const {createSnapshotTransport}=(await import(pathToFileURL(resolve('artifacts/transport/stream.cjs')))).default
test('one incoming stream shares the same immutable-by-contract snapshot with subscribers',()=>{
 let deliver,subscriptions=0;const host={request:async x=>x,onState:()=>()=>{}}
 const api=createSnapshotTransport(host,fn=>{deliver=fn;subscriptions++}),seen=[]
 const off=api.onSnapshot(s=>seen.push(s));api.onSnapshot(s=>seen.push(s))
 const snapshot={protocolVersion:1,positionFrame:'42',instruments:{data:{current:new Float64Array([.5,.25])}}};deliver(snapshot)
 assert.equal(subscriptions,1);assert.equal(seen.length,2);assert.strictEqual(seen[0],snapshot);assert.strictEqual(seen[1],snapshot)
 off();deliver(snapshot);assert.equal(seen.length,3)
})
test('duplicate subscriber functions have independent removals and late subscribers receive only latest',()=>{
 let deliver,count=0;const api=createSnapshotTransport({request:async()=>null,onState:()=>()=>{}},fn=>deliver=fn),listener=()=>count++
 const first=api.onSnapshot(listener),second=api.onSnapshot(listener);deliver({positionFrame:'1'});assert.equal(count,2);first();deliver({positionFrame:'2'});assert.equal(count,3);second()
 let latest;api.onSnapshot(s=>latest=s);assert.equal(latest.positionFrame,'2')
})
test('transport only forwards the already-whitelisted host controls',async()=>{
 let request,files;const api=createSnapshotTransport({request:async v=>{request=v;return 7},onState:()=>()=>{},importFiles:async v=>{files=v;return {accepted:[],errors:[]}}},()=>{})
 assert.deepEqual(Object.keys(api).sort(),['importFiles','onReference','onSnapshot','onSpectrogram','onState','request'])
 const value={command:'state.get'};assert.equal(await api.request(value),7);assert.strictEqual(request,value)
 const input=[{testOnly:'disk-File reference is validated in preload'}];await api.importFiles(input);assert.strictEqual(files,input)
})

test('spectrogram subscriptions are independent and do not retain or replay old raster arrays',()=>{
 let deliver,count=0;const api=createSnapshotTransport({request:async()=>null,onState:()=>()=>{}},()=>{},fn=>deliver=fn)
 const fn=()=>count++,off1=api.onSpectrogram(fn),off2=api.onSpectrogram(fn)
 deliver({requestId:'one',phase:'ready'});assert.equal(count,2);off1();deliver({requestId:'two',phase:'ready'});assert.equal(count,3);off2()
 api.onSpectrogram(fn);assert.equal(count,3);deliver({requestId:'three',phase:'ready'});assert.equal(count,4)
})
