import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m9',{recursive:true})
const modules={}
for(const [name,entry] of Object.entries({scale:'spectrogramScale',raster:'spectrogramView',presentation:'renderer/spectrogramPresentation',overview:'spectrogramOverview'})){
 const outfile='artifacts/m9/scale-'+name+'.cjs'
 await build({entryPoints:['src/trace/'+entry+'.ts'],outfile,platform:'node',format:'cjs',bundle:true})
 modules[name]=(await import(pathToFileURL(resolve(outfile)))).default
}
const {frequencyAt,frequencyRatio,frequencyTicks,zoomFrequencies}=modules.scale
test('smooth frequency scale keeps sub-20 Hz compact and allocates useful high-frequency space at every supported Nyquist',()=>{
 for(const hi of [22050,24000,48000]){
  assert(frequencyRatio(20,1,hi)<.01)
  assert(frequencyRatio(20000,1,hi)-frequencyRatio(10000,1,hi)>.15)
  for(const lo of [1,20,5000])for(let n=0;n<=100;n++){
   const ratio=n/100,hz=frequencyAt(ratio,lo,hi)
   assert(hz>=lo&&hz<=hi)
   assert(Math.abs(frequencyRatio(hz,lo,hi)-ratio)<1e-12)
  }
 }
 const below=frequencyRatio(699,20,20000),at=frequencyRatio(700,20,20000),above=frequencyRatio(701,20,20000)
 assert(Math.abs((at-below)/(above-at)-1)<.002)
})
test('zoom preserves the pointer frequency when unconstrained and never leaves 1 Hz to Nyquist',()=>{
 const before=frequencyAt(.6,100,10000),next=zoomFrequencies(100,10000,24000,.6,-100)
 assert(Math.abs(frequencyAt(.6,next.minFrequency,next.maxFrequency)-before)<1e-8)
 for(const ratio of [0,.1,.5,.9,1])for(const delta of [-10000,-100,100,10000]){
  const s=zoomFrequencies(1,24000,24000,ratio,delta)
  assert(s.minFrequency>=1&&s.maxFrequency<=24000&&s.minFrequency<s.maxFrequency)
 }
})
test('a calibrated raw tone appears at its frequency coordinate and raw tiles remain unchanged',()=>{
 const n=16384,rate=48000,bin=5120,columns=2,hop=960
 const raw=new Float32Array(columns*(n/2+1)).fill(-Infinity)
 for(let x=0;x<columns;x++)raw[x*(n/2+1)+bin]=-12
 const original=raw.slice(),r=new modules.raster.SpectrogramRaster({startFrame:String(n),endFrame:String(n+columns*hop),width:2,height:256,minFrequency:1,maxFrequency:24000},'tone',1,rate,n)
 r.add({fftSize:n,sampleRate:rate,hop,columns,bins:n/2+1,channels:2,firstFrame:String(n),decibels:raw,status:new Uint8Array(columns).fill(1)},0n,BigInt(n+columns*hop))
 const view=r.snapshot(1,true),expected=Math.floor(Math.log((700+bin*rate/n)/(700+1))/Math.log((700+24000)/(700+1))*256)
 assert.equal(view.decibels[expected*2],-12)
 assert(view.rowFirstBin[expected]<=bin&&view.rowLastBin[expected]>=bin)
 assert.deepEqual(raw,original)
})
test('frequency labels keep endpoints and avoid collisions in compact and tall plots',()=>{
 for(const height of [90,180,500]){
  const ticks=frequencyTicks(20,20000,height)
  assert.equal(ticks[0],20);assert.equal(ticks.at(-1),20000)
  for(let i=1;i<ticks.length;i++)assert((frequencyRatio(ticks[i],20,20000)-frequencyRatio(ticks[i-1],20,20000))*height>=19.999)
 }
})
test('numeric colour legends keep exact custom limits with readable interior values',()=>{
 for(const [min,max] of [[-100,0],[-83,-11],[-180,24],[-20,-8]])for(const height of [60,180,500]){
  const ticks=modules.presentation.decibelTicks(min,max,height)
  assert.equal(ticks[0],max);assert.equal(ticks.at(-1),min)
  assert.equal(new Set(ticks).size,ticks.length)
  for(let i=1;i<ticks.length;i++)assert((ticks[i-1]-ticks[i])*height/(max-min)>=17.999)
 }
})

test('Mel raster and merged overview retain peaks at the same frequency row across rates, with gaps and raw tiles unchanged',()=>{
 for(const rate of [44100,48000,96000])for(const hz of [100,1000,15000]){
  const fftSize=4096,bins=fftSize/2+1,hop=Math.min(fftSize/4,Math.floor(rate/50)),bin=Math.round(hz*fftSize/rate),first=fftSize,columns=4;
  const tile={fftSize,sampleRate:rate,hop,columns,bins,channels:2,firstFrame:String(first),decibels:new Float32Array(columns*bins).fill(-Infinity),status:new Uint8Array([1,2,1,1])};
  for(let x=0;x<columns;x++)tile.decibels[x*bins+bin]=x===1?20:-12;
  const original=tile.decibels.slice(),overview=modules.overview.mergeOverview(modules.overview.overviewFromTile(tile,'tone'));
  const range={startFrame:String(first),endFrame:String(first+columns*hop),width:2,height:128,minFrequency:1,maxFrequency:rate/2};
  const raw=new modules.raster.SpectrogramRaster(range,'tone',1,rate,fftSize),lod=new modules.raster.SpectrogramRaster(range,'tone',1,rate,fftSize);
  raw.add(tile,0n,BigInt(first+columns*hop));lod.addOverview(overview,0n,BigInt(first+columns*hop));
  const a=raw.snapshot(1,true),b=lod.snapshot(1,true),y=Math.floor(frequencyRatio(bin*rate/fftSize,1,rate/2)*range.height);
  assert.equal(a.decibels[y*2],-12);assert.equal(b.decibels[y*2],-12);assert.equal(b.overviewLevel,1);assert.equal(b.overviewBinStride,2);
  assert.deepEqual(b.rowFirstBin,a.rowFirstBin);assert.deepEqual(b.rowLastBin,a.rowLastBin);assert.deepEqual(b.coverage,a.coverage);assert.deepEqual(b.status,a.status);
  assert(b.status[0]&4);assert.equal(b.coverage[0],.5);assert.equal(Math.max(...b.decibels),-12);assert.deepEqual(tile.decibels,original);
 }
})
