import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
await mkdir('artifacts/feedback3',{recursive:true})
for(const [name,entry]of [['settings','src/trace/displaySettings.ts'],['zoom','src/trace/renderer/zoom.ts'],['contracts','src/trace/contracts.ts']])await build({entryPoints:[entry],outfile:'artifacts/feedback3/'+name+'.cjs',platform:'node',format:'cjs',bundle:true})
const settings=require('../artifacts/feedback3/settings.cjs'),zoom=require('../artifacts/feedback3/zoom.cjs'),{validateRequest}=require('../artifacts/feedback3/contracts.cjs')
test('fractional time and gain settings stay inside the requested bounds',()=>{
 for(const s of [5,5.001,13.75,59.999,60])assert(settings.validWindowSeconds(s))
 for(const s of [0,4.999,60.001,NaN,Infinity,'30'])assert(!settings.validWindowSeconds(s))
 for(const waveGain of [1,1.125,2.73,4])assert.equal(settings.validateDisplaySettings({targetEnabled:true,targetLufs:-18,waveGain}).waveGain,waveGain)
 for(const waveGain of [.99,4.01,16,NaN,Infinity,'2'])assert.throws(()=>settings.validateDisplaySettings({targetEnabled:true,targetLufs:-18,waveGain}))
})
test('old x16 preference migrates without losing the target line',()=>{
 assert.deepEqual(settings.restoreDisplaySettings({targetEnabled:true,targetLufs:-18,waveGain:16}),{targetEnabled:true,targetLufs:-18,waveGain:4})
 assert.throws(()=>settings.restoreDisplaySettings({targetEnabled:true,targetLufs:-18,waveGain:16,extra:true}))
})
test('wheel scaling is continuous, reversible away from bounds and clamps exactly',()=>{
 const delta=zoom.wheelPixels(120,0),after=zoom.wheelValue(30,delta,5,60)
 assert(after>30&&after<60);assert(Math.abs(zoom.wheelValue(after,-delta,5,60)-30)<1e-12)
 assert(zoom.wheelValue(2,-delta,1,4,true)>2)
 assert.equal(zoom.wheelValue(30,10000,5,60),60);assert.equal(zoom.wheelValue(30,-10000,5,60),5)
 assert.equal(zoom.wheelValue(2,-10000,1,4,true),4);assert.equal(zoom.wheelValue(2,10000,1,4,true),1)
 assert.equal(zoom.wheelPixels(3,1),48);assert.equal(zoom.wheelPixels(NaN,0),0)
})
test('time zoom preserves the pointer anchor and handles short files and long overviews',()=>{
 const start=480000n,end=960000n,anchor=600000n,total=4800000n
 const r=zoom.zoomRange(start,end,total,48000,anchor,-120),a=BigInt(r.start),b=BigInt(r.end)
 assert(b-a>=240000n&&b-a<=2880000n)
 assert(Math.abs(Number(anchor-a)/Number(b-a)-Number(anchor-start)/Number(end-start))<1/Number(b-a))
 assert.deepEqual(zoom.zoomRange(0n,96000n,96000n,48000,24000n,-120),{start:'0',end:'96000'})
 const long=zoom.zoomRange(0n,86400000n,86400000n,48000,43000000n,-120)
 assert.equal(BigInt(long.end)-BigInt(long.start),2880000n)
})
test('gain and device-selection commands reject extra data and invalid values',()=>{
 const make=(command,payload)=>({protocolVersion:1,requestId:'display',expectedStateRevision:0,command,payload})
 assert.equal(validateRequest(make('view.gain',{gain:2.5})).payload.gain,2.5)
 assert.equal(validateRequest(make('devices.select',{deviceId:'endpoint'})).payload.deviceId,'endpoint')
 for(const payload of [{gain:16},{gain:2,volume:1},{gain:'2'}])assert.throws(()=>validateRequest(make('view.gain',payload)))
 assert.throws(()=>validateRequest(make('devices.select',{deviceId:'endpoint',path:'C:/private'})))
})
