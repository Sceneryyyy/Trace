import type {InstrumentPacket,InstrumentRequest} from './instrumentTypes'
import type {ReplaySaveRequest,ReplaySaveResult} from './replaySaveTypes'
import {nativeFilePath} from './nativeFilePath'
import {randomUUID} from 'node:crypto'
import {measurementConfigId} from './analysisTypes'
import type {HistoricalMetrics} from './analysisTypes'
import type {AnalysisService,AnalysisSource} from './analysisService'
import type {FileView,Metric,NativePlaybackSnapshot,NativeMeterSnapshot,PlaybackView,WavePoint,LoudnessPoint,AnalysisJobView,NativeRecordSnapshot} from './shared'
export type ReplayInfo={frames:string;originFrame:string;captureStartFrame:string;sourceId:string;epochId:string;measurementEpoch:string;sampleRate:number;channelCount:number}
export type PlaybackNative={
 replaySave?(request:ReplaySaveRequest):Promise<ReplaySaveResult>
 replayFreeze(recording?:boolean):ReplayInfo
 replayRelease?():void
 playbackReplayOpen(id:string,deviceId:string):Promise<NativePlaybackSnapshot>
 replayView(position:string,start:string,end:string,width:number):{metrics:NativeRecordSnapshot['meters'];waveform:WavePoint[];loudnessHistory:LoudnessPoint[]}
 replayAnalyze(start:string,end:string):Promise<NativeRecordSnapshot['meters']>
 playbackOpen(id:string,sources:string[],deviceId:string,raw?:boolean,range?:{startFrame:string;endFrame:string}):Promise<NativePlaybackSnapshot>
 playbackClose():Promise<NativePlaybackSnapshot>
 playbackPlay():NativePlaybackSnapshot;playbackPause():NativePlaybackSnapshot
 playbackSeek(position:string,resume:boolean,loop:boolean,start:string,end:string):string
 playbackVolume(gain:number):void;playbackSnapshot():NativePlaybackSnapshot
}
type Context={
 temporary?:boolean;replayInfo?:ReplayInfo;readError:boolean;timeOffsetSeconds:number;deviceId:string;outputReady:boolean;nativeGeneration:string;selectionAnalysis?:AnalysisJobView;
 id:string;source:AnalysisSource;analysisId:string;selectionAnalysisId?:string;ready:boolean;generation:string;phase:string;error:string|null
 positionFrame:string;desiredPlaying:boolean;loop:boolean;follow:boolean;selection:{startFrame:string;endFrame:string}|null
 startFrame:string;endFrame:string;width:number;viewGeneration:number
 timeline?:{waveform:WavePoint[];loudnessHistory:LoudnessPoint[]};last?:NativePlaybackSnapshot
}
const empty=(unit:Metric['unit']):Metric=>({status:'insufficient',value:null,unit})
function emptyMetrics(channels:number):HistoricalMetrics{
 return {positionFrame:'0',levelIndexFrame:'0',loudnessIndexFrame:'0',channels:Array.from({length:channels},()=>({samplePeak:empty('dBFS'),rms:empty('dBFS'),truePeak:empty('dBTP')})),
  momentary:empty('LUFS'),shortTerm:empty('LUFS'),integratedToCursor:empty('LUFS'),loudnessRange:empty('LU'),maxTruePeak:empty('dBTP'),
  wholeFileIntegrated:empty('LUFS'),wholeFileLoudnessRange:empty('LU'),wholeFileMaxTruePeak:empty('dBTP')}
}
export class PlaybackService {
 private current:Context|null=null
 private operation=0
 private sampling=false
 private gain=1
 private replaySelectionBusy=false
 private replaySelectionNext:Context|undefined
 private release(c:Context|null):void{if(!c)return;if(c.analysisId)this.analyses.release(c.analysisId);if(c.selectionAnalysisId){this.analyses.cancel(c.selectionAnalysisId);this.analyses.release(c.selectionAnalysisId)}}
 constructor(private native:PlaybackNative,private analyses:AnalysisService,private changed:()=>void){}
 instrumentQuery?: (request:InstrumentRequest)=>Promise<InstrumentPacket|undefined>
 beforeSourceChange?:()=>Promise<void>
 spectralSource(id:string):{source:AnalysisSource;replay?:ReplayInfo;analysisKey?:string}{
  const c=this.context(id),job=this.analyses.snapshots().find(j=>j.id===c.analysisId)
  return {source:structuredClone(c.source),replay:c.replayInfo?{...c.replayInfo}:undefined,analysisKey:job?.phase==='ready'?job.cacheKey:undefined}
 }
 reportContext(id:string,selection:boolean){const c=this.context(id);if(c.temporary)throw Error('SAVE_CACHE_BEFORE_REPORT');if(selection&&!c.selection)throw Error('INVALID_SELECTION');const analysisId=selection?c.selectionAnalysisId:c.analysisId;if(!analysisId)throw Error('ANALYSIS_NOT_READY');return {analysisId,source:structuredClone(c.source),range:selection?{...c.selection!}:{startFrame:'0',endFrame:c.source.frames}}}
 active():boolean{return this.current!==null}
 outputActive():boolean{return Boolean(this.current?.outputReady)}
 renameTake(takeId:string,oldName:string,name:string):void{const c=this.current;if(c?.source.takeId===takeId&&c.source.label.startsWith(oldName)){c.source={...c.source,label:name+c.source.label.slice(oldName.length)};this.changed()}}
 replayForSave(id:string,selection:boolean):{info:ReplayInfo;range:{startFrame:string;endFrame:string}}{const c=this.context(id);if(!c.temporary||!c.replayInfo)throw Error('NOT_MEMORY_HISTORY');if(selection&&!c.selection)throw Error('INVALID_SELECTION');return {info:{...c.replayInfo},range:selection?{...c.selection!}:{startFrame:'0',endFrame:c.source.frames}}}
 setOutputDevice(id:string):void{if(this.current&&!this.current.outputReady){this.current.deviceId=id;this.changed()}}
 view():PlaybackView|null{
  const c=this.current;if(!c)return null
  const job=this.analyses.snapshots().find(job=>job.id===c.analysisId)
  return {timeOffsetSeconds:c.timeOffsetSeconds,outputReady:c.outputReady,temporary:c.temporary,id:c.id,takeId:c.source.takeId,role:c.source.role,regionId:c.source.regionId,exportId:c.source.exportId,label:c.source.label,phase:c.phase,error:c.error,
   positionFrame:c.positionFrame,totalFrames:c.source.frames,sampleRate:c.source.sampleRate,channelCount:c.source.channelCount,
    assetFormat:c.source.assetFormat,analysisError:job?.error||null,generation:c.generation,analysisId:c.analysisId,analysisPhase:c.temporary?'ready':job?.phase||'queued',selectionAnalysis:c.selectionAnalysis||this.analyses.snapshots().find(job=>job.id===c.selectionAnalysisId),gain:this.gain,loop:c.loop,follow:c.follow,selection:c.selection,
   startFrame:c.startFrame,endFrame:c.endFrame}
 }
     async openReplay(deviceId:string,info=this.native.replayFreeze(),timeOffsetSeconds=Number(info.captureStartFrame)/info.sampleRate,label='系统声音 · 历史'):Promise<void>{
   await this.open({takeId:'live-history',role:'source',label,sources:[],cacheRoot:'',sampleRate:info.sampleRate,channelCount:info.channelCount,frames:info.frames},deviceId,info,timeOffsetSeconds)
  }
  async open(source:AnalysisSource,deviceId:string,replayInfo?:ReplayInfo,timeOffsetSeconds=0):Promise<void>{
   const operation=++this.operation
   const previous=this.current;this.current=null;this.release(previous)
   await this.beforeSourceChange?.()
   await this.native.playbackClose()
   if(operation!==this.operation)return
   if(!replayInfo)this.native.replayRelease?.()
   const c:Context={temporary:Boolean(replayInfo),replayInfo,readError:false,timeOffsetSeconds,deviceId,outputReady:false,nativeGeneration:'0',
    id:randomUUID(),source,analysisId:'',ready:true,generation:'1',phase:'paused',error:null,positionFrame:'0',
    desiredPlaying:false,loop:false,follow:false,selection:null,startFrame:'0',endFrame:source.frames,width:900,viewGeneration:0}
   this.current=c
   try{if(!replayInfo){c.analysisId=this.analyses.start(source);this.analyses.retain(c.analysisId)}}
   catch(error){c.ready=false;this.fail('FILE_SNAPSHOT_FAILED: '+String(error));throw error}
   this.changed()
  }
  fail(error:string):void{
   const c=this.current;if(!c)return
   c.error=error;c.readError=true;c.desiredPlaying=false;c.phase='failed';try{if(c.outputReady)this.native.playbackPause()}catch{};this.changed()
  }
  async close():Promise<void>{
   ++this.operation;this.release(this.current);this.current=null;this.changed();await this.beforeSourceChange?.();await this.native.playbackClose();this.native.replayRelease?.()
  }
  private context(id:string):Context{
   const c=this.current;if(!c||c.id!==id)throw Error('STALE_PLAYBACK_SOURCE')
   if(!c.ready||c.readError)throw Error('PLAYBACK_NOT_READY')
    return c
  }
  useAnalysis(source:AnalysisSource,analysisId:string):void{
   const c=this.current
   if(!c||c.temporary||source.range||c.source.takeId!==source.takeId||c.source.role!==source.role||
    c.source.regionId!==source.regionId||c.source.exportId!==source.exportId||c.source.mediaIdentity!==source.mediaIdentity||
    c.source.frames!==source.frames||c.source.sampleRate!==source.sampleRate||c.source.channelCount!==source.channelCount||
    JSON.stringify(c.source.sources)!==JSON.stringify(source.sources)||c.analysisId===analysisId)return
   this.analyses.retain(analysisId)
   if(c.analysisId)this.analyses.release(c.analysisId)
   c.analysisId=analysisId;c.source=source;c.ready=true;c.readError=false;c.error=null
   if(!c.outputReady)c.phase='paused'
   c.generation=(BigInt(c.generation)+1n).toString();c.viewGeneration++;c.timeline=undefined
   this.changed()
  }
  retryAnalysis(id:string):void{
   const c=this.current
   if(!c||c.id!==id)throw Error('STALE_PLAYBACK_SOURCE')
   if(c.temporary)throw Error('INVALID_ANALYSIS_SOURCE')
   this.useAnalysis(c.source,this.analyses.start(c.source))
  }
  async play(id:string):Promise<void>{
   const c=this.context(id),operation=this.operation
   if(c.phase==='ended'||BigInt(c.positionFrame)>=BigInt(c.source.frames))this.seek(id,c.loop&&c.selection?c.selection.startFrame:'0',false)
   c.error=null;c.phase='preparing';this.changed()
   try{
    if(!c.outputReady){
     const result=c.temporary?await this.native.playbackReplayOpen(c.id,c.deviceId):await this.native.playbackOpen(c.id,c.source.sources.map(nativeFilePath),c.deviceId,true,c.source.decodeRange)
     if(operation!==this.operation||this.current!==c)return
     if(result.id!==c.id||result.totalFrames!==c.source.frames||result.format.sampleRate!==c.source.sampleRate||result.format.channelCount!==c.source.channelCount)throw Error('PLAYBACK_ASSET_CHANGED')
     c.outputReady=true;c.nativeGeneration=result.generation
     this.native.playbackVolume(this.gain)
     c.nativeGeneration=this.native.playbackSeek(c.positionFrame,false,c.loop,c.selection?.startFrame||'0',c.selection?.endFrame||'0')
    }
    c.desiredPlaying=true;this.native.playbackPlay();c.phase='buffering';this.changed()
   }catch(error){
    if(operation!==this.operation||this.current!==c)return
    await this.native.playbackClose();c.outputReady=false;c.desiredPlaying=false;c.phase='failed';c.error=String(error);this.changed();throw error
   }
  }
  async pause(id:string):Promise<void>{
   const c=this.context(id)
   if(c.outputReady){
    const raw=this.native.playbackSnapshot()
    if(raw.id===c.id&&BigInt(raw.generation)>=BigInt(c.nativeGeneration))c.positionFrame=raw.positionFrame
    c.desiredPlaying=false;c.outputReady=false
    await this.native.playbackClose()
   }
   if(this.current!==c)return
   c.desiredPlaying=false;c.phase='paused';c.generation=(BigInt(c.generation)+1n).toString();this.changed()
  }
seek(id:string,positionFrame:string,resume:boolean):void{
  const c=this.context(id),position=BigInt(positionFrame)
  if(position<0n||position>BigInt(c.source.frames))throw Error('PLAYBACK_POSITION_OUT_OF_RANGE')
  if(c.loop&&c.selection&&(position<BigInt(c.selection.startFrame)||position>=BigInt(c.selection.endFrame)))c.loop=false
  if(resume&&!c.outputReady)throw Error('PLAYBACK_OUTPUT_NOT_OPEN')
   c.generation=(BigInt(c.generation)+1n).toString()
   if(c.outputReady)c.nativeGeneration=this.native.playbackSeek(positionFrame,resume,c.loop,c.selection?.startFrame||'0',c.selection?.endFrame||'0')
  const viewStart=BigInt(c.startFrame),viewEnd=BigInt(c.endFrame),span=viewEnd-viewStart,total=BigInt(c.source.frames)
  if(span>0n&&(position<viewStart||position>viewEnd)){
   let next=position-span/2n;if(next<0n)next=0n;if(next+span>total)next=total-span
   c.startFrame=next.toString();c.endFrame=(next+span).toString();c.viewGeneration++;c.timeline=undefined
  }
  c.positionFrame=positionFrame;c.desiredPlaying=resume;c.phase=resume?'buffering':'paused';this.changed()
 }
 volume(id:string,gain:number):void{const c=this.context(id);if(c.outputReady)this.native.playbackVolume(gain);this.gain=gain;this.changed()}
  selection(id:string,startFrame:string,endFrame:string,loop:boolean):void{
  const c=this.context(id),start=BigInt(startFrame),end=BigInt(endFrame)
  if(start<0n||end<=start||end>BigInt(c.source.frames))throw Error('INVALID_SELECTION')
  const changed=c.selection?.startFrame!==startFrame||c.selection?.endFrame!==endFrame
  c.selection={startFrame,endFrame};c.loop=loop
  if(changed&&c.temporary){
   c.selectionAnalysis={id:randomUUID(),takeId:c.source.takeId,role:'source',label:'临时缓存 · 选区',phase:'queued',frames:'0',totalFrames:(end-start).toString(),sampleRate:c.source.sampleRate,channelCount:c.source.channelCount,error:null,selectionRange:{startFrame,endFrame}}
   this.replaySelectionNext=c;void this.drainReplaySelection()
  }else if(changed){
   if(c.selectionAnalysisId){this.analyses.cancel(c.selectionAnalysisId);this.analyses.release(c.selectionAnalysisId)}
   c.selectionAnalysisId=this.analyses.start({...c.source,range:{startFrame,endFrame},frames:(end-start).toString(),label:c.source.label+' · 选区'});this.analyses.retain(c.selectionAnalysisId)
  }
     const raw=c.outputReady?this.native.playbackSnapshot():undefined
   const positionFrame=raw&&raw.id===c.id&&BigInt(raw.generation)>=BigInt(c.nativeGeneration)?raw.positionFrame:c.positionFrame
   if(raw?.phase==='ended')c.desiredPlaying=false
   const position=BigInt(positionFrame),inside=position>=start&&position<end
    this.seek(id,loop&&!inside?startFrame:positionFrame,c.desiredPlaying)
  }
  clearSelection(id:string):void{
   const c=this.context(id)
   if(c.selectionAnalysisId){this.analyses.cancel(c.selectionAnalysisId);this.analyses.release(c.selectionAnalysisId)}
   c.selectionAnalysisId=undefined;c.selectionAnalysis=undefined;c.selection=null;c.loop=false
   if(this.replaySelectionNext===c)this.replaySelectionNext=undefined
   const raw=c.outputReady?this.native.playbackSnapshot():undefined
   const position=raw?.id===c.id&&BigInt(raw.generation)>=BigInt(c.nativeGeneration)?raw.positionFrame:c.positionFrame
   if(raw?.phase==='ended')c.desiredPlaying=false
   this.seek(id,position,c.desiredPlaying)
  }
 private async drainReplaySelection():Promise<void>{
  if(this.replaySelectionBusy)return
  this.replaySelectionBusy=true
  try{while(this.replaySelectionNext){
   const c=this.replaySelectionNext;this.replaySelectionNext=undefined
   const job=c.selectionAnalysis,range=job?.selectionRange;if(this.current!==c||!job||!range)continue
   job.phase='analyzing';this.changed()
   try{const metrics=await this.native.replayAnalyze(range.startFrame,range.endFrame);if(this.current===c&&c.selectionAnalysis===job){job.phase='ready';job.frames=job.totalFrames;job.summary=metrics;this.changed()}}
   catch(error){if(this.current===c&&c.selectionAnalysis===job){job.phase='failed';job.error=String(error);this.changed()}}
  }}finally{this.replaySelectionBusy=false}
 }
 window(id:string,startFrame:string,endFrame:string,width:number):void{
  const c=this.context(id),start=BigInt(startFrame),end=BigInt(endFrame)
  if(start<0n||end<=start||end>BigInt(c.source.frames)||!Number.isInteger(width)||width<1||width>2400)throw Error('INVALID_FILE_WINDOW')
  c.startFrame=startFrame;c.endFrame=endFrame;c.width=width;c.follow=false;c.viewGeneration++;c.timeline=undefined;this.changed()
 }
 follow(id:string,enabled:boolean):void{const c=this.context(id);c.follow=enabled;if(enabled){const position=BigInt(c.positionFrame),span=BigInt(c.endFrame)-BigInt(c.startFrame),total=BigInt(c.source.frames);let start=position-span/4n;if(start<0n)start=0n;if(start+span>total)start=total-span;c.startFrame=start.toString();c.endFrame=(start+span).toString();c.viewGeneration++;c.timeline=undefined}this.changed()}
 async sample():Promise<(NativeMeterSnapshot&{instruments?:InstrumentPacket;playback:NativePlaybackSnapshot;fileView:FileView})|undefined>{
  const c=this.current
  if(!c||!c.ready||c.readError||this.sampling)return
  this.sampling=true
  try{
       const viewGeneration=c.viewGeneration
    let native:NativePlaybackSnapshot
    if(c.outputReady){
     const raw=this.native.playbackSnapshot()
     if(raw.id!==c.id||BigInt(raw.generation)<BigInt(c.nativeGeneration))return
     if(raw.phase==='ended'||raw.phase==='failed')c.desiredPlaying=false
     const phase=raw.phase==='playing'&&!c.desiredPlaying?'paused':raw.phase==='paused'&&c.desiredPlaying?'buffering':raw.phase
     if(phase!==c.phase||raw.error!==c.error){c.phase=phase;c.error=raw.error;this.changed()}
     c.last=raw;c.positionFrame=raw.positionFrame;c.nativeGeneration=raw.generation
     native={...raw,generation:c.generation,phase}
    }else{
     // Inspection has no output clock. Measurements below still come from the actual cache.
     native={id:c.id,deviceId:c.deviceId,phase:c.phase,error:null,generation:c.generation,positionFrame:c.positionFrame,totalFrames:c.source.frames,
      format:{sampleRate:c.source.sampleRate,channelCount:c.source.channelCount,containerBits:32,validBits:32,encoding:'ieee-float',channelMask:0,blockAlign:c.source.channelCount*4},
      presentedStreamFrames:'0',submittedFrames:'0',clockPosition:'0',clockFrequency:'0',clockQpc100ns:'0',
      loopStart:c.selection?.startFrame||'0',loopEnd:c.selection?.endFrame||'0',loops:'0',outputRate:0,outputChannels:0,bufferFrames:0,paddingFrames:0,queueDepth:0,queueHighWater:0,
      playing:false,loop:c.loop,clockAccurate:false,rawModeApplied:false}
    }
if(c.follow&&native.playing&&(BigInt(native.positionFrame)<BigInt(c.startFrame)||BigInt(native.positionFrame)>=BigInt(c.endFrame))){this.follow(c.id,true);return}
   const generation=c.generation,job=this.analyses.snapshots().find(job=>job.id===c.analysisId)
   let metrics=emptyMetrics(c.source.channelCount)
   if(c.temporary){
    const current=this.native.replayView(native.positionFrame,c.startFrame,c.endFrame,c.timeline?0:c.width)
    metrics={...metrics,...current.metrics,positionFrame:native.positionFrame}
    if(!c.timeline)c.timeline={waveform:current.waveform,loudnessHistory:current.loudnessHistory}
   }else if(job?.phase==='ready'){
    try{
     const [value,timeline]=await Promise.all([
      this.analyses.metrics(c.analysisId,native.positionFrame),
      c.timeline?Promise.resolve(c.timeline):this.analyses.timeline(c.analysisId,c.startFrame,c.endFrame,c.width)
     ])
     metrics=value
     if(this.current===c&&c.viewGeneration===viewGeneration)c.timeline=timeline
    }catch(error){
     if(this.current!==c||c.generation!==generation||c.viewGeneration!==viewGeneration)return
     // AnalysisService owns cache repair. An invalid page never becomes a valid meter.
     if(!String(error).includes('CORRUPT_CACHE')&&!String(error).includes('ANALYSIS_NOT_READY')&&(error as NodeJS.ErrnoException).code!=='ENOENT')throw error
    }
   }
   if(this.current!==c||c.generation!==generation||c.viewGeneration!==viewGeneration)return
   const instruments=await this.instrumentQuery?.(c.temporary?{kind:'replay',...c.replayInfo!,sampleRate:c.source.sampleRate,positionFrame:native.positionFrame}:{kind:'file',identity:c.analysisId,sources:c.source.sources.map(nativeFilePath),sampleRate:c.source.sampleRate,positionFrame:native.positionFrame,...c.source.decodeRange})
   if(this.current!==c||c.generation!==generation||c.viewGeneration!==viewGeneration)return
   const fileView:FileView={timeOffsetSeconds:c.timeOffsetSeconds,temporary:c.temporary,totalFrames:c.source.frames,startFrame:c.startFrame,endFrame:c.endFrame,selection:c.selection,
     playingIntent:c.desiredPlaying,analysisId:c.analysisId,analysisError:job?.error||null,analysisPhase:c.temporary?'ready':job?.phase||'queued',selectionAnalysis:c.selectionAnalysis||this.analyses.snapshots().find(job=>job.id===c.selectionAnalysisId),wholeFileIntegrated:metrics.wholeFileIntegrated}
   return {instruments,protocolVersion:1,sourceKind:'file',sourceId:c.id,epochId:'0',measurementEpoch:'0',measurementConfigId,active:native.playing,error:native.error,
    format:native.format,positionFrame:native.positionFrame,measurementFrames:native.positionFrame,levelIndexFrame:metrics.levelIndexFrame,loudnessIndexFrame:metrics.loudnessIndexFrame,
    continuity:native.error?'unknown':'complete',channels:metrics.channels,momentary:metrics.momentary,shortTerm:metrics.shortTerm,integratedToCursor:metrics.integratedToCursor,
    loudnessRange:c.temporary?metrics.loudnessRange:metrics.wholeFileLoudnessRange,maxTruePeak:c.temporary?metrics.maxTruePeak:metrics.wholeFileMaxTruePeak,lraProvisional:(c.temporary?BigInt(c.replayInfo?.originFrame||0)+BigInt(native.positionFrame):BigInt(c.source.frames))<BigInt(c.source.sampleRate)*60n,
    waveform:c.timeline?.waveform||[],loudnessHistory:c.timeline?.loudnessHistory||[],
    diagnostics:{outputReady:c.outputReady,nativeGeneration:c.nativeGeneration,rawModeApplied:native.rawModeApplied,clockAccurate:native.clockAccurate,paddingFrames:native.paddingFrames,queueDepth:native.queueDepth},playback:native,fileView}
  }finally{this.sampling=false}
 }
}
