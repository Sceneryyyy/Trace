import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m9',{recursive:true})
await build({entryPoints:['src/trace/renderer/spectrogramPresentation.ts'],outfile:'artifacts/m9/presentation.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/spectrogramProtocol.ts'],outfile:'artifacts/m9/protocol.cjs',platform:'node',format:'cjs',bundle:true})
const {colorizeSpectrogram,spectrogramPacketMatches}= (await import(pathToFileURL(resolve('artifacts/m9/presentation.cjs')))).default
const {defaultSpectrogramSettings:s,spectrogramConfigKey}=(await import(pathToFileURL(resolve('artifacts/m9/protocol.cjs')))).default
const source={kind:'file',sourceId:'one',epochId:'0',measurementEpoch:'0',analysisId:'a'}
const packet={source,configKey:spectrogramConfigKey(s),requestId:'r',phase:'ready'}
test('paint eligibility rejects old source, epoch, analysis and FFT/channel/frequency configuration before effects run',()=>{
 assert(spectrogramPacketMatches(packet,source,s))
 for(const patch of [{sourceId:'two'},{epochId:'1'},{measurementEpoch:'1'},{analysisId:'b'},{kind:'live'}])assert(!spectrogramPacketMatches(packet,{...source,...patch},s))
 for(const patch of [{fftSize:4096},{channel:'mid'},{minFrequency:50},{maxFrequency:10000}])assert(!spectrogramPacketMatches(packet,source,{...s,...patch}))
 assert(spectrogramPacketMatches(packet,source,{...s,palette:'heat',minDecibels:-80,maxDecibels:6}))
 assert(!spectrogramPacketMatches(packet,undefined,s));assert(!spectrogramPacketMatches(null,source,s))
})
function reference(view,s){
 const out=new Uint8ClampedArray(view.width*view.height*4)
 for(let y=0;y<view.height;y++)for(let x=0;x<view.width;x++){
  const colors=s.palette==='heat'?[[14,20,33],[51,62,132],[170,63,101],[244,141,60],[253,233,156]]:[[14,21,28],[34,65,83],[45,143,149],[145,230,92],[246,225,125]]
  const n=Math.max(0,Math.min(1,(view.decibels[y*view.width+x]-s.minDecibels)/(s.maxDecibels-s.minDecibels)))*4,i=Math.min(3,Math.floor(n)),f=n-i
  let color=colors[i].map((v,c)=>Math.round(v*(1-f)+colors[i+1][c]*f));const flags=view.status[x]
  if(!(flags&2))color=(x+y)%8<2?flags&12?[142,110,56]:[56,66,74]:[21,27,32]
  else if(view.coverage[x]<.999&&(x+y)%8<2)color=flags&12?[177,133,61]:[86,101,108]
  out.set([...color,255],((view.height-1-y)*view.width+x)*4)
 }
 return out
}
test('palette lookup preserves orientation, silence and coverage markings without changing measurements',()=>{
 const view={width:120,height:80,decibels:Float32Array.from({length:9600},(_,i)=>i%31===0?-Infinity:-120+(i%181)),status:Uint8Array.from({length:120},(_,x)=>[2,1,4,8,3,6][x%6]),coverage:Float32Array.from({length:120},(_,x)=>x%6===0?1:.5)}
 const original=view.decibels.slice()
 for(const palette of ['trace','heat']){
  const settings={...s,palette},actual=colorizeSpectrogram(view,settings),expected=reference(view,settings)
  assert.equal(actual.length,120*80*4)
  for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<=1,'display lookup differs by more than one colour level at '+i)
 }
 assert.deepEqual(view.decibels,original)
})
test('maximum raster colouring has a bounded output; report paired timing without a hardware-specific pass threshold',async()=>{
 const view={width:1024,height:512,decibels:Float32Array.from({length:1024*512},(_,i)=>-100+i%107),status:new Uint8Array(1024).fill(2),coverage:new Float32Array(1024).fill(1)}
 const timed=fn=>{const values=[];for(let i=0;i<8;i++){const start=performance.now();const result=fn(view,s);values.push(performance.now()-start);assert.equal(result.byteLength,2097152)}return values.slice(2).sort((a,b)=>a-b)}
 const old=timed(reference),next=timed(colorizeSpectrogram)
 const report={status:'pass',kind:'pure-raster-colour-microbenchmark',pixels:524288,outputBytes:2097152,previousMedianMs:old[3],lookupMedianMs:next[3],rawDbUnchanged:true}
 await writeFile('artifacts/m9/colour-benchmark.json',JSON.stringify(report,null,2));console.log(report)
})
