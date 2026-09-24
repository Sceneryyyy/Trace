import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdir, writeFile, readFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
await mkdir(resolve('artifacts/m2'),{recursive:true})
const modulePath=resolve('artifacts/m2/recording-service-test.mjs')
await build({entryPoints:['src/trace/recording.ts'],outfile:modulePath,bundle:true,platform:'node',format:'esm'})
const {RecordingService,validateRecordSettings}=await import(pathToFileURL(modulePath))
test('record settings preserve all WAV rates and reject unsafe names',()=>{
 for(const sampleRate of ['source',44100,48000,88200,96000])for(const encoding of ['pcm16','pcm24','float32']){
  assert.deepEqual(validateRecordSettings({encoding,sampleRate,namePrefix:'声迹 Test'}),{encoding,sampleRate,namePrefix:'声迹 Test'})
 }
 for(const namePrefix of ['../file','a/b','a\\b','a:b','CON.txt','bad\0name'])assert.throws(()=>validateRecordSettings({encoding:'pcm24',sampleRate:'source',namePrefix}))
 for(const sampleRate of [0,192000,'48000',NaN])assert.throws(()=>validateRecordSettings({encoding:'pcm24',sampleRate,namePrefix:'Trace'}))
})
test('corrupt sessions cannot stop a valid directory from loading',async()=>{
 const root=await mkdtemp(resolve('artifacts/m2/service-'))
 const good={schemaVersion:1,product:'Trace',sessionId:'good',name:'Good',createdAt:'2026-09-15T00:00:00Z',status:'ready',frames:'48000',
  preset:{encoding:'pcm16',sampleRate:44100,namePrefix:'Trace'},sourceFormat:{sampleRate:48000,channelCount:2},error:null,
  assets:[{assetId:'a',role:'deliverable',relativePath:'audio/converted.wav',sampleRate:44100,channelCount:2,encoding:'pcm16',frameCount:'44100',hash:null}],segments:[{segmentId:'segment-1',assetId:'a',frameCount:'44100',captureStartFrame:null,timelineStartFrame:'0'}]}
 const invalid={...good,sessionId:'bad',assets:[{...good.assets[0],frameCount:'not-a-number'}]}
 const escaped={...good,sessionId:'escape',assets:[{...good.assets[0],relativePath:'../private.wav'}]}
 const mixed={...good,sessionId:'mixed',assets:[{...good.assets[0],assetId:'a',sampleRate:96000,frameCount:'96000'},{...good.assets[0],assetId:'b',sampleRate:48000,frameCount:'48000'}],segments:[]}
 const interrupted={...good,sessionId:'interrupted',status:'recording',frames:'0',assets:[],segments:[]}
 const badSegment={...good,sessionId:'badSegment',segments:[{...good.segments[0],timelineStartFrame:'not-a-frame'}]}
 for(const [name,document] of Object.entries({good,invalid,escaped,interrupted,badSegment,mixed})){
  await mkdir(join(root,name));await writeFile(join(root,name,'session.json'),JSON.stringify(document))
 }
 const native={recordStart(){throw Error('not used')},recordStop(){throw Error('not used')},recordStatus(){throw Error('not used')}}
 const service=new RecordingService(native,'unused','unused','unused',()=>{})
 await service.setDirectory(root)
 const summaries=service.summaries()
 const result=summaries.find(s=>s.id==='good')
 assert.equal(result.frames,'44100')
 assert.equal(result.sampleRate,44100)
 assert.equal(summaries.find(s=>s.id==='interrupted').status,'recoverable')
 assert.equal(summaries.find(s=>s.id==='mixed').durationNs,'2000000000')
 assert.equal(summaries.find(s=>s.id==='mixed').mixedSampleRate,true)
 // The three parsable manifests are the only ones that yield usable takes.
 const usable=summaries.filter(s=>s.status!=='unreadable')
 assert.deepEqual(usable.map(s=>s.id).sort(),['good','interrupted','mixed'])
 // The three rejected manifests must still be reported: their audio is on disk,
 // so dropping them silently would be indistinguishable from never recording.
 const unreadable=summaries.filter(s=>s.status==='unreadable')
 assert.deepEqual(unreadable.map(s=>s.name).sort(),['badSegment','escaped','invalid'])
 for(const entry of unreadable){
  assert(entry.error,'an unreadable take must carry a reason')
  assert.equal(entry.availability,'unavailable')
  assert.deepEqual(entry.roles,[],'no analysis role may be offered for an unparsed manifest')
 }
})

test('a restarted library exposes a surviving source left in removing',async()=>{
 const root=await mkdtemp(resolve('artifacts/m2/retention-restart-')),folder=join(root,'take')
 await mkdir(join(folder,'audio'),{recursive:true});await writeFile(join(folder,'audio','source.wav'),'PCM')
 const document={schemaVersion:1,product:'Trace',sessionId:'stuck',name:'Still here',createdAt:'2026-09-23T00:00:00Z',status:'ready',frames:'48000',
  preset:{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace',keepOriginal:false},sourceFormat:{sampleRate:48000,channelCount:2},error:null,
  retention:{phase:'removing',error:null},
  assets:[{assetId:'source',role:'source',relativePath:'audio/source.wav',sampleRate:48000,channelCount:2,encoding:'pcm24',frameCount:'48000',hash:null,state:'removing'}],
  segments:[{segmentId:'segment-1',assetId:'source',frameCount:'48000',captureStartFrame:null,timelineStartFrame:'0'}]}
 await writeFile(join(folder,'session.json'),JSON.stringify(document))
 const native={recordStart(){throw Error('not used')},recordStop(){throw Error('not used')},recordStatus(){throw Error('not used')}}
 const service=new RecordingService(native,'unused','unused','unused',()=>{})
 await service.setDirectory(root)
 const visible=service.summaries().find(item=>item.id==='stuck')
 assert(visible,'a surviving recording must remain in the library')
 assert(visible.roles.includes('source'),'the original source must be selectable')
 assert.equal(visible.retention.phase,'error')
 const disk=JSON.parse(await readFile(join(folder,'session.json'),'utf8'))
 assert.notEqual(disk.assets[0].state,'removing','the repair must persist across further restarts')
 assert.equal(disk.retention.phase,'error')
})
