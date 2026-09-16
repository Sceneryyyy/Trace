import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m9',{recursive:true})
for(const name of ['spectrogramView','spectrogramService'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m9/'+name+'-projection.cjs',platform:'node',format:'cjs',bundle:true})
const {SpectrogramRaster}=(await import(pathToFileURL(resolve('artifacts/m9/spectrogramView-projection.cjs')))).default
const {SpectrogramService}=(await import(pathToFileURL(resolve('artifacts/m9/spectrogramService-projection.cjs')))).default
const max=(a,b)=>a>b?a:b,min=(a,b)=>a<b?a:b
let seed=123456;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
function brute(view,tiles,availableStart,availableEnd){
 const result=new Float32Array(view.width*view.height).fill(-Infinity),status=new Uint8Array(view.width),coverage=new Float32Array(view.width),a=BigInt(view.startFrame),span=BigInt(view.endFrame)-a
 for(let x=0;x<view.width;x++){
  const l=a+span*BigInt(x)/BigInt(view.width),r=a+span*BigInt(x+1)/BigInt(view.width);let covered=0,ready=0
  for(const t of tiles)for(let col=0;col<t.columns;col++){
   const at=BigInt(t.firstFrame)+BigInt(col*t.hop),left=max(l,at),right=min(min(r,at+BigInt(t.hop)),availableEnd)
   if(right<=left)continue
   const s=at-BigInt(t.fftSize)<availableStart?0:t.status[col],n=Number(right-left);covered+=n;status[x]|=1<<s
   if(s!==1)continue;ready+=n
   for(let y=0;y<view.height;y++)for(let bin=view.rowFirstBin[y];bin<=view.rowLastBin[y];bin++)result[y*view.width+x]=Math.max(result[y*view.width+x],t.decibels[col*t.bins+bin])
  }
  if(covered<Number(r-l))status[x]|=1;coverage[x]=ready/Number(r-l)
 }
 return {result,status,coverage}
}
test('cached range maxima exactly match independent per-pixel raw scans across masks, partial edges and uint64 origins',()=>{
 for(let run=0;run<35;run++){
  const origin=run%2?1152921504606846976n:0n,first=origin+512n,tiles=[]
  for(let part=0;part<2;part++){const columns=part?17:64,status=Uint8Array.from({length:columns},()=>Math.floor(random()*4)),decibels=Float32Array.from({length:columns*257},()=>random()<.05?-Infinity:random()*100-100);tiles.push({firstFrame:String(first+BigInt(part*64*128)),columns,status,decibels,fftSize:512,bins:257,hop:128,sampleRate:8000,channels:2})}
  const start=origin+BigInt(Math.floor(random()*1000)),end=first+BigInt(65*128+Math.floor(random()*1900)),availableStart=origin+BigInt(Math.floor(random()*1800)),availableEnd=end-BigInt(Math.floor(random()*1000))
  const r=new SpectrogramRaster({startFrame:String(start),endFrame:String(end),width:13+run%7,height:8+run%9,minFrequency:1+run,maxFrequency:4000},'k',1,8000,512)
  for(const t of tiles)r.add(t,availableStart,availableEnd)
  const actual=r.snapshot(1,true),expected=brute(actual,tiles,availableStart,availableEnd)
  assert.deepEqual(actual.decibels,expected.result);assert.deepEqual(actual.status,expected.status);assert.deepEqual(actual.coverage,expected.coverage)
 }
})
test('maximum raw and derived caches remain bounded while warm view query timing is recorded',async()=>{
 const measurements=[]
 for(const n of [512,2048,16384]){
  const rate=96000,hop=Math.min(n/4,1920),svc=new SpectrogramService({spectrogramTile:async r=>({firstFrame:r.firstFrame,columns:r.columns,fftSize:n,bins:n/2+1,hop,sampleRate:rate,channels:2,decibels:new Float32Array(r.columns*(n/2+1)).fill(-24),status:new Uint8Array(r.columns).fill(1)})})
  const source={identity:'benchmark',request:{kind:'live',sampleRate:rate,positionFrame:'0'},channelCount:2,gridOrigin:'0',availableStart:'0',availableEnd:String(rate*60)},range={startFrame:'0',endFrame:source.availableEnd,width:1024,height:512,minFrequency:20,maxFrequency:48000},times=[]
  for(let i=0;i<4;i++){const t=performance.now();await svc.query(source,{fftSize:n,channel:'stereo'},range);times.push(performance.now()-t);const u=svc.usage;assert(u.bytes+u.projectionBytes<=112*1024*1024)}
  measurements.push({fftSize:n,timesMs:times,usage:svc.usage});await svc.close();assert.equal(svc.usage.bytes+svc.usage.projectionBytes,0)
 }
 await writeFile('artifacts/m9/projection-benchmark.json',JSON.stringify({status:'pass',kind:'mock-native-raster-only',measurements},null,2));console.log(measurements.map(m=>({fft:m.fftSize,warmMs:m.timesMs.slice(1)})))
})
