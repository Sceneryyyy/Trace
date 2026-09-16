import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises'
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
 assert.equal(summaries.length,3)
 const result=summaries.find(s=>s.id==='good')
 assert.equal(result.frames,'44100')
 assert.equal(result.sampleRate,44100)
 assert.equal(summaries.find(s=>s.id==='interrupted').status,'recoverable')
 assert.equal(summaries.find(s=>s.id==='mixed').durationNs,'2000000000')
 assert.equal(summaries.find(s=>s.id==='mixed').mixedSampleRate,true)
})
