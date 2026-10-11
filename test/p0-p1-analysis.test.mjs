import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/p0-p1',{recursive:true})
const modules=['performance','spectrumDisplay','instrumentTypes','referenceMatch','spectrogramOverview','spectrogramView','spectrogramService','spectralDiskBudget','markerStore','loudnessDistribution','chartExport']
await build({stdin:{contents:modules.map(name=>`export * from './src/trace/${name}'`).join('\n'),resolveDir:resolve('.')},outfile:'artifacts/p0-p1/checks.cjs',bundle:true,platform:'node',format:'cjs'})
const m=(await import(pathToFileURL(resolve('artifacts/p0-p1/checks.cjs')))).default
const metric=(value,unit='LUFS',status='ready')=>({value:status==='ready'?value:null,unit,status})
const tile=(first,columns=64)=>({firstFrame:String(first),columns,fftSize:512,hop:128,bins:257,sampleRate:8000,channels:1,decibels:new Float32Array(columns*257).fill(-100),status:new Uint8Array(columns).fill(1)})
test('performance history is bounded and reports only finite observations',()=>{
 const p=new m.PerformanceWindow();assert.equal(p.snapshot().p99Ms,null);for(let n=0;n<5000;n++)p.observe(n);p.observe(NaN);p.observe(-1);const s=p.snapshot();assert.equal(s.count,5000);assert.equal(s.windowCount,2048);assert.equal(s.maxMs,4999);assert(s.p50Ms>3900);assert(s.p99Ms<5000)
})
test('display smoothing uses linear power and per-pixel maxima keep narrow peaks; measurements are immutable',()=>{
 const p=new Float64Array(8193).fill(1e-10);p[4000]=1;const before=p.slice(),smooth=m.smoothSpectrum(p,3);assert(smooth[4000]<1&&smooth[4000]>1e-5);assert(smooth[3999]>1e-5)
 const pixels=m.spectrumPixels(p,3,20,20000,80,{smoothing:0,tilt:0});assert.equal(Math.max(...pixels.map(x=>x.decibels)),0);assert.deepEqual(p,before)
 const flat=new Float64Array(100).fill(.25);for(const n of [3,6,12,24])assert(m.smoothSpectrum(flat,n).every(p=>Math.abs(p-.25)<1e-12))
 const old={...m.defaultInstrumentSettings,version:1};delete old.smoothing;delete old.tilt;assert.deepEqual(m.restoreInstrumentSettings(old),m.defaultInstrumentSettings);assert.equal(m.instrumentConfigKey({...m.defaultInstrumentSettings,smoothing:3,tilt:3}),m.instrumentConfigKey(m.defaultInstrumentSettings))
 assert.throws(()=>m.smoothSpectrum(new Float64Array([NaN]),6));assert.throws(()=>m.validateInstrumentSettings({...m.defaultInstrumentSettings,tilt:7}))
})
test('matching attenuates both sources conservatively and refuses silence, gaps and incompatible engines',()=>{
 const a={integratedToCursor:metric(-14),maxTruePeak:metric(2,'dBTP')},b={integratedToCursor:metric(-20),maxTruePeak:metric(-2,'dBTP')},r=m.loudnessMatch(true,true,a,b)
 assert.equal(r.targetLufs,-20);assert.equal(r.aDb,-6);assert.equal(r.bDb,0);assert(a.maxTruePeak.value+r.aDb<=-1&&b.maxTruePeak.value+r.bDb<=-1)
 const hot=m.loudnessMatch(true,true,{...a,maxTruePeak:metric(10,'dBTP')},b);assert(hot.aDb<=0&&hot.bDb<=0);assert.equal(hot.targetLufs,-25)
 for(const status of ['silence','gap','error','insufficient'])assert.equal(m.loudnessMatch(true,true,{...a,integratedToCursor:metric(null,'LUFS',status)},b).status,'unavailable')
 assert.equal(m.loudnessMatch(true,false,a,b).status,'unavailable');assert.equal(m.loudnessMatch(false,true,a,b).status,'off')
})
test('hierarchy retains a one-window peak, mixed gap states and fractional coverage; checksums bind key and level',()=>{
 const a=tile(512),b=tile(512+64*128);a.decibels[63*257+100]=-2;a.status[2]=2;a.decibels.fill(60,2*257,3*257)
 const key='a'.repeat(64),overview=m.mergeOverview(m.overviewFromTile(a,key),m.overviewFromTile(b,key));assert.equal(Math.max(...overview.peaks),-2);assert.equal(overview.masks[1],6);assert.equal(overview.ready[1],.5)
 const encoded=m.encodeOverview(overview),decoded=m.decodeOverview(encoded,key,1,'512');assert.deepEqual(decoded.peaks,overview.peaks);assert.throws(()=>m.decodeOverview(encoded,'b'.repeat(64),1,'512'),/CORRUPT/);encoded[encoded.length-1]^=1;assert.throws(()=>m.decodeOverview(encoded,key,1,'512'),/CORRUPT/)
 const raster=new m.SpectrogramRaster({startFrame:'512',endFrame:String(512+128*128),width:64,height:20,minFrequency:20,maxFrequency:4000},key,1,8000,512);raster.addOverview(overview,0n,BigInt(512+128*128));const view=raster.snapshot(1,true);assert.equal(view.coverage[1],.5);assert(view.status[1]&4);assert.equal(Math.max(...view.decibels),-2)
})
test('wide file views reuse durable overviews and raw hover values survive config/source switches',async()=>{
 const root=await mkdtemp(resolve('artifacts/p0-p1/pyramid-'));let calls=0
 const source={identity:'verified fixture A',channelCount:1,gridOrigin:'0',availableStart:'0',availableEnd:String(512+128*64*8),cacheRoot:root,request:{kind:'file',sampleRate:8000,positionFrame:'0',sources:[resolve('fixture.wav')]}}
 const native={spectrogramTile:async r=>{calls++;const t=tile(r.firstFrame,r.columns);t.decibels.fill(-27);return t}},config={fftSize:512,channel:'stereo'},range={startFrame:'512',endFrame:source.availableEnd,width:32,height:16,minFrequency:20,maxFrequency:4000}
 try{let svc=new m.SpectrogramService(native),v=await svc.query(source,config,range);assert(v.overviewLevel>0);assert(v.coverage.every(n=>n>0));await svc.close();const cold=calls;svc=new m.SpectrogramService(native);v=await svc.query(source,config,range);assert.equal(calls,cold);const p=await svc.point(v.key,'8000',1000);assert.equal(p.decibels,-27);assert.equal(p.bin,64);await svc.query({...source,identity:'changed content B'},config,range);assert(calls>cold);await svc.close()}finally{await rm(root,{recursive:true,force:true})}
})
test('disk quotas remove validated derived files across roots and preserve unknown files, links and originals',async()=>{
 const root=await mkdtemp(resolve('artifacts/p0-p1/quota-')),key='c'.repeat(64)
 try{const dirs=[join(root,'a'),join(root,'b')];await writeFile(join(root,'original.wav'),'audio');for(const dir of dirs){await mkdir(join(dir,key),{recursive:true});await writeFile(join(dir,key,'unknown.wav'),'audio cache must not delete');await writeFile(join(dir,key,'999.bin'),'unknown binary sentinel')}
  // Encoded overview files are recognized as rebuildable, originals never are.
  const o=m.mergeOverview(m.overviewFromTile(tile(512),key),m.overviewFromTile(tile(512+64*128),key)),bytes=m.encodeOverview(o)
  for(const dir of dirs)await writeFile(join(dir,key,'overview-v1-1-512.bin'),bytes)
  await m.enforceSpectralBudget(dirs[0],{assetBytes:bytes.length*2,totalBytes:bytes.length+1});await m.enforceSpectralBudget(dirs[1],{assetBytes:bytes.length*2,totalBytes:bytes.length+1})
  const remaining=(await Promise.all(dirs.map(async d=>(await readdir(join(d,key))).filter(f=>f.startsWith('overview')).length))).reduce((a,b)=>a+b,0);assert.equal(remaining,1)
  assert.equal(await readFile(join(root,'original.wav'),'utf8'),'audio');for(const d of dirs)assert.equal(await readFile(join(d,key,'999.bin'),'utf8'),'unknown binary sentinel')
 }finally{await rm(root,{recursive:true,force:true})}
})
test('markers survive restart and serialized edits, and changed PCM identity cannot inherit them',async()=>{
 const root=await mkdtemp(resolve('artifacts/p0-p1/markers-')),identity={sourceSha256:['a'.repeat(64)],frames:'10000',sampleRate:8000,channelCount:1},first={id:'12345678-1234-1234-1234-123456789abc',startFrame:'500',endFrame:'1000',label:'Burst < & >',comment:'Review independently',createdAt:'2026-10-11T00:00:00.000Z'}
 try{const store=new m.MarkerStore(root);await Promise.all([store.save(identity,first),store.save(identity,{...first,id:'12345678-1234-1234-1234-123456789abd',startFrame:'2000',endFrame:null})]);await store.close();const reopened=new m.MarkerStore(root);assert.equal((await reopened.list(identity)).length,2);assert.equal((await reopened.list({...identity,sourceSha256:['b'.repeat(64)]})).length,0);await reopened.save(identity,{...first,comment:'Updated'});assert.equal((await reopened.list(identity))[0].comment,'Updated');assert.throws(()=>m.validateMarker({...first,endFrame:'20000'},identity.frames));await reopened.save(identity,undefined,first.id);assert.equal((await reopened.list(identity)).length,1)}finally{await rm(root,{recursive:true,force:true})}
})
test('distributions weight frames, exclude gaps and silence, and compute scoped PLR/3-second PSR',()=>{
 const acc=new m.DistributionAccumulator(8000),row=(a,b,loud=-20,flags=0)=>({startFrame:String(a),endFrame:String(b),flags,loudnessFlags:0,channels:[{truePeak:metric(-3,'dBTP')}],momentary:metric(loud),shortTerm:metric(loud)})
 for(let n=0;n<400;n++)acc.push(row(n*80,(n+1)*80))
 const result=acc.finish({integratedToCursor:metric(-20),maxTruePeak:metric(-3,'dBTP')},{startFrame:'0',endFrame:'32000'},true);assert.equal(result.momentary.frames[100],'32000');assert.equal(result.plr.value,17);assert.equal(result.psr.mean.value,17)
 const mixed=new m.DistributionAccumulator(8000);mixed.push(row(0,80,-20));mixed.push(row(80,160,-10,4));mixed.push({...row(160,240),momentary:metric(null,'LUFS','silence')});const r=mixed.finish({integratedToCursor:metric(-20),maxTruePeak:metric(-3,'dBTP')},{startFrame:'5000',endFrame:'5240'},false);assert.equal(r.momentary.readyFrames,'80');assert.equal(r.momentary.excludedFrames,'80');assert.equal(r.momentary.silenceFrames,'80');assert.equal(r.plr.status,'unavailable');assert.equal(r.psr.mean.value,null)
})
test('higher overview levels survive memory and disk pressure so hot wide views do not repeat FFT',async()=>{
 const root=await mkdtemp(resolve('artifacts/p0-p1/pressure-')),key='e'.repeat(64);let calls=0
 const raw=async block=>{calls++;return tile(512n+block*8192n)},store=new m.SpectrogramOverviewStore(raw,key,root,20000)
 try{for(const block of [0n,32n,64n,96n])await store.get(5,block,512n,128,127n);const cold=calls;for(const block of [96n,64n,32n,0n])await store.get(5,block,512n,128,127n);assert.equal(calls,cold);await m.enforceSpectralBudget(root,{assetBytes:30000,totalBytes:30000});store.clear();const reopened=new m.SpectrogramOverviewStore(async()=>{throw Error('hot view repeated FFT')},key,root,20000);for(const block of [0n,32n,64n,96n])await reopened.get(5,block,512n,128,127n)}finally{await rm(root,{recursive:true,force:true})}
})
test('SVG charts escape labels and embed axes, quality and provenance; spectrogram PNG retains masks',async()=>{
 const data={sampleRate:8000,channelCount:1,positionFrame:'1024',binHz:8000/512,current:new Float64Array(257).fill(.01),average:new Float64Array(257).fill(.01),peakHold:new Float64Array(257).fill(.02)},metadata={version:1,product:'Trace',sourceLabel:'<script>alert(1)</script>',sourceSha256:['f'.repeat(64)],sampleRate:8000,channelCount:1,positionFrame:'1024',measurementConfigId:'real-config-test',quality:'simulated UI fixture, not device evidence',settings:{...m.defaultInstrumentSettings,fftSize:512},createdAt:'2026-10-11T00:00:00Z'}
 const svg=m.spectrumSvg(data,metadata);assert(svg.includes('&lt;script&gt;'));assert(!svg.includes('<script>'));assert(svg.includes('real-config-test'));assert(svg.includes('周期 Hann'));assert(svg.includes('Δf'));assert(svg.includes('非 PSD'))
 const view={width:4,height:4,decibels:new Float32Array(16).fill(-24),status:Uint8Array.from([2,6,1,2]),coverage:Float32Array.from([1,.5,0,1]),sampleRate:8000,fftSize:512,startFrame:'0',endFrame:'8000',minFrequency:20,maxFrequency:4000},settings={fftSize:512,minDecibels:-100,maxDecibels:6,palette:'trace'}
 const image=await m.spectrogramSvg(view,metadata,settings);const embedded=Buffer.from(image.match(/base64,([A-Za-z0-9+/=]+)/)[1],'base64');assert(embedded.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.equal(embedded.readUInt32BE(16),4);assert.equal(embedded.readUInt32BE(20),4);assert(image.includes('斜纹为缺口'))
})
