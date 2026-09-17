import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m4',{recursive:true})
await build({entryPoints:['src/trace/playbackService.ts'],outfile:'artifacts/m4/playback-service.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/contracts.ts'],outfile:'artifacts/m4/playback-contracts.cjs',platform:'node',format:'cjs',bundle:true})
const {PlaybackService}=(await import(pathToFileURL(resolve('artifacts/m4/playback-service.cjs')))).default
const {validateRequest}=(await import(pathToFileURL(resolve('artifacts/m4/playback-contracts.cjs')))).default
const metric=(value,unit='LUFS')=>({value,unit,status:'ready'})
const metrics=position=>({positionFrame:position,levelIndexFrame:position,loudnessIndexFrame:position,channels:[{samplePeak:metric(-4,'dBFS'),rms:metric(-7,'dBFS'),truePeak:metric(-3.8,'dBTP')}],
 momentary:metric(-23),shortTerm:metric(-24),integratedToCursor:metric(-25),loudnessRange:metric(1,'LU'),maxTruePeak:metric(-4,'dBTP'),wholeFileIntegrated:metric(-18),wholeFileLoudnessRange:metric(4,'LU'),wholeFileMaxTruePeak:metric(-1,'dBTP')})
const source={takeId:'take',role:'source',label:'fixture',sources:['owned.wav'],cacheRoot:'owned-cache',sampleRate:48000,channelCount:1,frames:'480000'}
class Native {
 s={id:'',phase:'idle'}
 async playbackClose(){this.s={id:'',phase:'idle'};return this.s}
 async playbackOpen(id){this.s={id,deviceId:'device',phase:'paused',error:null,format:{sampleRate:48000,channelCount:1},generation:'1',positionFrame:'0',totalFrames:'480000',playing:false};return {...this.s}}
 playbackSnapshot(){return {...this.s}}
 playbackPlay(){this.s.phase='playing';this.s.playing=true;return this.playbackSnapshot()}
 playbackPause(){this.s.phase='paused';this.s.playing=false;return this.playbackSnapshot()}
 playbackSeek(position,resume,loop,a,b){this.s={...this.s,generation:String(Number(this.s.generation)+1),positionFrame:position,phase:resume?'playing':'paused',playing:resume,loop,loopStart:a,loopEnd:b};return this.s.generation}
 playbackVolume(value){this.gain=value}
}
class Analysis {
 retained=new Set();retain(id){this.retained.add(id)}release(id,cancelUnused){this.retained.delete(id);if(cancelUnused)this.cancel(id)}
 jobs=[];sources=[];cancelled=[];read=async position=>metrics(position)
 start(source){const id=String(this.jobs.length+1);this.sources.push(source);this.jobs.push({id,phase:'ready',summary:metrics('0')});return id}
 snapshots(){return this.jobs}
 cancel(id){this.cancelled.push(id)}
 metrics(id,position){return this.read(position)}
 async timeline(){return {waveform:[],loudnessHistory:[]}}
}
async function setup(){const native=new Native(),analysis=new Analysis(),service=new PlaybackService(native,analysis,()=>{});await service.open(source,'device');return {native,analysis,service,id:service.view().id}}

test('closing source ownership lasts until the native output has actually released the file',async()=>{
 const {service,native}=await setup();let finish;native.playbackClose=()=>new Promise(resolve=>finish=()=>resolve({phase:'idle'}));const closing=service.close();await new Promise(r=>setImmediate(r));assert.equal(service.view(),null);assert.equal(service.usesSource('take'),true);finish();await closing;assert.equal(service.usesSource('take'),false)
})
test('FILE prefix and whole-file values remain separate from output gain',async()=>{
 const {service,native,id}=await setup();service.seek(id,'144000',false)
 const before=await service.sample();assert.equal(before.integratedToCursor.value,-25);assert.equal(before.loudnessRange.value,4);assert.equal(before.maxTruePeak.value,-1);assert.equal(before.fileView.wholeFileIntegrated.value,-18)
 service.volume(id,0);assert.equal(service.view().gain,0);await service.play(id);assert.equal(native.gain,0);assert.deepEqual((await service.sample()).channels,before.channels)
})
test('a completed old history read cannot overwrite a newer seek',async()=>{
 const {analysis,service,id}=await setup();let finish
 analysis.read=()=>new Promise(resolve=>finish=resolve)
 const previous=service.sample();service.seek(id,'192000',false);finish(metrics('0'))
 assert.equal(await previous,undefined)
 analysis.read=async position=>metrics(position)
 assert.equal((await service.sample()).positionFrame,'192000')
})
test('closing while native open is pending cannot restore the old file view',async()=>{
 const native=new Native(),analysis=new Analysis(),service=new PlaybackService(native,analysis,()=>{});let finish,entered
 const pending=new Promise(resolve=>entered=resolve)
 native.playbackOpen=id=>new Promise(resolve=>{finish=()=>resolve({id,totalFrames:source.frames,format:{sampleRate:48000,channelCount:1},generation:'1'});entered()})
 await service.open(source,'device');const opening=service.play(service.view().id);await pending;await service.close();finish();await opening
 assert.equal(service.view(),null);assert.equal(service.active(),false)
})
test('selection jobs have independent ranges and stale selections are cancelled',async()=>{
 const {service,analysis,id}=await setup()
 service.selection(id,'48000','96000',false)
 assert.deepEqual(analysis.sources.at(-1).range,{startFrame:'48000',endFrame:'96000'});assert.equal(analysis.sources.at(-1).frames,'48000')
 const first=service.view().selectionAnalysis.id,count=analysis.jobs.length
 service.selection(id,'48000','96000',true);assert.equal(analysis.jobs.length,count)
 service.selection(id,'96000','192000',true);assert(analysis.cancelled.includes(first));assert.equal(analysis.sources.at(-1).frames,'96000')
 service.seek(id,'0',false);assert.equal(service.view().loop,false)
})
test('output failure preserves readable history and old source commands are rejected',async()=>{
 const {service,native,id}=await setup();native.playbackOpen=async()=>{throw Error('OUTPUT_UNAVAILABLE')};await assert.rejects(service.play(id),/OUTPUT_UNAVAILABLE/);assert.equal((await service.sample()).integratedToCursor.value,-25);assert.match(service.view().error,/OUTPUT_UNAVAILABLE/)
 await service.close();assert.throws(()=>service.seek(id,'1',false),/STALE_PLAYBACK_SOURCE/)
})
test('FILE IPC rejects unbounded ranges and arbitrary path arguments',()=>{
 const request=(command,payload)=>({protocolVersion:1,requestId:'test',expectedStateRevision:0,command,payload})
 assert.equal(validateRequest(request('file.open',{takeId:'take',role:'source'})).command,'file.open')
 assert.equal(validateRequest(request('playback.seek',{playbackId:'p',positionFrame:'123',resume:false})).command,'playback.seek')
 for(const payload of [{playbackId:'p',positionFrame:'-1',resume:false},{playbackId:'p',positionFrame:'18446744073709551616',resume:false},{playbackId:'p',positionFrame:'0',resume:false,path:'private.wav'}])assert.throws(()=>validateRequest(request('playback.seek',payload)))
 assert.throws(()=>validateRequest(request('file.open',{path:'private.wav',role:'source'})))
 assert.throws(()=>validateRequest(request('playback.selection',{playbackId:'p',startFrame:'12',endFrame:'12',loop:true})))
 assert.throws(()=>validateRequest(request('playback.volume',{playbackId:'p',gain:Infinity})))
})

test('selection changes preserve a just-requested pause while native state is still playing',async()=>{
 const {native,service,id}=await setup();await service.play(id)
 native.playbackPause=()=>native.playbackSnapshot()
 await service.pause(id)
 service.selection(id,'48000','96000',false)
 assert.equal(service.outputActive(),false);assert.equal(native.s.phase,'idle');assert.equal((await service.sample()).playback.playing,false)
})

test('late history failures are discarded after switching source',async()=>{
 const {service,analysis}=await setup();let reject
 analysis.read=()=>new Promise((_resolve,r)=>reject=r)
 const previous=service.sample();await service.open({...source,takeId:'next'},'device');reject(Error('OLD_READ_FAILED'))
 assert.equal(await previous,undefined);assert.equal(service.view().error,null)
 analysis.read=async position=>metrics(position);assert.equal((await service.sample()).integratedToCursor.value,-25)
})

test('a current history fault latches until a new source is opened',async()=>{
 const {service,id}=await setup();service.fail('FILE_SNAPSHOT_FAILED: unreadable')
 assert.equal(await service.sample(),undefined);await assert.rejects(service.play(id),/PLAYBACK_NOT_READY/)
 await service.open(source,'device');assert.equal((await service.sample()).integratedToCursor.value,-25)
})

test('analysis queue saturation produces an explicit failed inspection without opening output',async()=>{
 const native=new Native(),analysis=new Analysis(),service=new PlaybackService(native,analysis,()=>{})
 analysis.start=()=>{throw Error('ANALYSIS_QUEUE_FULL')}
 await assert.rejects(service.open(source,'device'),/ANALYSIS_QUEUE_FULL/)
 assert.equal(service.view().phase,'failed');assert.match(service.view().error,/ANALYSIS_QUEUE_FULL/);assert.equal(service.outputActive(),false)
 assert.equal(await service.sample(),undefined);await service.close();assert.equal(service.view(),null)
})

test('analysis retry preserves the inspection and rejects an old asynchronous read',async()=>{
 const {service,analysis,id}=await setup()
 service.seek(id,'144000',false);service.window(id,'48000','288000',900);service.selection(id,'96000','192000',false)
 const original=service.view();let finish
 analysis.read=()=>new Promise(resolve=>finish=resolve)
 const old=service.sample();analysis.jobs.find(j=>j.id===original.analysisId).phase='cancelled'
 service.retryAnalysis(id);finish(metrics('0'));assert.equal(await old,undefined)
 const next=service.view();assert.equal(next.id,id);assert.notEqual(next.analysisId,original.analysisId);assert.notEqual(next.generation,original.generation)
 assert.equal(next.positionFrame,'144000');assert.equal(next.startFrame,'48000');assert.deepEqual(next.selection,original.selection)
 assert(!analysis.retained.has(original.analysisId));assert(analysis.retained.has(next.analysisId))
 analysis.read=async position=>metrics(position);assert.equal((await service.sample()).positionFrame,'144000')
})
test('analysis retry can recover a latched error without replacing the file',async()=>{
 const {service,id}=await setup();service.seek(id,'192000',false);service.fail('FILE_SNAPSHOT_FAILED: broken')
 service.retryAnalysis(id);assert.equal(service.view().error,null);assert.equal(service.view().id,id)
 assert.equal((await service.sample()).positionFrame,'192000')
})
test('library reanalysis binds only the same source and publishes terminal errors',async()=>{
 const {service,analysis}=await setup(),before=service.view()
 const different={...source,takeId:'different'},wrong=analysis.start(different);service.useAnalysis(different,wrong)
 assert.equal(service.view().analysisId,before.analysisId)
 const next=analysis.start(source);analysis.jobs.find(j=>j.id===next).phase='failed';analysis.jobs.find(j=>j.id===next).error='READ_FAILED'
 service.useAnalysis(source,next);assert.equal(service.view().analysisError,'READ_FAILED')
 assert.equal((await service.sample()).fileView.analysisPhase,'failed')
})
test('clear selection stops looping and releases independent analysis without moving the cursor',async()=>{
 const {service,analysis,id}=await setup();service.seek(id,'144000',false);service.selection(id,'96000','192000',true)
 const selected=service.view().selectionAnalysis.id
 service.clearSelection(id);assert.equal(service.view().selection,null);assert.equal(service.view().selectionAnalysis,undefined);assert.equal(service.view().loop,false)
 assert.equal(service.view().positionFrame,'144000');assert(analysis.cancelled.includes(selected));assert(!analysis.retained.has(selected))
 assert.equal((await service.sample()).fileView.selection,null)
})
test('retry and clear selection commands reject paths and wrong payload fields',()=>{
 for(const command of ['playback.clearSelection','playback.retryAnalysis']){
  const valid={protocolVersion:1,requestId:'test',expectedStateRevision:0,command,payload:{playbackId:'p'}}
  assert.equal(validateRequest(valid).command,command)
  assert.throws(()=>validateRequest({...valid,payload:{playbackId:'p',path:'outside.wav'}}))
  assert.throws(()=>validateRequest({...valid,payload:{}}))
 }
})

test('slow instrument analysis cannot publish over a newer seek or a replaced source',async()=>{
 const {service,id}=await setup();let finish,entered
 const started=new Promise(resolve=>entered=resolve)
 service.instrumentQuery=()=>new Promise(resolve=>{finish=resolve;entered()})
 const previous=service.sample();await started;service.seek(id,'192000',false);finish({configKey:'fixture',phase:'ready'})
 assert.equal(await previous,undefined)
 service.instrumentQuery=async()=>({configKey:'fixture',phase:'ready'})
 assert.equal((await service.sample()).positionFrame,'192000')
 let release,ready;const queried=new Promise(resolve=>ready=resolve)
 service.instrumentQuery=()=>new Promise(resolve=>{release=resolve;ready()})
 const old=service.sample();await queried;await service.open({...source,takeId:'different'},'device');release({configKey:'fixture',phase:'ready'})
 assert.equal(await old,undefined);assert.equal(service.view().takeId,'different')
})
test('file instrument requests retain decoded-range identity and do not use output gain',async()=>{
 const {service,native}=await setup();await service.open({...source,decodeRange:{startFrame:'576',endFrame:'480576'}},'device')
 let request;service.instrumentQuery=async r=>{request=r;return {configKey:'fixture',phase:'ready'}}
 service.seek(service.view().id,'96000',false);service.volume(service.view().id,0);await service.sample()
 assert.equal(request.positionFrame,'96000');assert.equal(request.startFrame,'576');assert.equal(request.endFrame,'480576');assert.equal(request.sampleRate,48000)
 assert(!('gain' in request));assert.equal(native.s.phase,'idle')
})
