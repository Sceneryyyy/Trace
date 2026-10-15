import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),root=path.resolve('.')
await fs.mkdir('artifacts/iteration',{recursive:true})
const buildRoot=await fs.mkdtemp(path.join(root,'artifacts/iteration/cache-service-'))
for(const [entry,out]of [['src/trace/recording.ts','recording.cjs'],['src/trace/file-worker.ts','file-worker.js'],['src/trace/media-runner.ts','media-runner.js'],['src/trace/contracts.ts','contracts.cjs']])await build({entryPoints:[entry],outfile:path.join(buildRoot,out),bundle:true,platform:'node',format:'cjs'})
const {RecordingService}=require(path.join(buildRoot,'recording.cjs')),{validateRequest}=require(path.join(buildRoot,'contracts.cjs'))
const identity={sourceId:'test-source',epochId:'1',measurementEpoch:'1',originFrame:'24000',captureStartFrame:'24000',frames:'96000',sampleRate:48000,channelCount:2}
async function wave(options,frames){
 const bytes=Buffer.alloc(58+frames*8);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(18,16);bytes.writeUInt16LE(3,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(384000,28);bytes.writeUInt16LE(8,32);bytes.writeUInt16LE(32,34);bytes.write('fact',38);bytes.writeUInt32LE(4,42);bytes.writeUInt32LE(frames,46);bytes.write('data',50);bytes.writeUInt32LE(frames*8,54)
 const file=options.basePath+'-1.wav';await fs.writeFile(file,bytes);await fs.writeFile(options.journalPath,JSON.stringify({event:'begin',captureStartFrame:'0'})+'\n'+JSON.stringify({event:'close',frames:String(frames)})+'\n')
 return {sampleRate:48000,channelCount:2,encoding:'float32',frames:String(frames),clippedSamples:'0',segments:[{file:path.basename(file),frames:String(frames),bytes:String(frames*8),clippedSamples:'0'}]}
}
async function setup(native){
 const dir=await fs.mkdtemp(path.join(buildRoot,'takes-')),service=new RecordingService({recordStart(){throw Error('REC must not start')},recordStop(){throw Error('REC must not stop')},recordStatus:()=>({phase:'idle'}),...native},'unused','unused',path.join(root,'build/trace-engine/Release/trace_engine.node'),()=>{})
 await service.setDirectory(dir);service.configure({encoding:'float32',sampleRate:'source',namePrefix:'CacheTest'});return {service,dir}
}
test('cache materialization creates its own origin and completes before graceful shutdown',async()=>{
 let release;const t=await setup({replaySave:options=>new Promise(resolve=>{release=async()=>resolve(await wave(options,48000))})})
 const saving=t.service.saveReplay(identity,{startFrame:'24000',endFrame:'72000'});assert.equal(t.service.busy(),true);assert.equal(t.service.activeSummary(),null)
 while(!release)await new Promise(r=>setTimeout(r,5))
 let finished=false;const closing=t.service.finish({phase:'idle'}).then(()=>finished=true);await new Promise(r=>setTimeout(r,20));assert.equal(finished,false)
 await release();const saved=await saving;await closing;const take=t.service.session(saved.takeId)
 assert.equal(take.document.frames,'48000');assert.equal(take.document.origin.startFrame,'24000');assert.equal(take.document.regions[0].startFrame,'0');assert.equal(take.document.status,'ready')
 assert.equal(take.document.assets[0].encoding,'float32');assert(take.document.assets[0].hash)
})
test('partial cache saving is retained and can use the existing recovery pipeline',async()=>{
 const t=await setup({replaySave:async options=>{await wave(options,480);throw Error('WAV_WRITE_FAILED')}})
 await assert.rejects(t.service.saveReplay(identity,{startFrame:'0',endFrame:'48000'}),/WAV_WRITE_FAILED/)
 const saved=t.service.summaries()[0];assert.equal(saved.status,'recoverable');assert.equal(saved.frames,'480')
 await t.service.recover(saved.id);const recovered=t.service.summaries()[0];assert.equal(recovered.status,'recovered');assert.equal(recovered.frames,'480');assert(recovered.roles.includes('recovered'))
})
test('invalid memory ranges and identities do not create a take',async()=>{
 const t=await setup({replaySave:()=>{throw Error('must not be called')}})
 for(const [info,range]of [[identity,{startFrame:'0',endFrame:'96001'}],[{...identity,frames:'2880001'},{startFrame:'0',endFrame:'1'}],[{...identity,sourceId:''},{startFrame:'0',endFrame:'1'}]]){
  assert.throws(()=>t.service.saveReplay(info,range));assert.equal(t.service.summaries().length,0)
 }
})
test('cache IPC accepts only a current playback ID and selection intent, never paths',()=>{
 const req={protocolVersion:1,requestId:'test',expectedStateRevision:0,command:'cache.save',payload:{playbackId:'owned',useSelection:true}}
 assert.equal(validateRequest(req).command,'cache.save')
 assert.throws(()=>validateRequest({...req,payload:{...req.payload,path:'C:\\elsewhere\\audio.wav'}}))
 assert.throws(()=>validateRequest({...req,payload:{playbackId:'owned',useSelection:'yes'}}))
})
