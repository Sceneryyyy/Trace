import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'

const require=createRequire(import.meta.url)
await mkdir('artifacts/meter-cache',{recursive:true})
const root=await mkdtemp(resolve('artifacts/meter-cache/cadence-'))
for(const name of ['analysisCache','analysisTypes','reportBuilder','targetSettings'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:join(root,name+'.cjs'),bundle:true,platform:'node',format:'cjs'})
const {AnalysisCache,validateManifest,crc32}=require(join(root,'analysisCache.cjs'))
const {measurementConfigId}=require(join(root,'analysisTypes.cjs'))
const {buildReport}=require(join(root,'reportBuilder.cjs'))
const {defaultTargetSettings}=require(join(root,'targetSettings.cjs'))
const metric=(value,unit,status='ready')=>({value:status==='ready'?value:null,unit,status})
const numeric=(b,offset,value,status=0)=>{b.writeDoubleLE(status===0?value:0,offset);b.writeUInt32LE(status,offset+8)}

// Independent format fixture: two pages, two peaks between old 100 ms indices,
// and a partial EOF. This tests the actual cache reader and report consumer,
// not the DSP or Windows page writer.
async function fixture(){
 const directory=join(root,'cache');await mkdir(directory)
 const frames=576137,rate=48000,count=Math.ceil(frames*100/rate)
 const streams=[{file:'levels.bin',kind:1,recordBytes:128,stride:1},
  {file:'loudness.bin',kind:2,recordBytes:96,stride:1},
  ...Array.from({length:6},(_,n)=>({file:`wave-${n}.bin`,kind:3,recordBytes:40,stride:10**(n+1)}))]
 for(const stream of streams){
  const records=Math.ceil(count/stream.stride),pages=Math.ceil(records/1024)
  const output=Buffer.alloc(pages*(64+1024*stream.recordBytes))
  for(let page=0;page<pages;page++){
   const base=page*(64+1024*stream.recordBytes),buffer=output.subarray(base,base+64+1024*stream.recordBytes)
   buffer.write('TRPAGE01');buffer.writeUInt32LE(1,8);buffer.writeUInt32LE(stream.kind,12);buffer.writeUInt32LE(stream.recordBytes,16)
   const length=Math.min(1024,records-page*1024)
   buffer.writeUInt32LE(length,20);buffer.writeUInt32LE(stream.stride,24)
   for(let n=0;n<length;n++){
    const index=page*1024+n,offset=64+n*stream.recordBytes,end=Math.min((index+1)*stream.stride*rate/100,frames)
    buffer.writeBigUInt64LE(BigInt(end),offset)
    if(stream.kind===1){buffer.writeUInt32LE(1,offset+12);for(let c=0;c<2;c++){numeric(buffer,offset+32+c*48,-20,c?2:0);numeric(buffer,offset+48+c*48,-25,c?2:0);numeric(buffer,offset+64+c*48,-18,c?2:0)}}
    else if(stream.kind===2){
     // Max M at 480/10250 ms; both would be lost at 100 ms cadence.
     numeric(buffer,offset+16,[48,1025].includes(index+1)?-23:-26,end<19200?2:0)
     numeric(buffer,offset+32,-24,end<144000?2:0);numeric(buffer,offset+48,-23,end<19200?2:0)
     numeric(buffer,offset+64,5,end<144000?2:0);numeric(buffer,offset+80,-18)
    }else buffer.writeBigUInt64LE(BigInt(index*stream.stride*rate/100),offset+8)
   }
   buffer.writeBigUInt64LE(BigInt(Math.min((page*1024+1)*stream.stride*rate/100,frames)),32)
   buffer.writeBigUInt64LE(BigInt(Math.min((page*1024+length)*stream.stride*rate/100,frames)),40)
   buffer.writeUInt32LE(crc32(buffer),28)
  }
  await writeFile(join(directory,stream.file),output);stream.records=String(records);stream.pages=String(pages)
 }
 const sourceFile=join(root,'test-only-source.bin');await writeFile(sourceFile,'explicit synthetic cache-reader fixture')
 const sourceHash=createHash('sha256').update(await readFile(sourceFile)).digest('hex')
 const manifest={cacheKeyVersion:3,schemaVersion:1,status:'ready',measurementConfigId,cacheKey:'a'.repeat(64),engineSha256:'b'.repeat(64),sourceSha256:[sourceHash],createdAt:new Date().toISOString(),sampleRate:rate,channelCount:1,frames:String(frames),streams,
  summary:{levelIndexFrame:String(frames),loudnessIndexFrame:String(frames),channels:[{samplePeak:metric(-20,'dBFS'),rms:metric(-25,'dBFS'),truePeak:metric(-18,'dBTP')}],momentary:metric(-26,'LUFS'),shortTerm:metric(-24,'LUFS'),integratedToCursor:metric(-23,'LUFS'),loudnessRange:metric(5,'LU'),maxTruePeak:metric(-18,'dBTP')}}
 await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest))
 return {directory,manifest,sourceFile}
}
const f=await fixture()
test('dense cache restores shifted M endpoints repeatedly and the real report retains their maximum',async()=>{
 const cache=await AnalysisCache.open(f.directory)
 assert.equal((await cache.metrics('23039')).momentary.value,-26)
 const peak=await cache.metrics('23040');assert.equal(peak.momentary.value,-23);assert.equal(peak.loudnessIndexFrame,'23040')
 assert.deepEqual(await cache.metrics('23040'),peak)
 assert.equal((await cache.metrics('492000')).momentary.value,-23,'peak on second page survives')
 const end=await cache.metrics(f.manifest.frames);assert.equal(end.loudnessIndexFrame,f.manifest.frames)
 const curve=await cache.loudness('0',f.manifest.frames,600);assert(curve.length<=600);assert.equal(curve.at(-1).frame,f.manifest.frames)
 const rows=[];for await(const row of cache.reportRows())rows.push(row)
 assert.equal(rows.length,1201);assert(rows.every(r=>r.loudnessUpdated&&r.loudnessFrame===r.endFrame))
 const report=await buildReport({version:1,source:{label:'synthetic dense cache fixture',takeId:'cadence',role:'source',format:'test-only',sourceFrames:f.manifest.frames,scope:{kind:'whole',startFrame:'0',endFrame:f.manifest.frames},integrity:{state:'complete',notes:[]}},cacheDirectory:f.directory,cacheKey:f.manifest.cacheKey,sourceFiles:[f.sourceFile],outputDirectory:join(root,'report'),targets:{...defaultTargetSettings,enabled:true,preset:'custom',integrated:null,truePeakMax:null,momentaryMax:-23.1}})
 assert.equal(report.momentaryMax.value,-23);assert.equal(report.rows,1201);assert.equal(report.evaluation.state,'fail','the actual target must see the between-grid peak')
 assert.equal(report.coverage.loudnessGapFrames,'0')
 assert.match(await readFile(join(root,'report/report.html'),'utf8'),/M\/S\/I 为 10 ms 快照/)
})
test('old measurement IDs and sparse streams cannot be relabeled as dense v5 caches',()=>{
 assert.throws(()=>validateManifest({...f.manifest,measurementConfigId:'trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned'}),/manifest identity/)
 const sparse=structuredClone(f.manifest);sparse.streams[1].stride=10;sparse.streams[1].records='121'
 assert.throws(()=>validateManifest(sparse),/stream layout/)
})
test('native and TypeScript measurement identities agree on v5',async()=>{
 const header=await readFile('native/src/recorder/MeasurementConfig.h','utf8')
 assert.equal(header.match(/kMeasurementConfigId="([^"]+)"/)[1],measurementConfigId)
 assert.match(measurementConfigId,/^trace-meter-v5-.*msi100hz/)
})
