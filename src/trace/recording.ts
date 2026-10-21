import type {ReplaySaveIdentity,ReplaySaveRequest,ReplaySaveResult} from './replaySaveTypes'
import {validateReplayQuality} from './replaySaveTypes'
import {sourceContinuity} from './captureIntegrity'
export {sourceContinuity} from './captureIntegrity'
import {nativeFilePath} from './nativeFilePath'
import {localRecordingName} from './naming'
import {createReadStream} from 'node:fs'
import {mkdir,readdir,stat,lstat,realpath} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {basename,join,sep} from 'node:path'
import {recoverFiles} from './fileJobs'
import {inspectRecovery} from './recovery'
import {measurementConfigId} from './analysisTypes'
import {mediaDurationNs,u64} from './sessionTimeline'
import {StoredSession,readSession} from './sessionStore'
import {exportView} from './exportTypes'
import {defaultRecordSettings,validateRecordSettings,recordingEncoding} from './recordSettings'
import {errorCode} from './diagnostics'
export {defaultRecordSettings,validateRecordSettings} from './recordSettings'
import type {SessionDocument,CaptureRegion,SessionAsset,SessionSegment} from './sessionStore'
import {postprocessWav} from './wavPostprocess'
import {RecordingDisplay} from './recordingDisplay'
import {restoreInterruptedRetention} from './retentionState'
import type {AnalysisSource} from './analysisService'
import type {NativeRecordSnapshot,RecordSettings,TakeSummary,AnalysisRole,RecordingView} from './shared'

export interface RecordNative {
  replaySave?(request:ReplaySaveRequest):Promise<ReplaySaveResult>
 recordStart(id:string,path:string,encoding:string,segmentBytes?:number,journalPath?:string):NativeRecordSnapshot
 recordStop():NativeRecordSnapshot
 recordStatus():NativeRecordSnapshot
}
type SourceEpoch={captureEpochId:string;deviceId:string}
type Format={sampleRate:number;channelCount:number}
export type CaptureIssue={recoverable:boolean;error:string|null}
export type ReconnectHandler=(deviceId:string,isCurrent:()=>boolean)=>Promise<{format:Format;source:SourceEpoch}>
type Active={take:StoredSession;region?:CaptureRegion;wanted:boolean;generation:number;phase:string;finished:boolean;attempts:number;retryError:string|null;timer?:ReturnType<typeof setTimeout>;opening?:Promise<boolean>;last?:NativeRecordSnapshot;issue:CaptureIssue;display:RecordingDisplay;displayFault?:boolean}
async function hashFile(path:string):Promise<string>{
 const before=await stat(path),value=createHash('sha256')
 for await(const bytes of createReadStream(path))value.update(bytes)
 const after=await stat(path);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('SOURCE_CHANGED_DURING_FINALIZE')
 return value.digest('hex')
}
export class RecordingService {
 directory=''
 settings:RecordSettings={...defaultRecordSettings}
 private takes=new Map<string,StoredSession>()
 /** Directories whose manifest could not be read, keyed by absolute path. */
 private unreadable=new Map<string,{name:string;error:string|null}>()
 private active:Active|null=null
 private closed=new Set<string>()
 private jobs:Promise<void>=Promise.resolve()
 private transitions:Promise<void>=Promise.resolve()
 private recovering=false
 private cacheSaving:Promise<{takeId:string;role:AnalysisRole}>|undefined
 private closing=false
 private reconnect?:ReconnectHandler
 private finalized?:(id:string)=>Promise<void>
 private resolveExport?:(takeId:string,exportId:string)=>Promise<AnalysisSource>
 constructor(private native:RecordNative,private ffmpeg:string,private ffprobe:string,private nativePath:string,private changed:()=>void,private segmentBytes=2147483648,private retryDelayMs=500){}
 setFinalizedHandler(handler:(id:string)=>Promise<void>):void{this.finalized=handler}
 session(id:string):StoredSession{const value=this.takes.get(id);if(!value)throw Error('UNKNOWN_TAKE');return value}
 sessions():StoredSession[]{return [...this.takes.values()]}
 setExportResolver(handler:(takeId:string,exportId:string)=>Promise<AnalysisSource>):void{this.resolveExport=handler}
 forget(id:string):void{if(this.busy())throw Error("LIBRARY_BUSY");this.takes.delete(id);this.changed()}
 async settled():Promise<void>{await this.transitions;await this.jobs}
 notify():void{this.changed()}
 setReconnectHandler(handler:ReconnectHandler):void{this.reconnect=handler}
 busy():boolean{return this.active!==null||this.recovering||Boolean(this.cacheSaving)}
 summaries():TakeSummary[]{
  return [...this.takes.values()].map(({document:d}):TakeSummary=>{
   const preferred=(['deliverable','session','recovered','source'] as AnalysisRole[]).map(role=>d.assets.filter(a=>a.role===role&&!['superseded','removed','removing'].includes(a.state||''))).find(items=>items.length)||[]
   const rates=[...new Set(preferred.map(a=>a.sampleRate))]
   const exported=[...(d.exports||[])].reverse().find(r=>r.automatic&&r.phase==='ready'&&r.result)
   return {continuity:sourceContinuity(d),retention:d.retention,exports:d.exports?.map(r=>exportView(r,d.sessionId,d.name)),id:d.sessionId,name:d.name,createdAt:d.createdAt,status:d.status,frames:preferred.length?preferred.reduce((n,a)=>n+BigInt(a.frameCount),0n).toString():d.frames,
    sampleRate:preferred[0]?.sampleRate||d.sourceFormat.sampleRate,encoding:preferred[0]?.encoding||recordingEncoding(d.preset,d.sourceFormat.sampleRate),segmentCount:preferred.length,error:d.error,
    durationNs:preferred.length?mediaDurationNs(preferred.map(a=>({frames:a.frameCount,sampleRate:a.sampleRate}))):d.durationNs,
    mixedSampleRate:rates.length>1,sourceClippedSamples:d.regions.reduce((n,r)=>n+BigInt(r.clippedSamples),0n).toString(),clippedSamples:preferred.length&&preferred.every(a=>a.clippedSamples!==undefined)?preferred.reduce((n,a)=>n+BigInt(a.clippedSamples!),0n).toString():undefined,analysisRegions:d.regions.flatMap(r=>(['source','recovered'] as AnalysisRole[]).filter(role=>d.assets.some(a=>a.regionId===r.id&&a.role===role&&!['superseded','removed','removing'].includes(a.state||''))).map(role=>({id:r.id,role,ordinal:r.ordinal,sampleRate:r.format.sampleRate,channelCount:r.format.channelCount,frames:r.frames}))),roles:[...new Set(d.assets.filter(a=>!['superseded','removed','removing'].includes(a.state||'')).map(a=>a.role))],regionCount:d.regions.length,hasDiscontinuities:d.hasDiscontinuities,
    ...(exported?.result?{preferredExportId:exported.id,encoding:exported.result.codec==='mp3'?'mp3':exported.result.codec==='aac'?'aac':'float32',sampleRate:exported.result.sampleRate,frames:exported.result.frames,segmentCount:exported.result.files.length,durationNs:mediaDurationNs([{frames:exported.result.frames,sampleRate:exported.result.sampleRate}]),container:exported.result.container,bitrate:exported.preset.format!=='wav'?exported.preset.bitrate:undefined}:{} )}
  }).concat([...this.unreadable].map(([directory,{name,error}]):TakeSummary=>({
   id:'unreadable:'+directory,name,createdAt:'',status:'unreadable',frames:'0',sampleRate:0,encoding:'',segmentCount:0,
   error,availability:'unavailable',roles:[],regionCount:0,
  }))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
 }
 /** Directories whose manifest failed to parse; the audio files are untouched. */
 unreadableDirectories():{directory:string;name:string;error:string|null}[]{
  return [...this.unreadable].map(([directory,value])=>({directory,...value}))
 }
 activeSummary():{id:string;phase:string;durationNs:string;regionCount:number;retryError:string|null}|null{
  const a=this.active;if(!a)return null
  return {id:a.take.document.sessionId,phase:a.phase,durationNs:this.display(a.last)?.durationNs||a.take.document.durationNs,regionCount:a.take.document.regions.length,retryError:a.retryError}
 }
 display(snapshot?:NativeRecordSnapshot):RecordingView|undefined{
  const a=this.active
  return a?.region&&!a.displayFault?a.display.snapshot(a.take.document.regions,a.region,snapshot):undefined
 }
 async setDirectory(directory:string):Promise<void>{
  if(this.busy())throw Error('RECORDING_ACTIVE')
  if(!(await stat(directory)).isDirectory())throw Error('INVALID_DIRECTORY')
  this.directory=directory;this.takes.clear();this.unreadable.clear()
  for(const entry of await readdir(directory,{withFileTypes:true})){
   if(!entry.isDirectory()||entry.isSymbolicLink())continue
   // A normal folder is not a recording. Only a regular session manifest is a
   // candidate; damaged manifests stay visible without touching their audio.
   try{
    const manifest=await lstat(join(directory,entry.name,'session.json')).catch(error=>{if(error.code!=='ENOENT')throw error;return undefined})
    if(!manifest?.isFile()||manifest.isSymbolicLink())continue
    const take=await readSession(join(directory,entry.name));take.document.preset=validateRecordSettings(take.document.preset)
    if(restoreInterruptedRetention(take.document)){
     // A prior process may have stopped after persisting 'removing' but before
     // confirming every unlink. Make the surviving source visible for review.
     try{await take.save()}catch{take.document.retention={phase:'error',error:'RETENTION_RECOVERY_SAVE_FAILED'}}
    }
    this.takes.set(take.document.sessionId,take)}
   catch(error){if(error instanceof Error&&error.message==='NOT_TRACE_SESSION')continue;this.unreadable.set(join(directory,entry.name),{name:entry.name,error:errorCode(error)})}
  }
  this.changed()
 }
 configure(value:unknown):void{if(this.busy())throw Error('RECORDING_ACTIVE');this.settings=validateRecordSettings(value);this.changed()}
 private queue(take:StoredSession,action:()=>Promise<void>):void{
  this.jobs=this.jobs.then(action).catch(async error=>{take.document.status='failed';take.document.error=String(error);await take.save().catch(()=>{});this.changed()})
 }
 async start(format:Format,source:SourceEpoch):Promise<void>{
  if(this.busy())throw Error('RECORDING_ACTIVE')
  if(this.closing)throw Error('APP_CLOSING')
  if(!this.directory)throw Error('DIRECTORY_REQUIRED')
  const id=randomUUID(),createdAt=new Date().toISOString(),name=localRecordingName(this.settings.namePrefix,new Date(createdAt))
  const document:SessionDocument={schemaVersion:2,product:'Trace',sessionId:id,name,createdAt,status:'preparing',deviceId:source.deviceId,captureEpochId:source.captureEpochId,
   preset:{...this.settings},sourceFormat:{...format},captureStartFrame:null,captureEndFrameExclusive:null,frames:'0',durationNs:'0',error:null,regions:[],assets:[],segments:[],
   takes:[{takeId:id,sourceFormat:{...format},outputPreset:{...this.settings},measurementConfigId}],events:[],eventSequence:0,hasDiscontinuities:false}
  const take=new StoredSession(join(this.directory,name+'-'+id.slice(0,8)),document)
  const a:Active={take,wanted:true,generation:1,phase:'preparing',finished:false,attempts:0,retryError:null,issue:{recoverable:false,error:null},display:new RecordingDisplay()}
  this.active=a;this.takes.set(id,take);this.changed()
  try{await mkdir(join(take.directory,'audio'),{recursive:true});a.opening=this.beginRegion(a,format,source);await a.opening}
  catch(error){
   a.wanted=false;a.generation++;document.error=String(error)
   const snapshot=this.native.recordStatus()
   if(a.region&&snapshot.id===a.region.nativeId&&['complete','failed'].includes(snapshot.phase))this.observe(snapshot,{recoverable:false,error:String(error)})
   else if(a.region&&snapshot.id===a.region.nativeId&&['preparing','armed','recording','finalizing'].includes(snapshot.phase))this.native.recordStop()
   else{if(a.region)a.region.status='cancelled';this.finishSession(a)}
   throw error
  }finally{a.opening=undefined}
 }
  saveReplay(info:ReplaySaveIdentity,range:{startFrame:string;endFrame:string}):Promise<{takeId:string;role:AnalysisRole}>{
  if(this.busy())throw Error('RECORDING_ACTIVE')
  if(this.closing)throw Error('APP_CLOSING')
  if(!this.directory)throw Error('DIRECTORY_REQUIRED')
  if(!this.native.replaySave)throw Error('CACHE_SAVE_UNAVAILABLE')
  if(typeof info.sourceId!=='string'||!info.sourceId||info.sourceId.length>1024||info.sourceId.includes('\0')||!Number.isInteger(info.sampleRate)||info.sampleRate<8000||info.sampleRate>96000||![1,2].includes(info.channelCount)||
   ![info.frames,info.originFrame,info.captureStartFrame,info.epochId,info.measurementEpoch,range.startFrame,range.endFrame].every(u64)||
   BigInt(info.frames)>BigInt(info.sampleRate)*60n||BigInt(range.endFrame)>BigInt(info.frames)||BigInt(range.startFrame)>=BigInt(range.endFrame))throw Error('INVALID_REPLAY_SELECTION')
  const settings={...this.settings},task=Promise.resolve().then(()=>this.writeReplay(info,range,settings))
  this.cacheSaving=task;this.jobs=Promise.allSettled([this.jobs,task]).then(()=>undefined);this.changed()
  return task.finally(()=>{if(this.cacheSaving===task)this.cacheSaving=undefined;this.changed()})
 }
 private async writeReplay(info:ReplaySaveIdentity,range:{startFrame:string;endFrame:string},settings:RecordSettings):Promise<{takeId:string;role:AnalysisRole}>{
  const id=randomUUID(),createdAt=new Date().toISOString(),name=localRecordingName(settings.namePrefix+'-缓存',new Date(createdAt)),epoch='memory:'+id
  const encoding=recordingEncoding(settings,info.sampleRate),format={sampleRate:info.sampleRate,channelCount:info.channelCount}
  const region:CaptureRegion={id,nativeId:id,ordinal:1,baseName:name,journalFile:'journal.jsonl',captureEpochId:epoch,format,frames:'0',startFrame:'0',endFrameExclusive:'0',clock:{domain:epoch,startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false},encoding,status:'preparing',error:null,estimatedFrames:'0',clippedSamples:'0'}
  const d:SessionDocument={schemaVersion:2,product:'Trace',sessionId:id,name,createdAt,status:'processing',deviceId:'memory',captureEpochId:epoch,preset:settings,sourceFormat:format,captureStartFrame:'0',captureEndFrameExclusive:'0',frames:'0',durationNs:'0',error:null,regions:[region],assets:[],segments:[],takes:[{takeId:id,measurementConfigId}],events:[],eventSequence:0,hasDiscontinuities:false,
   origin:{kind:'memory',sourceId:info.sourceId,epochId:info.epochId,measurementEpoch:info.measurementEpoch,cacheOriginFrame:info.originFrame,captureStartFrame:info.captureStartFrame,sourceFrames:info.frames,...range}}
  const take=new StoredSession(join(this.directory,name+'-'+id.slice(0,8)),d);this.takes.set(id,take);this.changed()
  let sourceReady=false
  try{
   await mkdir(join(take.directory,'audio'),{recursive:true});await take.event('cache.save.prepared');await take.save()
   const result=await this.native.replaySave!({...info,...range,encoding,basePath:nativeFilePath(join(take.directory,'audio',name)),journalPath:nativeFilePath(join(take.directory,'journal.jsonl'))})
   if(result.sampleRate!==info.sampleRate||result.channelCount!==info.channelCount||result.encoding!==encoding||result.frames!==(BigInt(range.endFrame)-BigInt(range.startFrame)).toString()||
    result.segments.reduce((n,s)=>n+BigInt(s.frames),0n).toString()!==result.frames)throw Error('CACHE_SAVE_FRAME_MISMATCH')
   region.frames=result.frames;region.endFrameExclusive=result.frames;region.status='closed';region.clippedSamples=result.clippedSamples
   region.captureQuality=result.quality?validateReplayQuality(result.quality,result.frames):{version:1,estimatedFrames:'0',gapFrames:'0',unknown:true}
   region.estimatedFrames=region.captureQuality.estimatedFrames
   d.hasDiscontinuities=BigInt(region.captureQuality.gapFrames)>0n
   let prefix=0n
   for(const [index,segment]of result.segments.entries()){
    if(segment.file!==name+'-'+(index+1)+'.wav')throw Error('INVALID_CACHE_SAVE_PATH')
    const assetId=id+'-source-'+index
    d.assets.push({assetId,role:'source',regionId:id,relativePath:'audio/'+segment.file,sampleRate:info.sampleRate,channelCount:info.channelCount,encoding,frameCount:segment.frames,clippedSamples:segment.clippedSamples,hash:await hashFile(join(take.directory,'audio',segment.file))})
    d.segments.push({segmentId:assetId+'-segment',assetId,regionId:id,frameCount:segment.frames,captureStartFrame:prefix.toString(),timelineStartFrame:prefix.toString(),regionStartFrame:prefix.toString()});prefix+=BigInt(segment.frames)
   }
   sourceReady=true;await take.save()
   await postprocessWav(take,this.ffmpeg,this.ffprobe,this.nativePath)
   d.status='ready';await take.event('cache.saved',{frames:result.frames});await take.save();this.changed();await this.finalized?.(id)
   return {takeId:id,role:d.assets.some(a=>a.role==='deliverable')?'deliverable':'source'}
  }catch(error){
   d.error=String(error);d.status=sourceReady?'failed':'recoverable'
   if(!sourceReady){region.status='interrupted';region.error='CACHE_SAVE_INCOMPLETE';d.hasDiscontinuities=true
    try{const inventory=await inspectRecovery(take.directory,name);region.frames=inventory.confirmedFrames||'0';region.endFrameExclusive=region.frames}catch{d.status='failed'}}
   await take.save().catch(()=>{});this.changed();throw error
  }
 }
 private async beginRegion(a:Active,format:Format,source:SourceEpoch):Promise<boolean>{
  const d=a.take.document,ordinal=d.regions.length+1,generation=a.generation
  if(ordinal>10000)throw Error('TOO_MANY_CAPTURE_REGIONS')
  const id=ordinal===1?d.sessionId:d.sessionId+'-r'+ordinal
  const encoding=recordingEncoding(d.preset,format.sampleRate)
  const region:CaptureRegion={id,nativeId:id,ordinal,baseName:ordinal===1?d.name:d.name+'-r'+ordinal,journalFile:ordinal===1?'journal.jsonl':'region-'+ordinal+'.journal.jsonl',
   captureEpochId:source.captureEpochId,format:{...format},frames:'0',startFrame:null,endFrameExclusive:null,
   clock:{domain:source.captureEpochId.split(':')[0],startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false},
   encoding,status:'preparing',error:null,estimatedFrames:'0',clippedSamples:'0'}
  d.regions.push(region);a.region=region;a.phase='preparing';a.last=undefined;this.changed()
  await a.take.event('region.prepared',{regionId:id,captureEpochId:source.captureEpochId,format});await a.take.save()
  if(!a.wanted||a.finished||a.generation!==generation||this.active!==a){region.status='cancelled';await a.take.save();return false}
  this.native.recordStart(id,nativeFilePath(join(a.take.directory,'audio',region.baseName)),region.encoding,this.segmentBytes,nativeFilePath(join(a.take.directory,region.journalFile)))
  region.status='recording';d.status='recording';a.phase='armed';a.retryError=null;this.changed();await a.take.save();return true
 }
 private recordRegion(a:Active,snapshot:NativeRecordSnapshot):void{
  const r=a.region!,d=a.take.document
  const total=snapshot.segments.reduce((n,s)=>n+BigInt(s.frames),0n)
  if(total!==BigInt(snapshot.writtenFrames))throw Error('REGION_SEGMENT_FRAME_MISMATCH')
  r.frames=snapshot.writtenFrames;r.startFrame=snapshot.startFrame;r.endFrameExclusive=snapshot.endFrameExclusive
  r.clock={domain:r.clock.domain,startQpc100ns:snapshot.startQpc100ns??null,endQpc100ns:snapshot.endQpc100ns??null,startEstimated:snapshot.startQpcEstimated??false,endEstimated:snapshot.endQpcEstimated??false}
  r.status=snapshot.phase==='failed'?'interrupted':'closed';r.error=snapshot.error;r.estimatedFrames=snapshot.estimatedFrames;r.clippedSamples=snapshot.clippedSamples
  d.inputMetrics=snapshot.meters
  if(d.regions.length===1)Object.assign(d.takes[0],{actualStartFrame:r.startFrame,actualEndFrameExclusive:r.endFrameExclusive,estimatedFrames:r.estimatedFrames,clippedSamples:r.clippedSamples,clock:r.clock})
  let prefix=0n;const added:SessionAsset[]=[]
  for(let i=0;i<snapshot.segments.length;i++){
   const segment=snapshot.segments[i]
   if(basename(segment.file)!==segment.file||!segment.file.startsWith(r.baseName+'-'))throw Error('INVALID_SEGMENT_PATH')
   const assetId=r.id+'-source-'+i
   const asset:SessionAsset={assetId,role:'source',regionId:r.id,relativePath:'audio/'+segment.file,sampleRate:r.format.sampleRate,channelCount:r.format.channelCount,
    encoding:snapshot.encoding,frameCount:segment.frames,hash:null,clippedSamples:segment.clippedSamples}
   d.assets.push(asset);added.push(asset)
   d.segments.push({segmentId:r.id+'-segment-'+i,assetId,regionId:r.id,frameCount:segment.frames,captureStartFrame:r.startFrame===null?null:(BigInt(r.startFrame)+prefix).toString(),timelineStartFrame:prefix.toString(),regionStartFrame:prefix.toString()})
   prefix+=BigInt(segment.frames)
  }
  if(!a.displayFault)a.display.close(d.regions,r,snapshot)
  this.queue(a.take,async()=>{for(const asset of added)asset.hash=await hashFile(join(a.take.directory,asset.relativePath));await a.take.save()})
 }
 observe(snapshot:NativeRecordSnapshot,issue:CaptureIssue={recoverable:false,error:null}):void{
  const a=this.active,r=a?.region
  if(!a||!r||snapshot.id!==r.nativeId||a.finished)return
  a.last=snapshot;a.issue=issue
  if(!['complete','failed'].includes(snapshot.phase)){
   if(a.phase!==snapshot.phase&&!(a.phase==='finalizing'&&['armed','recording'].includes(snapshot.phase))){a.phase=snapshot.phase;this.changed()}
   return
  }
  if(this.closed.has(r.nativeId))return
  this.closed.add(r.nativeId)
  if(snapshot.phase==='complete'&&a.wanted)snapshot={...snapshot,phase:'failed',error:issue.recoverable?'DEVICE_UNAVAILABLE':issue.error||'UNEXPECTED_CAPTURE_STOP'}
  const recoverable=issue.recoverable&&snapshot.error==='DEVICE_UNAVAILABLE'
  try{this.recordRegion(a,snapshot)}catch(error){a.take.document.error=String(error);a.wanted=false}
  if(snapshot.error){a.take.document.hasDiscontinuities=true;if(!recoverable)a.take.document.error=snapshot.error}
  a.phase=a.wanted&&recoverable?'reconnecting':'finalizing';a.take.document.status=a.phase==='reconnecting'?'reconnecting':'processing';this.changed()
  this.transitions=this.transitions.catch(()=>{}).then(async()=>{
   await a.take.event('region.closed',{regionId:r.id,frames:r.frames,error:r.error,canReconnect:recoverable})
   await a.take.save()
   if(a.wanted&&recoverable&&this.reconnect&&!this.closing){this.scheduleRetry(a)}
   else this.finishSession(a)
  }).catch(error=>{a.take.document.error=String(error);this.finishSession(a)})
 }
 private scheduleRetry(a:Active):void{
  if(!a.wanted||a.finished||this.active!==a||this.closing)return
  a.phase='reconnecting';a.take.document.status='reconnecting';this.changed()
  const generation=a.generation
  a.timer=setTimeout(()=>{a.timer=undefined;void this.retry(a,generation)},Math.min(5000,this.retryDelayMs*Math.max(1,2**Math.min(a.attempts,4))))
 }
 private async retry(a:Active,generation:number):Promise<void>{
  const current=()=>this.active===a&&a.wanted&&!a.finished&&!this.closing&&a.generation===generation
  if(!current()||!this.reconnect)return
  a.attempts++
  let preparing=false
  try{
   const next=await this.reconnect(a.take.document.deviceId,current)
   if(!current())return
   preparing=true
   if(next.source.deviceId!==a.take.document.deviceId)throw Error('RECONNECT_DEVICE_MISMATCH')
   if(next.source.captureEpochId===a.region?.captureEpochId)throw Error('RECONNECT_EPOCH_NOT_CHANGED')
   await a.take.event('source.reconnected',{attempt:a.attempts,captureEpochId:next.source.captureEpochId,format:next.format})
   if(!current())return
   a.opening=this.beginRegion(a,next.format,next.source);await a.opening;a.attempts=0
  }catch(error){
   if(!current())return
   const native=this.native.recordStatus()
   if(preparing){
    a.take.document.error=String(error);a.wanted=false
    if(a.region&&native.id===a.region.nativeId&&!this.closed.has(native.id)&&['preparing','armed','recording','finalizing'].includes(native.phase))this.native.recordStop()
    else if(a.region&&native.id===a.region.nativeId&&!this.closed.has(native.id))this.observe(native,{recoverable:false,error:String(error)})
    else{if(a.region&&a.region.status==='preparing')a.region.status='cancelled';this.finishSession(a)}
    return
   }
   if(a.region&&native.id===a.region.nativeId&&!this.closed.has(native.id)&&['preparing','armed','recording','finalizing'].includes(native.phase)){
    a.take.document.error=String(error);a.wanted=false;this.native.recordStop()
   }else if(a.region&&native.id===a.region.nativeId&&!this.closed.has(native.id)&&['complete','failed'].includes(native.phase)){
    this.observe(native,{recoverable:native.error==='DEVICE_UNAVAILABLE',error:String(error)})
   }else{a.retryError=String(error);this.scheduleRetry(a)}
  }finally{a.opening=undefined}
 }
 private finishSession(a:Active):void{
  if(a.finished)return
  a.finished=true;a.wanted=false;a.generation++;if(a.timer)clearTimeout(a.timer)
  if(this.active===a)this.active=null
  const d=a.take.document
  if(a.region&&a.region.status==='preparing')a.region.status='cancelled'
  d.status='processing';this.changed()
  this.queue(a.take,async()=>{
   if(!d.error)await postprocessWav(a.take,this.ffmpeg,this.ffprobe,this.nativePath)
   d.status=d.error?'failed':'ready';await a.take.event('session.closed',{hasDiscontinuities:d.hasDiscontinuities,error:d.error});await a.take.save();this.changed();await this.finalized?.(d.sessionId)
  })
 }
 async fail(error:string):Promise<void>{
  const a=this.active;if(!a)return
  // Keep the audio prefix and mark the take failed; invalid display data is not reusable.
  a.displayFault=true;a.take.document.error=error;a.issue={recoverable:false,error}
  await this.stop()
 }
 async stop():Promise<NativeRecordSnapshot|null>{
  const a=this.active;if(!a)return this.native.recordStatus()
  a.wanted=false;a.generation++;if(a.timer)clearTimeout(a.timer);a.phase='finalizing';this.changed()
  if(a.opening)await a.opening.catch(()=>{})
  const current=this.native.recordStatus()
  if(a.region&&current.id===a.region.nativeId&&!this.closed.has(current.id)){
   this.native.recordStop();const begin=Date.now()
   for(;;){
    const snapshot=this.native.recordStatus()
    if(['complete','failed'].includes(snapshot.phase)){this.observe(snapshot,a.issue);await this.transitions;if(!a.finished)this.finishSession(a);return snapshot}
    if(Date.now()-begin>30000)throw Error('RECORD_FINALIZE_TIMEOUT')
    await new Promise(resolve=>setTimeout(resolve,20))
   }
  }
  await this.transitions;this.finishSession(a);return a.last||current
 }
 async recover(id:string):Promise<void>{
  if(this.busy())throw Error('RECORDING_ACTIVE')
  const take=this.takes.get(id)
  if(!take||!['recoverable','failed'].includes(take.document.status))throw Error('RECOVERY_NOT_AVAILABLE')
  this.recovering=true;take.document.status='processing';this.changed()
  const operation=this.jobs.then(()=>this.recoverSession(take));this.jobs=operation.catch(()=>{})
  try{await operation}catch(error){take.document.status='recoverable';take.document.error=String(error);await take.save().catch(()=>{});throw error}
  finally{this.recovering=false;this.changed()}
 }
 private async recoverSession(take:StoredSession):Promise<void>{
  const d=take.document,token=randomUUID().slice(0,8),regions=structuredClone(d.regions),assets:SessionAsset[]=[],segments:SessionSegment[]=[]
  for(const r of regions){
   let inventory:Awaited<ReturnType<typeof inspectRecovery>>
   try{inventory=await inspectRecovery(take.directory,r.baseName,r.journalFile)}catch(error){if(r.status==='cancelled'&&r.frames==='0'&&String(error).includes('RECOVERY_AUDIO_MISSING'))continue;throw error}
   const jobs=inventory.files.map((name,i)=>({source:join(take.directory,'audio',name),target:join(take.directory,'audio',r.baseName+'-recovered-'+token+'-'+(i+1)+'.wav')}))
   const results=await recoverFiles(this.nativePath,jobs);if(results.length!==jobs.length)throw Error('RECOVERY_RESULT_MISMATCH')
   let prefix=0n
   for(let i=0;i<results.length;i++){
    const result=results[i],checkpoint=inventory.checkpointSegments.find(s=>s.file===inventory.files[i])
    if(result.sampleRate!==r.format.sampleRate||result.channelCount!==r.format.channelCount)throw Error('RECOVERY_FORMAT_MISMATCH')
    if(checkpoint&&BigInt(result.frames)<BigInt(checkpoint.frames))throw Error('RECOVERY_CHECKPOINT_TRUNCATED')
    const assetId=r.id+'-recovered-'+token+'-'+i
    assets.push({assetId,role:'recovered',regionId:r.id,relativePath:'audio/'+basename(jobs[i].target),sampleRate:result.sampleRate,channelCount:result.channelCount,
     encoding:result.encoding==='ieee-float'?'float32':result.containerBits===24?'pcm24':'pcm16',frameCount:result.frames,hash:await hashFile(jobs[i].target)})
    segments.push({segmentId:assetId+'-segment',assetId,regionId:r.id,frameCount:result.frames,captureStartFrame:null,timelineStartFrame:prefix.toString(),regionStartFrame:prefix.toString()});prefix+=BigInt(result.frames)
   }
   if(inventory.confirmedFrames!==null&&prefix<BigInt(inventory.confirmedFrames))throw Error('RECOVERY_CHECKPOINT_TRUNCATED')
   r.startFrame=r.startFrame??inventory.captureStartFrame
   if(inventory.clock){r.clock={domain:r.clock.domain,...inventory.clock};if(inventory.confirmedFrames!==prefix.toString())r.clock.endQpc100ns=null}
   if(r.captureQuality&&r.frames!==prefix.toString()){r.captureQuality={version:1,estimatedFrames:'0',gapFrames:'0',unknown:true};r.estimatedFrames='0'}
   r.frames=prefix.toString();r.endFrameExclusive=r.startFrame===null?null:(BigInt(r.startFrame)+prefix).toString();r.status='interrupted';r.error='RECOVERED_UNKNOWN_TAIL'
  }
  d.regions=regions;d.assets=d.assets.filter(a=>a.role!=='recovered').concat(assets);d.segments=d.segments.filter(s=>!s.segmentId.includes('-recovered-')).concat(segments)
  for(const asset of d.assets)if(asset.role==='session'||asset.role==='deliverable')asset.state='superseded'
  await postprocessWav(take,this.ffmpeg,this.ffprobe,this.nativePath,'recovered')
  d.status='recovered';d.error='已恢复完整写入的音频帧；中断时尚未写入的尾部无法确认。';d.hasDiscontinuities=true
  await take.event('session.recovered',{unknownTail:true});await take.save();await this.finalized?.(d.sessionId)
 }
 async analysisSource(id:string,role:AnalysisRole,regionId?:string,exportId?:string):Promise<AnalysisSource>{
  if(this.busy())throw Error('RECORDING_ACTIVE')
  if(role==='export'){if(!exportId||!this.resolveExport)throw Error('UNKNOWN_EXPORT');return this.resolveExport(id,exportId)}
  const take=this.takes.get(id)
  if(!take||!['ready','recovered','failed','processing'].includes(take.document.status))throw Error('ASSET_NOT_READY')
  const assets=take.document.assets.filter(a=>a.role===role&&!['superseded','removed','removing'].includes(a.state||'')&&(!regionId||a.regionId===regionId));if(!assets.length)throw Error('UNKNOWN_ASSET_ROLE')
  if(take.document.status==='processing'&&assets.some(a=>!a.hash))throw Error('ASSET_NOT_READY')
  const base=await realpath(take.directory),audio=await realpath(join(base,'audio')),sources:string[]=[]
  if(!audio.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_AUDIO_DIRECTORY')
  for(const asset of assets){
   if(!/^audio\/[^/\\\0]+\.wav$/i.test(asset.relativePath))throw Error('INVALID_ASSET_PATH')
   const path=join(base,asset.relativePath),details=await lstat(path),resolved=await realpath(path)
   if(!details.isFile()||details.isSymbolicLink()||!resolved.toLowerCase().startsWith((audio+sep).toLowerCase()))throw Error('INVALID_ASSET_PATH')
   if(asset.sampleRate!==assets[0].sampleRate||asset.channelCount!==assets[0].channelCount)throw Error('ANALYSIS_FORMAT_CHANGE')
   sources.push(resolved)
  }
  const cacheRoot=join(base,'cache');try{const details=await lstat(cacheRoot);if(!details.isDirectory()||details.isSymbolicLink())throw Error('INVALID_CACHE_DIRECTORY')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  return {assetFormat:{format:'wav',sampleRate:assets[0].sampleRate,channelCount:assets[0].channelCount,encoding:assets.every(a=>a.encoding===assets[0].encoding)?assets[0].encoding:undefined},takeId:id,role,regionId,label:take.document.name+(regionId?' · 第 '+take.document.regions.find(r=>r.id===regionId)?.ordinal+' 段':'')+' · '+({source:'原始文件',deliverable:'成品文件',recovered:'恢复文件',session:'会话视图'}[role]),sources,cacheRoot,
   sampleRate:assets[0].sampleRate,channelCount:assets[0].channelCount,frames:assets.reduce((n,a)=>n+BigInt(a.frameCount),0n).toString(),
   continuity:sourceContinuity(take.document,regionId)}
 }
 folder(id:string):string{
  if(id.startsWith('unreadable:')){const directory=id.slice('unreadable:'.length);if(!this.unreadable.has(directory))throw Error('UNKNOWN_TAKE');return directory}
  const take=this.takes.get(id);if(!take)throw Error('UNKNOWN_TAKE');return take.directory
 }
 prepareShutdown():void{this.closing=true;const a=this.active;if(a){a.wanted=false;a.generation++;if(a.timer)clearTimeout(a.timer)}}
 async finish(snapshot:NativeRecordSnapshot):Promise<void>{
  this.prepareShutdown();const a=this.active
  if(a?.opening)await a.opening.catch(()=>{})
  if(a&&snapshot.id===a.region?.nativeId)this.observe(snapshot,a.issue)
  await this.transitions;if(a&&!a.finished)this.finishSession(a);await this.jobs
 }
}
