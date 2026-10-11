// Actual service/dispatch code with explicit device, Electron and analysis mocks.
// These generated WAVs and boundary mocks are not WASAPI acceptance evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const require=createRequire(import.meta.url)
await fs.mkdir('artifacts/cloud-regression',{recursive:true})
const root=await fs.mkdtemp(path.resolve('artifacts/cloud-regression/services-'))
async function bundle(name,entry,extra={}){
 const outfile=path.join(root,name+'.cjs')
 await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'cjs',...extra})
 return require(outfile)
}
const {PlaybackService}=await bundle('playback','src/trace/playbackService.ts')
const {RecordingService,sourceContinuity}=await bundle('recording','src/trace/recording.ts')
const {ExportService}=await bundle('export','src/trace/exportService.ts')
const {DeliveryService}=await bundle('delivery','src/trace/deliveryService.ts')
const {validateExportRecord}=await bundle('exportTypes','src/trace/exportTypes.ts')
const {normalizeSession}=await bundle('session','src/trace/sessionStore.ts')
const mediaStub=path.join(root,'media-stub.cjs')
await fs.writeFile(mediaStub,`const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');exports.encodeMedia=async(_tools,input,_preset,working,options)=>{
 await fs.mkdir(working);await options.created();const file=path.join(working,'output.wav');await fs.copyFile(input.sources[0],file);const hash=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');const part={path:file,frames:input.frames,sha256:hash};
 return {codec:'pcm_f32le',container:'wav',sampleRate:input.sampleRate,channelCount:input.channelCount,frames:input.frames,files:[part],decoded:[part],decodeRecipe:{version:1,startFrame:'0',frames:input.frames,physicalFrames:input.frames,encoderDelayFrames:'0',endPaddingFrames:'0',containerTrimmed:true},encoderSha256:'a'.repeat(64),sourceSha256:[hash]};};`)
const {ExportService:ExportWithMockEncoder}=await bundle('export-publish','src/trace/exportService.ts',{plugins:[{name:'mock-encoder',setup(b){b.onResolve({filter:/^\.\/mediaTasks$/},()=>({path:mediaStub}))}}]})
await build({entryPoints:['src/trace/file-worker.ts'],outfile:path.join(root,'file-worker.js'),bundle:true,platform:'node',format:'cjs'})
const electron=path.join(root,'electron.cjs')
await fs.writeFile(electron,`exports.app={getPath:()=>${JSON.stringify(root)},setPath(){},setName(){},requestSingleInstanceLock:()=>true,on(){},whenReady:()=>new Promise(()=>{}),exit(){},quit(){}};exports.ipcMain={};`)
const {review}=await bundle('main','src/trace/main.ts',{
 plugins:[{name:'electron-boundary',setup(b){b.onResolve({filter:/^electron$/},()=>({path:electron}))}}],
 footer:{js:`module.exports.review={dispatch,makeReportInput,set(v){engine=v.engine;playback=v.playback;reports=v.reports;analyses=v.analyses;recordings=v.recordings;retention=v.retention;deliveries=v.deliveries;exporter=v.exporter;imports=v.imports;references=v.references;state=v.state;managingLibrary=!!v.managingLibrary;exiting=!!v.exiting;recordingCaptureHeld=false},state:()=>state};`}
})
const noop=()=>{},metric=(value,unit='LUFS')=>({value,unit,status:'ready'})
const metrics={positionFrame:'0',levelIndexFrame:'0',loudnessIndexFrame:'0',channels:[{samplePeak:metric(-6,'dBFS'),rms:metric(-9,'dBFS'),truePeak:metric(-5,'dBTP')}],momentary:metric(-23),shortTerm:metric(-23),integratedToCursor:metric(-23),loudnessRange:metric(1,'LU'),maxTruePeak:metric(-5,'dBTP'),wholeFileIntegrated:metric(-23),wholeFileLoudnessRange:metric(1,'LU'),wholeFileMaxTruePeak:metric(-5,'dBTP')}
class Analysis{
 jobs=[];start(){const id=String(this.jobs.length+1);this.jobs.push({id,phase:'ready',summary:metrics});return id}
 retain(){}release(){}setRecordingBusy(){}async pauseForRecording(){}snapshots(){return this.jobs}
 async metrics(){return metrics}async timeline(){return {waveform:[],loudnessHistory:[]}}
 reportInput(){return {manifest:{sourceSha256:['hash'],cacheKey:'cache'},directory:root,source:{sources:[]}}}
}
class Native{
 s={id:'',phase:'idle'}
 async playbackClose(){this.s={id:'',phase:'idle'};return this.s}
 async playbackOpen(id){this.s={id,phase:'paused',error:null,format:{sampleRate:48000,channelCount:1},generation:'1',positionFrame:'0',totalFrames:'48000',playing:false};return this.s}
 playbackSnapshot(){return {...this.s}}
 playbackPlay(){this.s.phase='playing';this.s.playing=true}
 playbackSeek(position,resume){this.s={...this.s,generation:String(Number(this.s.generation)+1),positionFrame:position,phase:resume?'playing':'paused',playing:resume};return this.s.generation}
 playbackVolume(){}
}
const region=(patch={})=>({id:'r',nativeId:'r',ordinal:1,baseName:'Test',journalFile:'journal.jsonl',format:{sampleRate:48000,channelCount:1},frames:'48000',startFrame:'0',endFrameExclusive:'48000',clock:{domain:'d',startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false},encoding:'float32',status:'closed',error:null,estimatedFrames:'0',clippedSamples:'0',...patch})
const wav=frames=>{const b=Buffer.alloc(44+frames*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(frames*4,40);return b}
async function fixture(regions=[region()],extra={}){
 const directory=await fs.mkdtemp(path.join(root,'export-')),id=crypto.randomUUID(),folder=path.join(directory,'exports',id)
 await fs.mkdir(folder,{recursive:true});const bytes=wav(48000),hash=crypto.createHash('sha256').update(bytes).digest('hex')
 await fs.writeFile(path.join(folder,'media-000001.wav'),bytes)
 const files=[{file:'media-000001.wav',frames:'48000',sha256:hash}]
 const record={version:1,id,createdAt:new Date().toISOString(),source:{takeId:'take',role:'source'},preset:{format:'wav',encoding:'float32',sampleRate:48000},automatic:false,phase:'ready',fraction:1,error:null,result:{version:1,directory:'exports/'+id,codec:'pcm_f32le',container:'wav',sampleRate:48000,channelCount:1,frames:'48000',files,decoded:files,recipe:{version:1,startFrame:'0',frames:'48000',physicalFrames:'48000',encoderDelayFrames:'0',endPaddingFrames:'0',containerTrimmed:true},mediaIdentity:hash,encoderSha256:hash,sourceSha256:[hash]}}
 const document={sessionId:'take',name:'Test',regions,hasDiscontinuities:false,exports:[record],...extra},take={directory,document,save:async()=>{},event:async()=>{}}
 const service=new ExportService({session:()=>take,sessions:()=>[take]}, {}, noop)
 return {record,take,service}
}
test('export resolution and playback retain capture quality for interrupted, estimated and clean sources',async()=>{
 for(const [r,expected]of [[region({status:'interrupted'}),'gaps'],[region({estimatedFrames:'480'}),'estimated-silence'],[region(),'complete']]){
  const t=await fixture([r]),source=await t.service.resolve('take',t.record.id)
  const p=new PlaybackService(new Native(),new Analysis(),noop);await p.open(source,'device')
  assert.equal(source.continuity,expected);assert.equal((await p.sample()).continuity,expected);await p.close()
 }
})
test('legacy region export judges only its source region; nested export follows metadata without reading the original',async()=>{
 const t=await fixture([region(),region({id:'broken',ordinal:2,status:'interrupted'})],{hasDiscontinuities:true})
 t.record.source.regionId='r';assert.equal((await t.service.resolve('take',t.record.id)).continuity,'complete')
 const parent={...t.record,id:crypto.randomUUID(),source:{takeId:'take',role:'source',regionId:'broken'},result:undefined}
 t.take.document.exports.push(parent);t.record.source={takeId:'take',role:'export',exportId:parent.id}
 assert.equal((await t.service.resolve('take',t.record.id)).continuity,'gaps')
 parent.source={takeId:'take',role:'export',exportId:t.record.id}
 assert.equal((await t.service.resolve('take',t.record.id)).continuity,'unknown','cycles must terminate without claiming complete')
})
test('persisted export quality survives original removal; invalid persisted quality is rejected',async()=>{
 const t=await fixture([]);t.record.result.continuity='estimated-silence'
 assert.equal((await t.service.resolve('take',t.record.id)).continuity,'estimated-silence')
 t.record.result.continuity='invented';assert.throws(()=>validateExportRecord(t.record),/INVALID_EXPORT_CONTINUITY/)
 const imported=await fixture(undefined,{kind:'imported',regions:undefined})
 assert.equal((await imported.service.resolve('take',imported.record.id)).continuity,'complete','validated external file does not invent a capture gap')
})
test('new export commits source quality to its manifest and preserves it after source removal',async()=>{
 const t=await fixture([region({estimatedFrames:'480'})]),source=await t.service.resolve('take',t.record.id)
 const service=new ExportWithMockEncoder({session:()=>t.take,sessions:()=>[t.take],analysisSource:async()=>source},{},noop)
 const id=await service.start({takeId:'take',role:'source'},{format:'wav',encoding:'float32',sampleRate:48000})
 for(let i=0;i<200&&!['ready','failed'].includes(service.views().find(r=>r.id===id)?.phase);i++)await new Promise(r=>setTimeout(r,5))
 assert.equal(service.views().find(r=>r.id===id).phase,'ready')
 const manifest=JSON.parse(await fs.readFile(path.join(t.take.directory,'exports',id,'export.json'),'utf8'))
 assert.equal(manifest.result.continuity,'estimated-silence');t.take.document.regions=[]
 assert.equal((await service.resolve('take',id)).continuity,'estimated-silence');await service.shutdown()
})
function context(overrides={}){
 const state={revision:0,active:false,deviceId:'device',monitoringRequested:true,error:null}
 return {state,engine:{snapshot:()=>({active:false}),start:()=>{throw Error('DEVICE_UNAVAILABLE')},stop:noop},playback:{active:()=>false},recordings:{directory:root,busy:()=>false},analyses:new Analysis(),reports:{setRecordingBusy:noop},retention:{pause:async()=>{},resume:noop},deliveries:{pause:async()=>{},resume:noop},exporter:{pauseForRecording:async()=>{},resume:noop},...overrides}
}
const request=(command,payload={})=>({requestId:crypto.randomUUID(),command,expectedStateRevision:0,payload})
test('report uses a region export quality rather than unrelated interrupted capture regions',async()=>{
 const t=await fixture([region(),region({id:'broken',ordinal:2,status:'interrupted'})],{hasDiscontinuities:true})
 t.record.source.regionId='r';const source=await t.service.resolve('take',t.record.id),p=new PlaybackService(new Native(),new Analysis(),noop)
 await p.open(source,'device');review.set(context({playback:p,recordings:{busy:()=>false,session:()=>t.take},imports:{has:()=>false}}))
 assert.equal(review.makeReportInput(p.view().id,'whole').request.source.integrity.state,'complete');await p.close()
})
test('report event jump releases output, seeks silently and restores requested monitoring',async()=>{
 for(const playing of [true,false]){
  const f=await fixture(),source=await f.service.resolve('take',f.record.id),analysis=new Analysis(),hash=f.record.result.sourceSha256[0]
  analysis.reportInput=()=>({manifest:{sourceSha256:[hash],cacheKey:'cache'},directory:root,source:{sources:source.sources}})
  const p=new PlaybackService(new Native(),analysis,noop)
  await p.open(source,'device');const id=p.view().id;if(playing)await p.play(id)
  let started=0;const t=context({playback:p,analyses:analysis,reports:{setRecordingBusy:noop,result:()=>({source:{takeId:source.takeId,role:source.role,exportId:source.exportId},analysis:{sourceSha256:[hash]},eventPreview:[{startFrame:'24000'}]})},engine:{snapshot:()=>({active:false}),start:()=>{started++},stop:noop}})
  p.selection(id,'0','12000',true);review.set(t)
  const reply=await review.dispatch(request('report.jump',{reportId:'report',index:0}))
  assert.equal(reply.ok,true);assert.equal(p.view().phase,'paused');assert.equal(p.view().outputReady,false);assert.equal(p.view().positionFrame,'24000');assert.equal(p.view().loop,false)
  assert.equal(started,1);assert.equal(review.state().active,true)
  await fs.appendFile(source.sources[0],'changed')
  const changed=await review.dispatch({...request('report.jump',{reportId:'report',index:0}),expectedStateRevision:review.state().revision})
  assert.equal(changed.ok,false);assert.equal(changed.error.code,'REVIEW_SOURCE_CHANGED');assert.equal(p.view().positionFrame,'24000');await p.close()
 }
})
test('failed recording startup resumes actual delivery so a later user-authorized copy completes',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'delivery-')),record={id:'export-id',phase:'ready',source:{takeId:'take'},preset:{format:'mp3'}}
 const take={document:{sessionId:'take',name:'Recovered queue',exports:[record]},save:async()=>{}}
 const delivery=new DeliveryService({sessions:()=>[take]},{saveInfo:()=>({extension:'mp3',multiple:false}),saveCopy:async(_id,target)=>fs.writeFile(target,'generated verified copy',{flag:'wx'})},noop,()=>true)
 review.set(context({deliveries:delivery}))
 const reply=await review.dispatch(request('record.start'));assert.equal(reply.ok,false);assert.equal(reply.error.code,'DEVICE_UNAVAILABLE')
 await delivery.plan(record.id,directory)
 for(let i=0;i<100&&record.delivery.phase!=='ready';i++)await new Promise(r=>setTimeout(r,5))
 assert.equal(record.delivery.phase,'ready');assert.equal(await fs.readFile(record.delivery.targetPath,'utf8'),'generated verified copy');await delivery.shutdown()
})
test('failures in any recording preparation pause restore all services, while a busy take stays paused',async()=>{
 for(const failure of ['retention','deliveries','exporter','analyses']){
  const resumed=new Set(),t=context()
  t.retention={pause:async()=>{if(failure==='retention')throw Error('PREPARATION_FAILED')},resume:()=>resumed.add('retention')}
  t.deliveries={pause:async()=>{if(failure==='deliveries')throw Error('PREPARATION_FAILED')},resume:()=>resumed.add('deliveries')}
  t.exporter={pauseForRecording:async()=>{if(failure==='exporter')throw Error('PREPARATION_FAILED')},resume:()=>resumed.add('exporter')}
  t.analyses={pauseForRecording:async()=>{if(failure==='analyses')throw Error('PREPARATION_FAILED')},setRecordingBusy:v=>{if(!v)resumed.add('analyses')}}
  review.set(t);assert.equal((await review.dispatch(request('record.start'))).ok,false)
  assert.deepEqual([...resumed].sort(),['analyses','deliveries','exporter','retention'])
 }
 let busy=false,resumes=0;const t=context({recordings:{directory:root,busy:()=>busy,start:async()=>{busy=true}},engine:{snapshot:()=>({active:true,format:{sampleRate:48000,channelCount:1},epochId:'1'}),stop:noop}})
 for(const key of ['retention','deliveries','exporter'])t[key].resume=()=>resumes++
 review.set(t);assert.equal((await review.dispatch(request('record.start'))).ok,true);assert.equal(resumes,0)
})
test('cache-save preparation failures also restore delivery before entering the writer',async()=>{
 let resumed=0,writes=0;const t=context({playback:{replayForSave:()=>({info:{},range:{}})},recordings:{directory:root,settings:{},busy:()=>false,activeSummary:()=>null,summaries:()=>[],saveReplay:async()=>{writes++}},deliveries:{pause:async()=>{},resume:()=>resumed++},exporter:{pauseForRecording:async()=>{throw Error('PREPARATION_FAILED')},resume:noop}})
 review.set(t);const reply=await review.dispatch(request('cache.save',{playbackId:'memory',useSelection:false}))
 assert.equal(reply.ok,false);assert.equal(writes,0);assert(resumed>0)
})
test('failed recording preparation does not restart background tasks during library management or shutdown',async()=>{
 for(const flag of ['managingLibrary','exiting']){
  let resumes=0;const t=context({[flag]:true})
  for(const key of ['retention','deliveries','exporter'])t[key].resume=()=>resumes++
  review.set(t);assert.equal((await review.dispatch(request('record.start'))).ok,false);assert.equal(resumes,0)
 }
})
test('saved memory quality persists through reload, playback and report input; missing legacy quality stays unknown',async()=>{
 for(const [quality,expected,integrity]of [[{version:1,estimatedFrames:'11',gapFrames:'0',unknown:false},'estimated-silence','estimated'],[{version:1,estimatedFrames:'0',gapFrames:'0',unknown:false},'complete','complete'],[{version:1,estimatedFrames:'0',gapFrames:'3',unknown:false},'gaps','gaps'],[undefined,'unknown','unknown']]){
  const native={recordStatus:()=>({phase:'idle'}),replaySave:async req=>{
   const bytes=wav(18);await fs.writeFile(req.basePath+'-1.wav',bytes)
   return {quality,sampleRate:48000,channelCount:1,encoding:'float32',frames:'18',clippedSamples:'0',segments:[{file:path.basename(req.basePath)+'-1.wav',frames:'18',bytes:String(bytes.length),clippedSamples:'0'}]}
  }}
  const dir=await fs.mkdtemp(path.join(root,'memory-')),recording=new RecordingService(native,'unused','unused','unused',noop)
  await recording.setDirectory(dir);recording.configure({encoding:'float32',sampleRate:'source',namePrefix:'Quality'})
  const id={sourceId:'device',frames:'48',originFrame:'0',captureStartFrame:'0',epochId:'1',measurementEpoch:'1',sampleRate:48000,channelCount:1}
  const saved=await recording.saveReplay(id,{startFrame:'5',endFrame:'23'})
  const loaded=new RecordingService(native,'unused','unused','unused',noop);await loaded.setDirectory(dir)
  const doc=loaded.session(saved.takeId).document;assert.equal(sourceContinuity(doc),expected);assert.equal(doc.regions[0].estimatedFrames,quality?.estimatedFrames||'0')
  const source=await loaded.analysisSource(saved.takeId,'source'),p=new PlaybackService(new Native(),new Analysis(),noop)
  await p.open(source,'device');assert.equal((await p.sample()).continuity,expected)
  review.set(context({playback:p,recordings:loaded,imports:{has:()=>false}}));assert.equal(review.makeReportInput(p.view().id,'whole').request.source.integrity.state,integrity)
  const legacy=structuredClone(doc);delete legacy.regions[0].captureQuality;legacy.regions[0].estimatedFrames='0';legacy.hasDiscontinuities=false
  assert.equal(sourceContinuity(normalizeSession(legacy)),'unknown');await p.close()
 }
})
test('freezing history shows native quality and legacy history does not default to complete',async()=>{
 for(const [quality,expected]of [[{version:1,estimatedFrames:'1',gapFrames:'0',unknown:false},'estimated-silence'],[{version:1,estimatedFrames:'0',gapFrames:'0',unknown:false},'complete'],[undefined,'unknown']]){
  const p=new PlaybackService(new Native(),new Analysis(),noop)
  await p.openReplay('device',{quality,frames:'48000',originFrame:'0',captureStartFrame:'0',sourceId:'device',epochId:'1',measurementEpoch:'1',sampleRate:48000,channelCount:1})
  assert.equal(p.spectralSource(p.view().id).source.continuity,expected);await p.close()
 }
})
test('first-paint proof rejects null, missing, non-finite and late marks',()=>{
 const {assertThemeBeforeFirstPaint}=require('../tools/themes/first-paint.cjs')
 for(const proof of [{mark:1,paint:null},{mark:null,paint:2},{mark:NaN,paint:2},{mark:1,paint:Infinity},{mark:2,paint:1},{mark:2,paint:2}])assert.throws(()=>assertThemeBeforeFirstPaint(proof))
 assert.doesNotThrow(()=>assertThemeBeforeFirstPaint({mark:0,paint:2}))
})
