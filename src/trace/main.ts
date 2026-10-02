import {ReferenceService} from './referenceService'
import {ReferenceSpectrumService} from './referenceSpectrum'
import {NativeAnalysisQueue} from './nativeAnalysisQueue'
import {hashFiles} from './fileJobs'
import type {ReferenceSlot} from './referenceTypes'
import {ImportService} from './importService'
import {AssetRepository} from './assetRepository'
import {realpath as realpathAsync} from 'node:fs/promises'
import {basename} from 'node:path'
import {ReportService,type ReportInput} from './reportService'
import {defaultTargetSettings,restoreTargetSettings,validateTargetSettings} from './targetSettings'
import {assetFormatLabel} from './assetFormat'
import {PreferencesWriter} from './preferencesWriter'
import {SpectrogramPresenter,SpectrogramContextChanged,type SpectrogramBinding} from './spectrogramPresenter'
import {fileSpectrogramSource,replaySpectrogramSource,liveSpectrogramSource,takeSpectrogramSource} from './spectrogramSource'
import {defaultSpectrogramSettings,restoreSpectrogramSettings,validateSpectrogramSettings,validateSpectrogramQuery,type SpectrogramQuery,type SpectrogramSettings} from './spectrogramProtocol'
import type {SpectrogramNative} from './spectrogramService'
import {SessionTimeline} from './sessionTimeline'
import {InstrumentService} from './instrumentService'
import {defaultInstrumentSettings,restoreInstrumentSettings,validateInstrumentSettings,instrumentConfigKey,type InstrumentNative} from './instrumentTypes'
import {DeliveryService} from './deliveryService'
import {safeDiagnostics} from './diagnostics'
import {SupportRuntime} from './supportRuntime'
import {exportPreferencesVersion} from './exportPreferences'
import {recordingCapacity,freeSpace} from './storageCapacity'
import {mediaDurationNs} from './sessionTimeline'
import {LibraryService} from './libraryService'
import { app, BrowserWindow, dialog, ipcMain, shell, screen, clipboard } from 'electron'
import { join, resolve, sep,isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { validateRequest, isMutation } from './contracts'
import { RecordingService } from './recording'
import {sourceContinuity} from './captureIntegrity'
import { AnalysisService } from './analysisService'
import { PlaybackService } from './playbackService'
import {ExportService} from './exportService'
import {SourceRetention} from './sourceRetention'
import type {ExportSource} from './exportTypes'
import {validateExportPreset} from './mediaTypes'
import {recordSettingsVersion} from './recordSettings'
import {defaultWorkspace,restoreWorkspace,validateWorkspace} from './workspace'
import {defaultDisplaySettings,validateDisplaySettings,restoreDisplaySettings,displaySettingsVersion,validWindowSeconds} from './displaySettings'
import {defaultThemeId,instrumentThemeVersion,isThemeId,type ThemeId} from './instrumentThemes'
import {restoreWindowBounds} from './windowGeometry'
import {product} from './product'
import type {PlaybackNative} from './playbackService'
import type { Device, NativeMeterSnapshot, MeterSnapshot, NativeRecordSnapshot, Reply, Request, SourceFormat, TraceState } from './shared'
const requireNative=createRequire(__filename)
const root=resolve(__dirname,'../..')
const captureInstance=randomUUID()
type NativeEngine=PlaybackNative&InstrumentNative&SpectrogramNative&{
  runtimeModules():Record<string,string|null>;devices():Device[];start(id:string):SourceFormat;stop():void;reset():void;shutdown():NativeRecordSnapshot
  snapshot(seconds:number,columns:number):NativeMeterSnapshot
  recordStart(id:string,path:string,encoding:string,segmentBytes?:number,journalPath?:string):NativeRecordSnapshot
  recordStop():NativeRecordSnapshot;recordStatus():NativeRecordSnapshot
}
let engine:NativeEngine
let instruments:InstrumentService
let spectrogram:SpectrogramPresenter
let instrumentLiveBusy=false
let lastLivePublication:{key:string;frame:bigint}|undefined
let recordings:RecordingService
let analyses:AnalysisService
let playback:PlaybackService
let exporter:ExportService
let deliveries:DeliveryService
let library:LibraryService
let managingLibrary=false
let retention:SourceRetention
let window:BrowserWindow|null=null
let rendererUsable=false
let closePromptPending=false
let timer:ReturnType<typeof setInterval>|undefined
let importWatchTimer:ReturnType<typeof setInterval>|undefined
let inspection:{id:string;sourceKind:string;sourceId:string;epochId:string;measurementEpoch:string;origin:bigint;rate:number;total:bigint}|null=null
let finishingOutput=false,inspectionFailurePending=false
let latestRecordingFrame:Pick<MeterSnapshot,'recording'|'recordingView'>={}
let recordingCaptureHeld=false
let preferencesTimer:ReturnType<typeof setTimeout>|undefined
let preferencesReady=false
let preferencesWriter:PreferencesWriter|undefined
let supportRuntime:SupportRuntime|undefined
let reports:ReportService
let imports:ImportService
let assets:AssetRepository
let references:ReferenceService
let referenceSpectrum:ReferenceSpectrumService
const nativeAnalysisQueue=new NativeAnalysisQueue()
let displayTick=0,snapshotSequence=0,pollFailurePending=false,lastPollError=''
let state:TraceState={targetSettings:structuredClone(defaultTargetSettings),spectrogramSettings:{...defaultSpectrogramSettings},revision:0,active:false,monitoringRequested:true,deviceId:'',windowSeconds:30,error:null,displaySettings:{...defaultDisplaySettings},instrumentTheme:defaultThemeId,workspace:defaultWorkspace(),instrumentSettings:{...defaultInstrumentSettings}}
/** Theme is a separate top-level preference so older builds that validate displaySettings strictly keep working. */
function restoreInstrumentTheme(value:unknown):ThemeId{return isThemeId(value)?value:defaultThemeId}
const completed=new Map<string,{signature:string;reply:Reply}>()
const pending=new Map<string,{signature:string;promise:Promise<Reply>}>()
let mutations:Promise<unknown>=Promise.resolve()
const testMode=process.argv.includes('--trace-test')
const testRoot=testMode?(process.env.TRACE_TEST_ROOT?resolve(process.env.TRACE_TEST_ROOT):app.isPackaged?join(app.getPath('temp'),'Trace-validation',String(process.pid)):join(root,'artifacts')):undefined
if(testMode){if(!testRoot||!isAbsolute(testRoot))throw Error('INVALID_TEST_ROOT');const dir=process.env.TRACE_TEST_USER_DATA?resolve(process.env.TRACE_TEST_USER_DATA):join(testRoot,'test-users',String(process.pid));if(!dir.toLowerCase().startsWith((testRoot+sep).toLowerCase()))throw Error('INVALID_TEST_USER_DATA');mkdirSync(dir,{recursive:true});app.setPath('userData',dir)}
app.setName('Trace')
// Key the OS lock by the actual shared profile, including portable copies and path aliases.
const profileDirectory=app.getPath('userData')
mkdirSync(profileDirectory,{recursive:true})
app.setPath('userData',realpathSync.native(profileDirectory))
if(!app.requestSingleInstanceLock())app.exit(0)
let activateWhenReady=false
function activateExistingWindow():void{
 if(!window||window.isDestroyed()){activateWhenReady=true;return}
 if(window.isMinimized())window.restore()
 window.show();window.focus();activateWhenReady=false
}
app.on('second-instance',()=>activateExistingWindow())
process.on('uncaughtException',()=>{if(supportRuntime)return supportRuntime.fatal('main-uncaught');app.exit(1)})
process.on('unhandledRejection',()=>{if(supportRuntime)return supportRuntime.fatal('main-rejection');app.exit(1)})
function diagnosticSnapshot(){
 const basic=safeDiagnostics(product.version,state,engine.snapshot(5,1),engine.recordStatus())
 return {...basic,workbench:{visibleInstruments:state.workspace?8-state.workspace.layout.hidden.length:null,fftSize:state.instrumentSettings?.fftSize,spectrogramFftSize:state.spectrogramSettings?.fftSize},
  background:{imports:(state.imports||[]).slice(-32).map(j=>({status:j.status})),reports:(state.reportJobs||[]).slice(-32).map(j=>({phase:j.phase})),reference:state.reference?{active:state.reference.active,hasA:Boolean(state.reference.a),hasB:Boolean(state.reference.b),error:Boolean(state.reference.error)}:null}}
}
function sendRenderer(channel:string,value:unknown):void{if(rendererUsable&&window&&!window.isDestroyed())window.webContents.send(channel,value)}
function emitState():void{supportRuntime?.observe();state={...state,eventSequence:(state.eventSequence||0)+1};sendRenderer('trace:state',{...state})}
function update(patch:Partial<TraceState>):void{state={...state,...patch,revision:state.revision+1};emitState()}
const memoryAnalysisTakes=new Set<string>(),memoryAnalysisJobs=new Set<string>()
let preparingMemoryAnalysis=false
async function prepareMemoryAnalyses():Promise<void>{
 if(preparingMemoryAnalysis||!analyses||exiting||managingLibrary||recordings.busy())return
 preparingMemoryAnalysis=true
 try{
  for(const takeId of memoryAnalysisTakes){
   let take:ReturnType<RecordingService['session']>
   try{take=recordings.session(takeId)}catch{memoryAnalysisTakes.delete(takeId);continue}
   const d=take.document
   if(d.status!=='ready')continue
   const role=d.assets.some(a=>a.role==='deliverable'&&!['removed','removing','superseded'].includes(a.state||''))?'deliverable':'source'
   const targets:Array<{role:import('./shared').AnalysisRole;exportId?:string}>=[]
   if(d.assets.some(a=>a.role===role&&!['removed','removing','superseded'].includes(a.state||'')))targets.push({role})
   for(const output of d.exports||[])if(output.phase==='ready')targets.push({role:'export',exportId:output.id})
   for(const target of targets){
    const key=takeId+':'+target.role+':'+(target.exportId||'')
    if(memoryAnalysisJobs.has(key))continue
    try{
     const source=await recordings.analysisSource(takeId,target.role,undefined,target.exportId)
     if(exiting||managingLibrary||recordings.busy())return
     analyses.start(source);memoryAnalysisJobs.add(key)
    }catch(error){if(String(error).includes('ANALYSIS_QUEUE_FULL'))return;console.warn('MEMORY_ANALYSIS_UNAVAILABLE',error);memoryAnalysisJobs.add(key)}
   }
  }
 }finally{preparingMemoryAnalysis=false}
}
function syncAnalysisState(control:boolean):void{if(!analyses)return;const patch={analysisJobs:analyses.snapshots(),playback:playback?.view(),reference:references?.view()};if(control)update(patch);else{state={...state,...patch};emitState()}void prepareMemoryAnalyses()}
function releaseRecordingCapture():void{
  if(!recordingCaptureHeld||recordings.busy()||exiting)return
  try{
    if(!state.monitoringRequested){engine.stop();update({active:false,error:state.error?.startsWith('CAPTURE_RELEASE_FAILED:')?null:state.error})}
    recordingCaptureHeld=false
  }catch(error){const message='CAPTURE_RELEASE_FAILED: '+String(error);if(state.error!==message)update({error:message})}
}
function syncRecordingWork():void{
  if(!recordings)return
  releaseRecordingCapture()
  const blocked=recordings.busy()||managingLibrary||exiting
  analyses?.setRecordingBusy(blocked)
  reports?.setRecordingBusy(blocked)
  imports?.setRecordingBusy(blocked)
  references?.setRecordingBusy(blocked)
  if(exporter){if(blocked)void exporter.pauseForRecording();else exporter.resume()}
  if(deliveries){if(blocked)void deliveries.pause();else deliveries.resume()}
  if(retention){if(blocked)void retention.pause();else retention.resume()}
}
function syncRecordingState():void{
  if(!recordings)return
  syncRecordingWork()
  update({recordSettings:{...recordings.settings},recordDirectory:recordings.directory,currentRecord:recordings.activeSummary(),recordings:library?library.summaries():recordings.summaries()})
}
function syncExportState(control=true):void{if(!exporter||!recordings)return;const patch={exportJobs:exporter.views().map(decorateExport),recordings:library?library.summaries():recordings.summaries()};if(control)update(patch);else{state={...state,...patch};emitState()}retention?.schedule();deliveries?.observe();imports?.resume();void prepareMemoryAnalyses()}
function syncPlaybackState():void{if(playback){references?.observe(playback.view());update({playback:playback.view(),reference:references?.view()})}retention?.schedule()}
function syncRetentionState():void{if(recordings)update({recordings:library?library.summaries():recordings.summaries()})}
function referenceVisible(){return Boolean(!exiting&&!recordings?.busy()&&state.windowVisible!==false&&state.workspace&&!state.workspace.layout.hidden.includes('comparison'))}
function syncReferenceState(){if(references){state={...state,reference:references.view()};emitState();if(!recordings?.busy()&&!managingLibrary&&!exiting)retention?.resume()}}
function instrumentsVisible():boolean{const peer=references?.activeSlot?references.peer(references.activeSlot):undefined;return Boolean(state.workspace&&(['spectrum','soundfield'].some(id=>!state.workspace!.layout.hidden.includes(id as never))||referenceVisible()&&peer&&references.peer('b')&&peer.range.startFrame==='0'&&peer.range.endFrame===peer.source.frames))}
function publishLiveSample(snapshot:MeterSnapshot):void{
 const send=()=>{if(!window||window.isDestroyed()||exiting||playback.active())return;const key=[snapshot.sourceId,snapshot.epochId,snapshot.measurementEpoch,state.currentRecord?snapshot.recording?.id:''].join(':');const frame=BigInt(state.currentRecord?snapshot.recording?.writtenFrames||'0':snapshot.positionFrame);if(lastLivePublication?.key===key&&frame<lastLivePublication.frame)return;lastLivePublication={key,frame};snapshot.eventSequence=++snapshotSequence;snapshot.stateRevision=state.revision;sendRenderer('trace:snapshot',snapshot)}
 if(!instrumentsVisible()||snapshot.error){send();return}
 if(instrumentLiveBusy)return
 const settings=state.instrumentSettings||defaultInstrumentSettings,configKey=instrumentConfigKey(settings),record=snapshot.recording
 const recording=Boolean(state.currentRecord&&record?.id&&record.sourceFormat.sampleRate>0)
 const request=recording?{kind:'take' as const,sourceId:record!.id,epochId:'0',measurementEpoch:'0',sampleRate:record!.sourceFormat.sampleRate,positionFrame:record!.writtenFrames}:
  {kind:'live' as const,sourceId:snapshot.sourceId,epochId:snapshot.epochId,measurementEpoch:snapshot.measurementEpoch,sampleRate:snapshot.format.sampleRate,positionFrame:snapshot.positionFrame}
 instrumentLiveBusy=true
 void instruments.query(request,settings).then(packet=>{
  if(exiting||playback.active()||!instrumentsVisible()||configKey!==instrumentConfigKey(state.instrumentSettings||defaultInstrumentSettings)||state.deviceId!==snapshot.sourceId)return
  const now=engine.snapshot(5,1)
  if(now.epochId!==snapshot.epochId||now.measurementEpoch!==snapshot.measurementEpoch||Boolean(state.currentRecord)!==recording||(recording&&latestRecordingFrame.recording?.id!==record!.id))return
  snapshot.instruments=packet;send()
 }).catch(error=>console.error('TRACE_INSTRUMENT_DISPLAY',error)).finally(()=>{instrumentLiveBusy=false})
}
function publishInspectionSample():void{
  if(!window||window.isDestroyed()||!playback.active()||inspectionFailurePending)return
  const owner=playback.view()!
  void playback.sample().then(snapshot=>{
    const current=playback.view()
    if(!snapshot||!window||window.isDestroyed()||current?.id!==snapshot.sourceId||
      current.generation!==snapshot.playback.generation||current.startFrame!==snapshot.fileView.startFrame||
      current.endFrame!==snapshot.fileView.endFrame)return
    if(snapshot.instruments&&snapshot.instruments.configKey!==instrumentConfigKey(state.instrumentSettings||defaultInstrumentSettings))return
    references?.observe({...current,positionFrame:snapshot.positionFrame});if(referenceVisible())referenceSpectrum?.request(snapshot,state.instrumentSettings||defaultInstrumentSettings)
    sendRenderer('trace:snapshot',{...snapshot,...latestRecordingFrame,eventSequence:++snapshotSequence,stateRevision:state.revision})
    if(playback.outputActive()&&['ended','failed'].includes(current.phase)&&!finishingOutput){
      finishingOutput=true
      const id=current.id,generation=current.generation
      const finish=mutations.then(async()=>{
        const now=playback.view()
        if(now?.id===id&&now.generation===generation&&['ended','failed'].includes(now.phase)){await playback.pause(id);resumeInput()}
      }).catch(error=>update({error:String(error)})).finally(()=>{finishingOutput=false})
      mutations=finish
    }
  }).catch(error=>{
    inspectionFailurePending=true
    const handleFailure=mutations.then(async()=>{
      const current=playback.view()
      if(current?.id!==owner.id||current.generation!==owner.generation)return
      if(playback.outputActive())await playback.pause(owner.id)
      playback.fail('FILE_SNAPSHOT_FAILED: '+String(error));resumeInput()
    }).catch(failure=>update({error:String(failure)})).finally(()=>{inspectionFailurePending=false})
    mutations=handleFailure
  })
}
function preferencesPath():string{return join(app.getPath('userData'),'trace-settings.json')}
function savePreferences():void{
  if(!preferencesReady)return
  preferencesWriter??=new PreferencesWriter(preferencesPath(),error=>{const message=error?String(error):null;if((state.preferencesError||null)!==message)update({preferencesError:message})})
  preferencesWriter.save(JSON.stringify({instrumentTheme:state.instrumentTheme||defaultThemeId,instrumentThemeVersion,targetSettings:state.targetSettings,spectrogramSettings:state.spectrogramSettings,windowBounds:window&&!window.isDestroyed()?window.getNormalBounds():undefined,maximized:window?.isMaximized(),instrumentSettings:state.instrumentSettings,workspace:state.workspace,displaySettingsVersion,monitoringRequested:state.monitoringRequested,displaySettings:state.displaySettings,settingsVersion:recordSettingsVersion,deviceId:state.deviceId,windowSeconds:state.windowSeconds,recordSettings:recordings.settings,recordDirectory:recordings.directory,exportPreferencesVersion,lastExportPreset:state.lastExportPreset,confirmExitWhileRecording:state.confirmExitWhileRecording!==false,lastExportSaveCopy:state.lastExportSaveCopy===true}))
}
function schedulePreferences():void{if(preferencesTimer)clearTimeout(preferencesTimer);preferencesTimer=setTimeout(()=>{try{savePreferences()}catch(error){console.error("Trace preferences:",error)}},150)}
function startDevice(id:string):SourceFormat{
  const format=engine.start(id);lastPollError='';update({deviceId:id,active:true,error:null});savePreferences();return format
}
function resumeInput():void{
  if(!exiting&&!playback?.outputActive()&&state.monitoringRequested&&state.deviceId&&!engine.snapshot(5,1).active&&!recordings.busy())startDevice(state.deviceId)
}
async function resolveSpectrogram(q:SpectrogramQuery,settings:SpectrogramSettings):Promise<SpectrogramBinding>{
 const visible=()=>!exiting&&!managingLibrary&&state.windowVisible!==false&&!state.workspace?.layout.hidden.includes('spectrogram')
 if(!visible())throw new SpectrogramContextChanged()
 const configKey=(s:SpectrogramSettings)=>JSON.stringify([s.fftSize,s.channel,s.minFrequency,s.maxFrequency])
 const config=configKey(settings),stillConfigured=()=>visible()&&config===configKey(state.spectrogramSettings||defaultSpectrogramSettings)
 let source:import('./spectrogramSource').SpectrogramSource,toNative=(v:string)=>v,toAxis=(v:string)=>v,valid:()=>boolean
 if(q.source.kind==='file'){
  const view=playback.view()
  if(!view||view.id!==q.source.sourceId||q.source.analysisId!==undefined&&q.source.analysisId!==view.analysisId||q.source.epochId!=='0'||q.source.measurementEpoch!=='0')throw new SpectrogramContextChanged()
  const bound=playback.spectralSource(view.id)
  source=bound.replay?replaySpectrogramSource(bound.replay):fileSpectrogramSource(bound.source,bound.analysisKey||'pending:'+view.id)
  if(!bound.replay&&!bound.analysisKey)delete source.cacheRoot
  valid=()=>stillConfigured()&&playback.view()?.id===view.id&&playback.view()?.analysisId===view.analysisId
 }else{
  if(playback.active())throw new SpectrogramContextChanged()
  const snap=engine.snapshot(5,1)
  if(q.source.epochId!==snap.epochId||q.source.measurementEpoch!==snap.measurementEpoch)throw new SpectrogramContextChanged()
  if(snap.error)throw Error('SPECTROGRAM_SOURCE_UNAVAILABLE: '+snap.error)
  if(q.source.kind==='live'){
   if(state.currentRecord||snap.sourceId!==q.source.sourceId)throw new SpectrogramContextChanged()
   source=liveSpectrogramSource(snap)
   valid=()=>{if(!stillConfigured()||playback.active()||state.currentRecord)return false;const n=engine.snapshot(5,1);return n.sourceId===snap.sourceId&&n.epochId===snap.epochId&&n.measurementEpoch===snap.measurementEpoch}
  }else{
   if(state.currentRecord?.id!==q.source.sourceId)throw new SpectrogramContextChanged()
   const record=engine.recordStatus(),regions=recordings.session(q.source.sourceId).document.regions
   const region=regions.find(r=>r.nativeId===record.id)
   if(!region)throw new SpectrogramContextChanged()
   const data=regions.map(r=>r===region?{...r,frames:record.writtenFrames,startFrame:record.startFrame,endFrameExclusive:record.startFrame===null?null:String(BigInt(record.startFrame)+BigInt(record.writtenFrames))}:r)
   const timeline=new SessionTimeline(data),position=timeline.positions.find(p=>p.regionId===region.id)!
   toNative=value=>{const n=BigInt(value);if(n<=BigInt(position.mediaStartNs))return '0';if(n>=BigInt(position.mediaEndNs))return record.writtenFrames;return timeline.mediaNsToRegion(value)!.relativeFrame}
   toAxis=value=>timeline.frameToMediaNs(region.id,value)
   source=takeSpectrogramSource(record)
   valid=()=>{if(!stillConfigured()||playback.active()||state.currentRecord?.id!==q.source.sourceId)return false;const now=engine.recordStatus();return now.id===record.id&&now.phase==='recording'}
  }
 }
 const startFrame=toNative(q.range.startFrame),endFrame=toNative(q.range.endFrame),nyquist=source.request.sampleRate/2
 if(BigInt(endFrame)<=BigInt(startFrame)||BigInt(endFrame)>BigInt(source.availableEnd)&&source.request.kind==='file')throw Error('SPECTROGRAM_RANGE_UNAVAILABLE')
 return {source,toNative,toAxis,valid,range:{...q.range,startFrame,endFrame,minFrequency:Math.min(settings.minFrequency,nyquist*.9),maxFrequency:Math.min(settings.maxFrequency,nyquist)}}
}
async function closeInspection():Promise<void>{await playback.close();inspection=null;resumeInput()}
async function inspectHistory(payload:Record<string,unknown>):Promise<void>{
  const sourceKind=payload.sourceKind as string,sourceId=payload.sourceId as string
  const same=inspection&&playback.view()?.id===inspection.id&&inspection.sourceKind===sourceKind&&inspection.sourceId===sourceId&&inspection.epochId===payload.epochId&&inspection.measurementEpoch===payload.measurementEpoch
  if(!same){
    if(playback.active())throw Error('STALE_INSPECTION_SOURCE')
    const take=sourceKind==='take',current=engine.snapshot(5,1)
    if(take?recordings.activeSummary()?.id!==sourceId:current.sourceId!==sourceId||current.epochId!==payload.epochId||current.measurementEpoch!==payload.measurementEpoch)throw Error('STALE_INSPECTION_SOURCE')
    const info=engine.replayFreeze(take)
    let origin=BigInt(info.captureStartFrame),rate=info.sampleRate,label='系统声音 · 历史'
    if(take){
      const regions=recordings.session(sourceId).document.regions,index=regions.findIndex(r=>r.nativeId===info.sourceId)
      if(index<0)throw Error('STALE_INSPECTION_SOURCE')
      origin=BigInt(mediaDurationNs(regions.slice(0,index).map(r=>({frames:r.frames,sampleRate:r.format.sampleRate}))))+BigInt(info.originFrame)*1000000000n/BigInt(info.sampleRate)
      rate=1000000000;label='本次录音 · 第 '+(index+1)+' 段历史'
    }else if(info.sourceId!==sourceId||info.epochId!==payload.epochId||info.measurementEpoch!==payload.measurementEpoch)throw Error('STALE_INSPECTION_SOURCE')
    if(BigInt(payload.positionFrame as string)<origin){engine.replayRelease?.();throw Error('HISTORY_OUTSIDE_BUFFER')}
    await playback.openReplay(state.deviceId,info,Number(origin)/rate,label)
    inspection={id:playback.view()!.id,sourceKind,sourceId,epochId:payload.epochId as string,measurementEpoch:payload.measurementEpoch as string,origin,rate,total:BigInt(info.frames)}
  }
  const map=inspection!,view=playback.view()!
  const local=(value:unknown,strict=false)=>{
    const raw=BigInt(value as string)-map.origin
    if(strict&&raw<0n)throw Error('HISTORY_OUTSIDE_BUFFER')
    const n=raw*BigInt(view.sampleRate)/BigInt(map.rate)
    return (n<0n?0n:n>map.total?map.total:n).toString()
  }
  const position=local(payload.positionFrame,true),start=local(payload.startFrame),end=local(payload.endFrame)
  if(playback.outputActive()){await playback.pause(map.id);resumeInput()}
  playback.seek(map.id,position,false)
  if(BigInt(end)>BigInt(start))playback.window(map.id,start,end,900)
  if(payload.selectionEndFrame!==undefined)playback.selection(map.id,position,local(payload.selectionEndFrame,true),false)
}
function decorateExport(value:import('./exportTypes').ExportView){return imports?.has(value.takeId)?imports.exportView(value):library?library.exportView(value):value}
function syncImportState():void{if(imports){state={...state,imports:imports.views(),importIssues:imports.issues,...(exporter?{exportJobs:exporter.views().map(decorateExport)}:{})};emitState()}}
async function acceptImportFiles(paths:unknown):Promise<import('./shared').ImportFilesResult>{
 if(exiting)throw Error('APP_CLOSING')
 if(!Array.isArray(paths)||!paths.length||paths.length>4||paths.some(p=>typeof p!=='string'||!isAbsolute(p)||p.includes('\0')||p.length>32767))throw Error('INVALID_IMPORT_FILES')
 const result:import('./shared').ImportFilesResult={accepted:[],errors:[]}
 for(const path of paths as string[]){try{if(testMode){const actual=await realpathAsync(path);if(!actual.toLowerCase().startsWith((testRoot!+sep).toLowerCase()))throw Error('TEST_DIRECTORY_OUTSIDE_ARTIFACTS')}const id=await imports.add(path);result.accepted.push({id,name:basename(path)})}catch(error){result.errors.push({name:basename(path),message:String(error)})}}
 return result
}
async function activateReference(slot:ReferenceSlot,atStart=false):Promise<void>{
 if(recordings.busy()||managingLibrary)throw Error('RECORDING_ACTIVE')
 const plan=references.activation(slot,playback.view(),atStart),peer=references.peer(slot)!,manifest=analyses.reportInput(peer.analysisId).manifest
 if(playback.outputActive())await playback.pause(playback.view()!.id)
 const source=await assets.analysisSource(plan.ref.takeId,plan.ref.role,plan.ref.regionId,plan.ref.exportId)
 const hashes=await hashFiles(source.sources);if(source.frames!==plan.source.frames||source.sampleRate!==plan.source.sampleRate||source.mediaIdentity!==plan.source.mediaIdentity||JSON.stringify(hashes)!==JSON.stringify(manifest.sourceSha256)){await references.forgetTake(plan.ref.takeId,plan.ref.exportId);throw Error('REFERENCE_SOURCE_CHANGED')}
 if(references.version!==plan.version)throw Error('STALE_REFERENCE_SOURCE')
 inspection=null;await playback.open(source,state.deviceId);const file=playback.view()!
 if(plan.selection)playback.selection(file.id,plan.selection.startFrame,plan.selection.endFrame,plan.loop)
 playback.window(file.id,plan.window.startFrame,plan.window.endFrame,900);playback.volume(file.id,plan.gain);playback.seek(file.id,plan.positionFrame,false);playback.follow(file.id,plan.follow);references.activated(slot,playback.view()!)
 if(plan.resume){engine.stop();update({active:false,error:null});try{await playback.play(file.id)}catch(error){resumeInput();throw error}}else resumeInput()
}
async function updateReferenceSelection():Promise<void>{const file=playback.view(),slot=references?.activeSlot;if(slot&&file&&!file.temporary)await references.range(slot,file.selection||undefined,file.selection?file.selectionAnalysis?.id:file.analysisId)}
async function chooseImportFiles(single=false):Promise<string[]>{
 if(testMode&&process.env.TRACE_TEST_IMPORT_FILES){const paths=JSON.parse(process.env.TRACE_TEST_IMPORT_FILES) as string[];if(!Array.isArray(paths))throw Error('INVALID_TEST_IMPORT_FILES');return single?paths.slice(0,1):paths}
 const selected=await dialog.showOpenDialog(window!,{title:single?'重新定位原文件':'导入音频素材',properties:single?['openFile']:['openFile','multiSelections'],filters:[{name:'音频文件',extensions:['wav','mp3','m4a','aac']}]})
 return selected.canceled?[]:selected.filePaths
}
function makeReportInput(playbackId:string,scope:'whole'|'selection'):ReportInput{
 const c=playback.reportContext(playbackId,scope==='selection'),a=analyses.reportInput(c.analysisId),imported=imports.has(c.source.takeId)
 const notes:string[]=[];let integrity:import('./reportTypes').ReportSource['integrity']['state']='complete'
 if(imported)notes.push('外部文件的完整性表示文件读取与解码已校验，不声明其原始录制过程完整。')
 else{const doc=recordings.session(c.source.takeId).document,regions=c.source.regionId?doc.regions.filter(r=>r.id===c.source.regionId):doc.regions,continuity=c.source.continuity??sourceContinuity(doc,c.source.regionId)
 if(c.source.role!=='export'&&(doc.status==='recovered'||doc.status==='failed'||regions.some(r=>r.error||r.status==='interrupted'))){integrity='unknown';notes.push('录音经过恢复或包含中断，可用文件不代表原始采集全部完整。')}
 else if(continuity==='gaps'){integrity='gaps';notes.push('原录音包含多个采集区域或中断；当前文件按内容时间排列。')}
 else if(continuity==='unknown'){integrity='unknown';notes.push('原采集质量信息不足，不能确认录音完整。')}
 else if(continuity==='estimated-silence'){integrity='estimated';notes.push('原采集含估计静音或估计时钟边界。')}}
 return {playbackId,request:{version:1,source:{origin:imported?'imported':'recording',label:c.source.label,takeId:c.source.takeId,role:c.source.role,regionId:c.source.regionId,exportId:c.source.exportId,format:assetFormatLabel(c.source.assetFormat)||c.source.sampleRate+' Hz',sourceFrames:c.source.frames,scope:{kind:scope,...c.range},integrity:{state:integrity,notes},physicalRange:a.manifest.sourceRange},cacheDirectory:a.directory,cacheKey:a.manifest.cacheKey,sourceFiles:a.source.sources},retain:()=>{try{analyses.retain(c.analysisId);return()=>analyses.release(c.analysisId)}catch(error){if(!String(error).includes('UNKNOWN_ANALYSIS_JOB'))throw error;return()=>{}}}}
}
async function chooseDirectory():Promise<boolean>{
  if(recordings.busy())throw Error('RECORDING_ACTIVE')
  if(exporter?.busy()||deliveries?.busy()||retention?.active())throw Error('EXPORT_ACTIVE')
  const result=await dialog.showOpenDialog(window!,{title:'选择录音保存目录',properties:['openDirectory','createDirectory']})
  if(result.canceled||!result.filePaths[0])return false
  managingLibrary=true
  try{
    await retention.pause();await deliveries.pause();await analyses.pauseForRecording();await recordings.settled()
    if(exporter.busy())throw Error('EXPORT_ACTIVE')
    if(playback.active()&&!playback.view()?.temporary&&!imports.has(playback.view()!.takeId))await closeInspection()
    for(const take of recordings.sessions()){await references.forgetTake(take.document.sessionId);await reports.forgetTake(take.document.sessionId);await analyses.forgetTake(take.document.sessionId);retention.forget(take.document.sessionId);deliveries.forgetTake(take.document.sessionId)}
    await recordings.setDirectory(result.filePaths[0]);update({recordDirectoryError:null});savePreferences();return true
  }finally{managingLibrary=false;syncRecordingState();resumeInput()}
}
async function dispatch(request:Request):Promise<Reply>{
  try{
    if(isMutation(request.command)&&request.expectedStateRevision!==state.revision)throw Error('STALE_REQUEST')
    if(testMode&&isMutation(request.command))console.log('TRACE_CONTROL',JSON.stringify({command:request.command,revision:state.revision,at:new Date().toISOString()}))
    let data:unknown=null
    switch(request.command){
      case 'reference.set':{const source=request.payload as ExportSource;const session=assets.session(source.takeId);await retention.pause();
       // Resuming unconditionally would let source hashing and deletion run
       // during a recording; match the rule applied in syncRetentionState.
       try{references.setReference(source,session.document.name)}finally{if(!recordings.busy()&&!managingLibrary&&!exiting)retention.resume()}
       const workspace=state.workspace!;if(workspace.layout.hidden.includes('comparison'))update({workspace:{...workspace,activePreset:null,layout:{...workspace.layout,hidden:workspace.layout.hidden.filter(id=>id!=='comparison')}}});savePreferences();break}
      case 'reference.clear':{await references.clearReference();const file=playback.view();if(file&&!file.temporary)await references.bindPrimary(playback.spectralSource(file.id).source,file);break}
      case 'reference.activate':await activateReference(request.payload.slot as ReferenceSlot,request.payload.atStart===true);break
      case 'reference.configure':references.configure(request.payload.offsetNs as string,request.payload.linked as boolean);await referenceSpectrum.cancel();break
      case 'reference.retry':await imports.refresh();await references.retry();break
      case 'reference.range':{const slot=request.payload.slot as ReferenceSlot,range={startFrame:request.payload.startFrame as string,endFrame:request.payload.endFrame as string},peer=references.peer(slot);if(!peer)throw Error('REFERENCE_SOURCE_MISSING');await references.range(slot,range);const file=playback.view();if(references.activeSlot===slot&&file){if(range.startFrame==='0'&&range.endFrame===peer.source.frames)playback.clearSelection(file.id);else playback.selection(file.id,range.startFrame,range.endFrame,false)}break}
      case 'imports.choose':{const paths=await chooseImportFiles();data=paths.length?await acceptImportFiles(paths):{accepted:[],errors:[]};break}
      case 'imports.refresh':await imports.refresh();syncImportState();break
      case 'imports.cancel':imports.cancel(request.payload.assetId as string);break
      case 'imports.prepare':imports.prepare(request.payload.assetId as string,request.payload.acceptChanged as boolean);break
      case 'imports.clearCache':await imports.clearCache(request.payload.assetId as string);break
      case 'imports.remove':deliveries.forgetTake(request.payload.assetId as string);await imports.remove(request.payload.assetId as string);break
      case 'imports.removeExport':{const id=request.payload.assetId as string,exportId=request.payload.exportId as string;const answer=await dialog.showMessageBox(window!,{type:'warning',title:'移除生成的成品',message:imports.session(id).document.name,detail:'该成品及其缓存将移入回收站；外部原文件保留。',buttons:['取消','移除成品'],defaultId:0,cancelId:0,noLink:true});if(answer.response===1){deliveries.forgetTake(id,exportId);await imports.removeExport(id,exportId,path=>shell.trashItem(path))}break}
      case 'imports.rename':{const id=request.payload.assetId as string,old=imports.session(id).document.name;await imports.rename(id,request.payload.name as string);playback.renameTake(id,old,imports.session(id).document.name);break}
      case 'imports.relocate':{const paths=await chooseImportFiles(true);if(paths[0]){if(testMode&&!(await realpathAsync(paths[0])).toLowerCase().startsWith((testRoot!+sep).toLowerCase()))throw Error('TEST_DIRECTORY_OUTSIDE_ARTIFACTS');await imports.relocate(request.payload.assetId as string,paths[0])}break}
      case 'imports.openSource':shell.showItemInFolder(imports.sourceFile(request.payload.assetId as string));break
      case 'imports.openFolder':{const message=await shell.openPath(imports.folder(request.payload.assetId as string));if(message)throw Error(message);break}
      case 'imports.openRoot':{const message=await shell.openPath(imports.store.root);if(message)throw Error(message);break}
      case 'app.configure':update({confirmExitWhileRecording:request.payload.confirmExitWhileRecording as boolean});savePreferences();break
      case 'app.diagnostics':data=safeDiagnostics(product.version,state,engine.snapshot(5,1),engine.recordStatus());break
      case 'app.copyDiagnostics':clipboard.writeText(JSON.stringify(await supportRuntime!.report(),null,2));data={copied:true};break
      case 'app.exportDiagnostics':data=await supportRuntime!.export(window);break
      case 'app.feedback':data=await supportRuntime!.feedback();break
      case 'app.rendererFault':supportRuntime?.record(('renderer-'+request.payload.kind) as 'renderer-react'|'renderer-script'|'renderer-promise');data={recording:Boolean(state.currentRecord)};break
      case 'app.reloadUI':if(window)setTimeout(()=>{if(window&&!window.isDestroyed())supportRuntime?.reload(window)},50);break
      case 'support.testFault':{
        if(!testMode)throw Error('TEST_ONLY')
        if(request.payload.kind==='renderer')setTimeout(()=>window?.webContents.forcefullyCrashRenderer(),50)
        else if(request.payload.kind==='main')setTimeout(()=>{throw Error('TEST_ONLY_MAIN_FAILURE')},50)
        else {await hashFiles([join(testRoot!,'missing-test-file.wav')]).catch(()=>{});data={tested:true}}
        break
      }
      case 'test.window':if(!testMode||!window)throw Error('TEST_ONLY');if(request.payload.mode==='show')window.show();else if(request.payload.mode==='hide')window.hide();else if(request.payload.mode==='minimize')window.minimize();else{window.restore();window.show()}break
      case 'spectrogram.configure':update({spectrogramSettings:validateSpectrogramSettings(request.payload.settings)});schedulePreferences();break
      case 'spectrogram.query':spectrogram.request(request.requestId,validateSpectrogramQuery(request.payload),state.spectrogramSettings||defaultSpectrogramSettings);data={accepted:true};break
      case 'spectrogram.point':data=await spectrogram.point(request.payload.queryId as string,request.payload.positionFrame as string,request.payload.frequency as number);break
      case 'spectrogram.cancel':spectrogram.cancel(request.payload.queryId as string);break
      case 'targets.configure':{
        const targetSettings=validateTargetSettings(request.payload.settings);update({targetSettings,displaySettings:{...(state.displaySettings||defaultDisplaySettings),targetEnabled:targetSettings.enabled&&targetSettings.integrated!==null,targetLufs:targetSettings.integrated?.target??state.displaySettings?.targetLufs??-23}});savePreferences();break
      }
      case 'report.prepare':{
        if(recordings.busy()||managingLibrary)throw Error('RECORDING_ACTIVE')
        await retention.pause();const input=makeReportInput(request.payload.playbackId as string,request.payload.scope as 'whole'|'selection')
        data={reportId:await reports.start(input,state.targetSettings||defaultTargetSettings)};retention.resume();break
      }
      case 'report.get':data=reports.result(request.payload.reportId as string);break
      case 'report.cancel':reports.cancel(request.payload.reportId as string);break
      case 'report.retry':if(recordings.busy()||managingLibrary)throw Error('RECORDING_ACTIVE');await retention.pause();data={reportId:await reports.retry(request.payload.reportId as string,state.targetSettings||defaultTargetSettings)};retention.resume();break
      case 'report.open':{const error=await shell.openPath(reports.file(request.payload.reportId as string));if(error)throw Error('OPEN_REPORT_FAILED: '+error);break}
      case 'report.jump':{
        if(recordings.busy()||managingLibrary)throw Error('RECORDING_ACTIVE')
        const report=reports.result(request.payload.reportId as string),file=playback.view(),event=report.eventPreview[request.payload.index as number]
        if(!file||!event||file.takeId!==report.source.takeId||file.role!==report.source.role||file.regionId!==report.source.regionId||file.exportId!==report.source.exportId)throw Error('REPORT_SOURCE_NOT_OPEN')
        const current=analyses.reportInput(file.analysisId);if(JSON.stringify(current.manifest.sourceSha256)!==JSON.stringify(report.analysis.sourceSha256))throw Error('REPORT_SOURCE_CHANGED')
        if(playback.outputActive())await playback.pause(file.id)
        playback.seek(file.id,event.startFrame,false);resumeInput();publishInspectionSample();break
      }
      case 'report.export':{
        if(recordings.busy()||managingLibrary)throw Error('RECORDING_ACTIVE')
        reports.assertExportable(request.payload.reportId as string)
        let directory:string|undefined
        if(testMode&&process.env.TRACE_TEST_REPORT_DEST){const candidate=resolve(process.env.TRACE_TEST_REPORT_DEST);if(!candidate.toLowerCase().startsWith((testRoot!+sep).toLowerCase()))throw Error('TEST_DIRECTORY_OUTSIDE_ARTIFACTS');mkdirSync(candidate,{recursive:true});directory=candidate}
        else{const result=await dialog.showOpenDialog(window!,{title:'导出测量报告',properties:['openDirectory','createDirectory']});if(!result.canceled)directory=result.filePaths[0]}
        if(directory){void reports.export(request.payload.reportId as string,directory).catch(()=>{});data={accepted:true}}else data={cancelled:true}
        break
      }
      case 'preferences.retry':savePreferences();await preferencesWriter?.flush();break
      case 'app.info':data={...product,captureStatus:testMode?(()=>{const s=engine.snapshot(5,1);return {active:s.active,positionFrame:s.positionFrame,epochId:s.epochId,diagnostics:s.diagnostics,error:s.error}})():undefined,nativeAnalysisQueue:testMode?nativeAnalysisQueue.usage:undefined,reportUsage:testMode?reports?.diagnostics:undefined,preferencesWrites:testMode?preferencesWriter?.stats:undefined,spectrogramUsage:testMode?spectrogram?.usage:undefined,processMetrics:testMode?app.getAppMetrics().map(({pid,type,cpu,memory})=>({pid,type,cpu,memory})):undefined,packaged:app.isPackaged,appVersion:app.getVersion(),electron:process.versions.electron,nativeModules:engine.runtimeModules(),resourcesPath:process.resourcesPath,userData:app.getPath('userData'),windowVisible:window?.isVisible()&&!window?.isMinimized(),windowBounds:window?.getBounds(),displays:screen.getAllDisplays().map(d=>({id:d.id,scaleFactor:d.scaleFactor,bounds:d.bounds,workArea:d.workArea}))};break
      case 'record.capacity':{
        const snapshot=engine.snapshot(5,1),format=snapshot.active&&snapshot.sourceId===state.deviceId?snapshot.format:engine.devices().find(d=>d.id===state.deviceId)?.format||snapshot.format
        update({recordingCapacity:{...recordingCapacity(await freeSpace(recordings.directory),recordings.settings,format.sampleRate,format.channelCount),directory:recordings.directory}});break
      }
      case 'export.configure':update({lastExportPreset:validateExportPreset(request.payload)});schedulePreferences();break
      case 'export.describe':{
        const s=await assets.analysisSource(request.payload.takeId as string,request.payload.role as import('./shared').AnalysisRole,request.payload.regionId as string|undefined,request.payload.exportId as string|undefined)
        data={label:s.label,frames:s.frames,sampleRate:s.sampleRate,assetFormat:s.assetFormat};break
      }
      case 'library.storage':data=await library.usage();break
      case 'library.clearCache':{
        if(recordings.busy()||exporter.busy()||deliveries.busy())throw Error('LIBRARY_BUSY')
        const takeId=request.payload.takeId as string,item=await library.describe(takeId)
        const testCacheConfirmation=testMode&&process.env.TRACE_TEST_CONFIRM_CACHE_CLEAR==='1'&&recordings.session(takeId).directory.toLowerCase().startsWith((testRoot!+sep).toLowerCase())
        const answer=testCacheConfirmation?{response:1}:await dialog.showMessageBox(window!,{type:'question',title:'清理缓存',message:item.name,detail:'清理该录音可重建的分析与解码缓存，录音和成品音频保留。再次查看时会重新准备。',buttons:['取消','清理缓存'],defaultId:0,cancelId:0,noLink:true})
        if(answer.response!==1)break
        managingLibrary=true
        try{await retention.pause();await analyses.pauseForRecording();await recordings.settled();if(playback.view()?.takeId===takeId)await closeInspection();await references.forgetTake(takeId);await reports.forgetTake(takeId);await analyses.forgetTake(takeId);data=await library.clearCache(takeId)}
        finally{managingLibrary=false;syncRecordingState();resumeInput()}
        break
      }
      case 'library.pruneMissing':{
        if(recordings.busy()||exporter.busy()||deliveries.busy())throw Error('LIBRARY_BUSY')
        const items=await library.missingEntries();if(!items.length){data={removed:0};break}
        const answer=await dialog.showMessageBox(window!,{type:'warning',title:'清理失效记录',message:'清理 '+items.length+' 条失效记录？',detail:'仅清理目录已不存在的录音，以及全部成品音频已不存在的导出。剩余成品缓存移至回收站；可用原始录音保留。\n\n'+items.slice(0,10).map(i=>i.name).join('\n'),buttons:['取消','清理记录'],defaultId:0,cancelId:0,noLink:true})
        if(answer.response!==1)break
        managingLibrary=true
        try{
          await retention.pause();await analyses.pauseForRecording();await recordings.settled()
          const current=await library.missingEntries();let removed=0
          for(const item of items){if(!current.some(i=>i.takeId===item.takeId&&i.exportId===item.exportId))continue
            const viewing=playback.view();if(viewing?.takeId===item.takeId&&(!item.exportId||viewing.exportId===item.exportId))await closeInspection()
            deliveries.forgetTake(item.takeId,item.exportId);await references.forgetTake(item.takeId,item.exportId);await reports.forgetTake(item.takeId);await analyses.forgetTake(item.takeId,item.exportId);retention.forget(item.takeId);await library.remove(item.takeId,item.exportId);removed++}
          data={removed}
        }finally{managingLibrary=false;syncRecordingState();resumeInput()}
        break
      }
      case 'library.rename':{const takeId=request.payload.takeId as string,result=await library.rename(takeId,request.payload.name);playback.renameTake(takeId,result.oldName,result.name);break}
      case 'library.refresh':await library.refresh();break
      case 'library.remove':{
        if(recordings.busy()||exporter.busy()||deliveries.busy())throw Error('LIBRARY_BUSY')
        const takeId=request.payload.takeId as string,exportId=request.payload.exportId as string|undefined
        const item=await library.describe(takeId,exportId)
        const answer=await dialog.showMessageBox(window!,{type:'warning',title:exportId?'移除成品':'移除录音',message:item.name,
          detail:item.missing?'磁盘目录已不存在，仅清理失效列表记录。':exportId?'将该成品及其回听缓存移至回收站，原始录音保留。':'将此录音、全部成品和缓存一起移至回收站。正在回听该项目时会先关闭回听。',
          buttons:['取消',item.missing?'清理记录':'移至回收站'],defaultId:0,cancelId:0,noLink:true})
        if(answer.response!==1)break
        managingLibrary=true
        const playing=playback.view(),closeFile=playing?.takeId===takeId&&(!exportId||playing.exportId===exportId)
        try{
          await retention.pause();await recordings.settled()
          if(exporter.busy())throw Error('LIBRARY_BUSY')
          if(closeFile)await playback.close()
          deliveries.forgetTake(takeId,exportId);await references.forgetTake(takeId,exportId);await reports.forgetTake(takeId);await analyses.forgetTake(takeId,exportId);retention.forget(takeId)
          await library.remove(takeId,exportId)
        }finally{
          managingLibrary=false;syncRecordingState()
          if(closeFile)resumeInput()
        }
        break
      }
      case 'app.quit':setTimeout(()=>app.quit(),0);break
      case 'state.get':break
      case 'devices.list':data=engine.devices();break
      case 'devices.select':{
        if(playback.outputActive())throw Error('PLAYBACK_ACTIVE')
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        const id=request.payload.deviceId as string,device=engine.devices().find(d=>d.id===id&&d.supported)
        if(!device)throw Error('DEVICE_UNAVAILABLE')
        if(state.monitoringRequested)data=startDevice(id)
        else{update({deviceId:id,active:false,error:null});savePreferences()}
        playback.setOutputDevice(id)
        break
      }
      case 'live.start':
        if(playback.outputActive())throw Error('PLAYBACK_ACTIVE')
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        update({monitoringRequested:true})
        if(!state.active||state.deviceId!==request.payload.deviceId||state.error)data=startDevice(request.payload.deviceId as string)
        break
      case 'view.inspect':await inspectHistory(request.payload);break
      case 'view.live':
        if(playback.active())await closeInspection()
        if(!recordings.busy()&&!state.active&&state.deviceId){update({monitoringRequested:true});startDevice(state.deviceId)}
        break
      case 'live.replay':
        if(playback.active())throw Error('INSPECTION_ACTIVE')
        if(engine.snapshot(5,1).sourceId!==state.deviceId)throw Error('REPLAY_EMPTY')
        await playback.openReplay(state.deviceId);break
      case 'live.stop':
        if(playback.outputActive())throw Error('PLAYBACK_ACTIVE')
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        engine.stop();update({active:false,monitoringRequested:false,error:null});savePreferences()
        break
      case 'live.reset':
        if(playback.outputActive())throw Error('PLAYBACK_ACTIVE')
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        if(!state.active)throw Error('INVALID_STATE')
        engine.reset();update({error:null});break
      case 'retention.retry':await retention.retry(request.payload.takeId as string);break
      case 'instrument.configure':update({instrumentSettings:validateInstrumentSettings(request.payload.settings)});savePreferences();break
      case 'workspace.configure':update({workspace:validateWorkspace(request.payload.workspace)});if(state.workspace!.layout.hidden.includes('spectrogram'))spectrogram.cancel();if(state.workspace!.layout.hidden.includes('comparison'))await referenceSpectrum.cancel();savePreferences();break
      case 'view.settings':update({displaySettings:validateDisplaySettings(request.payload)});savePreferences();break
      case 'view.gain':update({displaySettings:{...(state.displaySettings||defaultDisplaySettings),waveGain:request.payload.gain as number}});schedulePreferences();break
      case 'view.theme':update({instrumentTheme:request.payload.theme as ThemeId});savePreferences();break
      case 'view.window':
        update({windowSeconds:request.payload.seconds as number});schedulePreferences();break
      case 'record.configure':
        recordings.configure(request.payload);savePreferences();break
      case 'record.chooseDirectory':data=await chooseDirectory();break
      case 'cache.save':{
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        const replay=playback.replayForSave(request.payload.playbackId as string,request.payload.useSelection as boolean)
        if(!recordings.directory&&!(await chooseDirectory())){data={cancelled:true};break}
        try{await retention.pause();await deliveries.pause();await exporter.pauseForRecording();await analyses.pauseForRecording()
        const saved=await recordings.saveReplay(replay.info,replay.range);memoryAnalysisTakes.add(saved.takeId);data=saved;void prepareMemoryAnalyses()}
        finally{syncRecordingState()}
        break
      }
      case 'record.start':
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        if(!state.deviceId)throw Error('DEVICE_UNAVAILABLE')
        if(!recordings.directory&&!(await chooseDirectory()))break
        if(playback.active()){await playback.close();inspection=null}
        try{await retention.pause();await deliveries.pause();await exporter.pauseForRecording();await analyses.pauseForRecording()
        recordingCaptureHeld=true
        if(!engine.snapshot(5,1).active||state.error)startDevice(state.deviceId)
        await recordings.start(engine.snapshot(10,1).format,{deviceId:state.deviceId,captureEpochId:captureInstance+':'+engine.snapshot(10,1).epochId})}
        finally{syncRecordingWork()}break
      case 'record.stop':spectrogram.cancel();data=await recordings.stop();releaseRecordingCapture();break
      case 'file.open':{
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        await retention.pause();try{const source=await assets.analysisSource(request.payload.takeId as string,request.payload.role as import('./shared').AnalysisRole,request.payload.regionId as string|undefined,request.payload.exportId as string|undefined)
        if(playback.outputActive())await playback.pause(playback.view()!.id)
        inspection=null;resumeInput();await playback.open(source,state.deviceId);await references.bindPrimary(source,playback.view()!)}finally{retention.resume()}break
      }
      case 'file.close':
        if(!playback.active())throw Error('FILE_MODE_NOT_ACTIVE')
        await closeInspection();break
      case 'playback.play':
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        if(playback.view()?.id!==request.payload.playbackId)throw Error('STALE_PLAYBACK_SOURCE')
        engine.stop();update({active:false,error:null})
        try{await playback.play(request.payload.playbackId as string)}catch(error){resumeInput();throw error}
        break
      case 'playback.pause':
        await playback.pause(request.payload.playbackId as string);resumeInput();break
      case 'playback.seek':
        if(playback.outputActive())await playback.pause(request.payload.playbackId as string)
        playback.seek(request.payload.playbackId as string,request.payload.positionFrame as string,false);resumeInput();break
      case 'playback.volume':playback.volume(request.payload.playbackId as string,request.payload.gain as number);break
      case 'playback.clearSelection':playback.clearSelection(request.payload.playbackId as string);await updateReferenceSelection();break
      case 'playback.retryAnalysis':
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        if(playback.view()?.id!==request.payload.playbackId)throw Error('STALE_PLAYBACK_SOURCE')
        if(playback.outputActive()){await playback.pause(request.payload.playbackId as string);resumeInput()}
        playback.retryAnalysis(request.payload.playbackId as string);break
      case 'playback.selection':playback.selection(request.payload.playbackId as string,request.payload.startFrame as string,request.payload.endFrame as string,request.payload.loop as boolean);await updateReferenceSelection();break
      case 'playback.follow':playback.follow(request.payload.playbackId as string,request.payload.enabled as boolean);break
      case 'playback.window':playback.window(request.payload.playbackId as string,request.payload.startFrame as string,request.payload.endFrame as string,request.payload.pixelWidth as number);break
      case 'export.start':{
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        const source:ExportSource={takeId:request.payload.takeId as string,role:request.payload.role as ExportSource['role'],
          regionId:request.payload.regionId as string|undefined,exportId:request.payload.exportId as string|undefined,range:request.payload.range as ExportSource['range']}
        if(imports.has(source.takeId)&&imports.preparing(source.takeId))throw Error('IMPORT_SOURCE_BUSY')
        const preset=validateExportPreset(request.payload.preset);update({lastExportSaveCopy:request.payload.saveCopy===true});savePreferences()
        let directory:string|undefined
        if(request.payload.saveCopy){const selected=await dialog.showOpenDialog(window!,{title:'选择导出成品的另存目录',properties:['openDirectory','createDirectory']});if(selected.canceled||!selected.filePaths[0]){data={cancelled:true};break}directory=selected.filePaths[0]}
        const jobId=await exporter.start(source,preset);if(directory)await deliveries.plan(jobId,directory);data={jobId};break
      }
      case 'export.retry':await exporter.retry(request.payload.exportId as string);break
      case 'export.saveCopy':{
        if(recordings.busy()||deliveries.busy())throw Error('LIBRARY_BUSY')
        const id=request.payload.exportId as string,info=exporter.saveInfo(id)
        if(info.multiple){
          const result=await dialog.showOpenDialog(window!,{title:'选择分段 WAV 的另存目录',properties:['openDirectory','createDirectory']})
          if(!result.canceled&&result.filePaths[0]){await exporter.saveCopy(id,result.filePaths[0]);await deliveries.markManual(id,result.filePaths[0],true)}
        }else{
          const result=await dialog.showSaveDialog(window!,{title:'另存导出成品',defaultPath:info.name,filters:[{name:info.extension.toUpperCase(),extensions:[info.extension]}]})
          if(!result.canceled&&result.filePath){await exporter.saveCopy(id,result.filePath);await deliveries.markManual(id,result.filePath,false)}
        }
        break
      }
      case 'export.openDeliveryFolder':{const error=await shell.openPath(await deliveries.folder(request.payload.exportId as string));if(error)throw Error('OPEN_FOLDER_FAILED: '+error);break}
      case 'export.openFolder':{
        const error=await shell.openPath(exporter.folder(request.payload.exportId as string));if(error)throw Error('OPEN_FOLDER_FAILED: '+error);break
      }
      case 'analysis.start':
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        {const source=await assets.analysisSource(request.payload.takeId as string,request.payload.role as import('./shared').AnalysisRole,request.payload.regionId as string|undefined,request.payload.exportId as string|undefined)
        const jobId=analyses.start(source);playback.useAnalysis(source,jobId);data={jobId}};break
      case 'job.cancel':if(exporter.owns(request.payload.jobId as string))exporter.cancel(request.payload.jobId as string);else analyses.cancel(request.payload.jobId as string);break
      case 'metrics.query':data={analysisId:request.payload.analysisId,requestGeneration:request.payload.requestGeneration,metrics:await analyses.metrics(request.payload.analysisId as string,request.payload.positionFrame as string)};break
      case 'timeline.query':data={analysisId:request.payload.analysisId,requestGeneration:request.payload.requestGeneration,...await analyses.timeline(request.payload.analysisId as string,request.payload.startFrame as string,request.payload.endFrame as string,request.payload.pixelWidth as number)};break
      case 'record.recover':await recordings.recover(request.payload.takeId as string);break
      case 'record.openFolder':{
        const error=await shell.openPath(recordings.folder(request.payload.takeId as string))
        if(error)throw Error('OPEN_FOLDER_FAILED: '+error)
        break
      }
    }
    if(request.command==='playback.seek'||request.command==='view.inspect')publishInspectionSample()
    return {requestId:request.requestId,ok:true,state:{...state},data}
  }catch(error){
    const message=error instanceof Error?error.message:String(error)
    if(imports?.has(request.payload.takeId as string)&&['file.open','analysis.start','export.describe','export.start'].includes(request.command)){const viewed=playback.view();if(request.command==='file.open'&&viewed&&viewed.takeId===request.payload.takeId&&viewed.role===request.payload.role&&viewed.exportId===request.payload.exportId)await closeInspection().catch(()=>{});return {requestId:request.requestId,ok:false,state:{...state},error:{code:message.split(':')[0],message}}}
    if(request.command.startsWith('reference.')){resumeInput();return {requestId:request.requestId,ok:false,state:{...state,reference:references.view()},error:{code:message.split(':')[0],message}}}
    if(request.command.startsWith('imports.'))return {requestId:request.requestId,ok:false,state:{...state},error:{code:message.split(':')[0],message}}
    if(request.command.startsWith('report.')){if(!recordings.busy()&&!managingLibrary&&!exiting)retention?.resume();return {requestId:request.requestId,ok:false,state:{...state},error:{code:message.split(':')[0],message}}}
    if(request.command.startsWith('spectrogram.')||request.command==='preferences.retry')return {requestId:request.requestId,ok:false,state:{...state},error:{code:message.split(':')[0],message}}
    syncRecordingWork()
    if(engine&&!engine.snapshot(10,1).active&&state.active)update({active:false,error:message})
    return {requestId:request.requestId,ok:false,state:{...state},error:{code:message.split(':')[0],message}}
  }
}
function handle(event:Electron.IpcMainInvokeEvent,raw:unknown):Promise<Reply>|Reply{
  let requestId=''
  try{
    if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('UNTRUSTED_FRAME')
    const request=validateRequest(raw);requestId=request.requestId
    const signature=JSON.stringify(request),old=completed.get(requestId),running=pending.get(requestId)
    if(old){if(old.signature!==signature)throw Error('REQUEST_ID_CONFLICT');return old.reply}
    if(running){if(running.signature!==signature)throw Error('REQUEST_ID_CONFLICT');return running.promise}
    const operation=isMutation(request.command)?mutations.then(()=>dispatch(request)):dispatch(request)
    if(isMutation(request.command))mutations=operation.then(()=>undefined,()=>undefined)
    const promise=operation.then(reply=>{
      if(!reply.ok&&reply.error?.code!=='STALE_REQUEST'&&!request.command.startsWith('spectrogram.'))supportRuntime?.record('command-failed')
      if((!request.command.startsWith('spectrogram.')&&!request.command.startsWith('report.')&&!request.command.startsWith('imports.'))||isMutation(request.command))completed.set(requestId,{signature,reply});pending.delete(requestId)
      if(completed.size>256)completed.delete(completed.keys().next().value as string)
      return reply
    })
    pending.set(requestId,{signature,promise});return promise
  }catch(error){
    const message=error instanceof Error?error.message:String(error)
    return {requestId,ok:false,state:{...state},error:{code:message.split(':')[0],message}}
  }
}
async function initialize():Promise<void>{
  let preferred:{instrumentTheme?:unknown;targetSettings?:unknown;spectrogramSettings?:unknown;instrumentSettings?:unknown;workspace?:unknown;monitoringRequested?:boolean;deviceId?:string;windowSeconds?:number;recordSettings?:unknown;recordDirectory?:string;displaySettings?:unknown;lastExportPreset?:unknown;confirmExitWhileRecording?:boolean;lastExportSaveCopy?:boolean}={}
  try{preferred=JSON.parse(readFileSync(preferencesPath(),'utf8'))}catch{}
  if(validWindowSeconds(preferred.windowSeconds))state.windowSeconds=preferred.windowSeconds
  state.instrumentTheme=restoreInstrumentTheme(preferred.instrumentTheme)
  state.instrumentSettings=restoreInstrumentSettings(preferred.instrumentSettings)
  state.spectrogramSettings=restoreSpectrogramSettings(preferred.spectrogramSettings)
  state.workspace=restoreWorkspace(preferred.workspace)
  state.monitoringRequested=preferred.monitoringRequested!==false
  state.confirmExitWhileRecording=preferred.confirmExitWhileRecording!==false
  state.lastExportSaveCopy=preferred.lastExportSaveCopy===true
  try{if(preferred.displaySettings)state.displaySettings=restoreDisplaySettings(preferred.displaySettings)}catch{}
  try{if(preferred.recordSettings)recordings.configure(preferred.recordSettings)}catch{}
  try{if(preferred.lastExportPreset)state.lastExportPreset=validateExportPreset(preferred.lastExportPreset)}catch{}
  state.targetSettings=restoreTargetSettings(preferred.targetSettings,state.displaySettings)
  await reports.initialize()
  await imports.initialize()
  importWatchTimer=setInterval(()=>{if(!exiting)void imports.refresh().catch(error=>console.error('TRACE_IMPORT_REFRESH',String(error)))},5000)
  if(testMode&&process.env.TRACE_RECORD_TEST_DIR){
    const target=resolve(process.env.TRACE_RECORD_TEST_DIR)
    if(!target.toLowerCase().startsWith((testRoot!+sep).toLowerCase()))throw Error('TEST_DIRECTORY_OUTSIDE_ARTIFACTS')
    mkdirSync(target,{recursive:true});await recordings.setDirectory(target)
  }else if(preferred.recordDirectory){try{await recordings.setDirectory(preferred.recordDirectory)}catch{update({recordDirectoryError:'SAVE_DIRECTORY_UNAVAILABLE'})}}
  syncRecordingState();await library.refresh()
  preferencesReady=true
  const devices=engine.devices()
  const device=devices.find(d=>d.id===preferred.deviceId&&d.supported)||devices.find(d=>d.isDefault&&d.supported)
  if(device){if(state.monitoringRequested)startDevice(device.id);else update({deviceId:device.id,active:false,error:null})}else update({error:'没有可用的单声道或双声道播放设备。'})
}
app.whenReady().then(async()=>{
  supportRuntime=await SupportRuntime.create(product.version,__filename,()=>state,diagnosticSnapshot,()=>{if(supportRuntime){state={...state,support:supportRuntime.status};emitState()}},testRoot)
  state={...state,support:supportRuntime.status}
  if(testMode&&process.env.TRACE_TEST_STARTUP_FAILURE==='1')throw Error('TEST_ONLY_STARTUP_FAILURE')
  engine=requireNative(app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node')) as NativeEngine
  const ffroot=app.isPackaged?join(process.resourcesPath,'ffmpeg'):join(root,'.tools/ffmpeg/bin')
  const segment=testMode&&process.env.TRACE_TEST_SEGMENT_BYTES?Number(process.env.TRACE_TEST_SEGMENT_BYTES):2147483648
  recordings=new RecordingService(engine,join(ffroot,'ffmpeg.exe'),join(ffroot,'ffprobe.exe'),app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),syncRecordingState,segment)
  analyses=new AnalysisService(app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),syncAnalysisState)
  const analysisNative:InstrumentNative&SpectrogramNative={instrumentAnalyze:request=>nativeAnalysisQueue.run(()=>engine.instrumentAnalyze(request),String(request.identity||'').startsWith('reference:')?1:0),spectrogramTile:request=>nativeAnalysisQueue.run(()=>engine.spectrogramTile(request))}
  instruments=new InstrumentService(analysisNative)
  spectrogram=new SpectrogramPresenter(analysisNative,resolveSpectrogram,packet=>{if(window&&!window.isDestroyed())sendRenderer('trace:spectrogram',packet)})
  playback=new PlaybackService(engine,analyses,syncPlaybackState)
  reports=new ReportService(join(app.getPath('userData'),'report-drafts'),()=>{state={...state,reportJobs:reports.views()};emitState();if(!recordings.busy()&&!managingLibrary&&!exiting)retention?.resume()})
  playback.beforeSourceChange=()=>spectrogram.release()
  playback.instrumentQuery=request=>instrumentsVisible()?instruments.query(request,state.instrumentSettings||defaultInstrumentSettings):Promise.resolve(undefined)
  const encoderLock=JSON.parse(readFileSync(app.isPackaged?join(process.resourcesPath,'ffmpeg.lock.json'):join(root,'ffmpeg.lock.json'),'utf8'))
  const mediaTools={ffmpeg:join(ffroot,'ffmpeg.exe'),ffprobe:join(ffroot,'ffprobe.exe'),nativePath:app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),ffmpegSha256:encoderLock.ffmpegSha256,ffprobeSha256:encoderLock.ffprobeSha256}
  imports=new ImportService(join(app.getPath('userData'),'imports'),mediaTools,syncImportState,async id=>{if(playback.view()?.takeId===id)await closeInspection();await references?.forgetTake(id);await reports.forgetTake(id);await analyses.forgetTake(id)},()=>!recordings.busy()&&!exporter?.busy()&&!deliveries?.busy()&&!exiting&&!managingLibrary)
  assets=new AssetRepository(recordings,imports)
  exporter=new ExportService(assets,mediaTools,syncExportState)
  assets.setExportResolver((id,exportId)=>exporter.resolve(id,exportId))
  references=new ReferenceService(analyses,source=>assets.analysisSource(source.takeId,source.role,source.regionId,source.exportId),syncReferenceState)
  referenceSpectrum=new ReferenceSpectrumService(references,(request,settings)=>instruments.query(request,settings),packet=>{if(window&&!window.isDestroyed()&&!exiting&&referenceVisible())sendRenderer('trace:reference',packet)})
  references.stopQueries=()=>referenceSpectrum.cancel()
  deliveries=new DeliveryService(assets,exporter,()=>syncExportState(),()=>!recordings.busy()&&!exiting&&!managingLibrary)
  library=new LibraryService(recordings,path=>shell.trashItem(path),()=>{if(recordings)update({recordings:library.summaries(),exportJobs:exporter.views().map(decorateExport)})},()=>exporter.busy()||deliveries.busy())
  recordings.setExportResolver((takeId,exportId)=>exporter.resolve(takeId,exportId))
  retention=new SourceRetention(recordings,exporter,playback,analyses,app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),syncRetentionState)
  retention.usesSource=id=>reports.usesTake(id)||references.usesTake(id)||playback.usesSource(id)
  recordings.setFinalizedHandler(async id=>{
    const take=recordings.session(id),preset=take.document.preset
    if(!preset.format){retention.schedule();return}
    const {namePrefix,keepOriginal,...output}=preset;void namePrefix;void keepOriginal
    await exporter.start({takeId:id,role:take.document.regions.length>1?'session':take.document.status==='recovered'?'recovered':'source'},output,true);retention.schedule()
  })
  recordings.setReconnectHandler(async(deviceId,isCurrent)=>{
    if(!isCurrent())throw Error('RECONNECT_CANCELLED')
    const format=startDevice(deviceId)
    return {format,source:{deviceId,captureEpochId:captureInstance+':'+engine.snapshot(10,1).epochId}}
  })
  ipcMain.handle('trace:command',handle)
  ipcMain.handle('trace:import-files',(event,paths:unknown)=>{if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('UNTRUSTED_FRAME');const task=mutations.then(()=>acceptImportFiles(paths));mutations=task.then(()=>undefined,()=>undefined);return task})
  let savedWindow:{windowBounds?:unknown;maximized?:boolean;instrumentTheme?:unknown}={};try{savedWindow=JSON.parse(readFileSync(preferencesPath(),'utf8'))}catch{}
  if(testMode&&process.env.TRACE_TEST_WINDOW_BOUNDS){try{savedWindow.windowBounds=JSON.parse(process.env.TRACE_TEST_WINDOW_BOUNDS)}catch{throw Error('INVALID_TEST_WINDOW_BOUNDS')}}
  const bounds=restoreWindowBounds(savedWindow.windowBounds,screen.getAllDisplays().map(d=>d.workArea))
  window=new BrowserWindow({
    icon:app.isPackaged?join(process.resourcesPath,'icon.png'):join(root,'resources/trace/icon.png'),title:testMode?'Trace — 自动验证':'Trace — Audio Recorder & Analyzer',width:1280,height:800,minWidth:1024,minHeight:700,
    ...(bounds||{}),backgroundColor:'#11151a',autoHideMenuBar:true,show:!testMode||process.argv.includes('--trace-test-visible'),
    webPreferences:{webgl:!(testMode&&process.env.TRACE_TEST_NO_WEBGL==='1'),preload:join(__dirname,'../preload/index.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:!testMode},
  })
  window.webContents.on('did-start-loading',()=>{rendererUsable=false})
  window.webContents.on('render-process-gone',()=>{rendererUsable=false})
  window.webContents.on('did-finish-load',()=>{rendererUsable=true;emitState()})
  supportRuntime.bindWindow(window)
  const publishVisibility=()=>{const visible=Boolean(window?.isVisible()&&!window?.isMinimized());if(!visible)spectrogram?.cancel();if(state.windowVisible!==visible)update({windowVisible:visible})}
  window.on('show',publishVisibility);window.on('hide',publishVisibility);window.on('minimize',publishVisibility);window.on('restore',publishVisibility)
  publishVisibility()
  if(savedWindow.maximized&&!testMode)window.maximize()
  let boundsTimer:ReturnType<typeof setTimeout>|undefined
  const rememberBounds=()=>{if(boundsTimer)clearTimeout(boundsTimer);boundsTimer=setTimeout(()=>{if(!exiting&&window&&!window.isDestroyed())savePreferences()},250)}
  window.on('resize',rememberBounds);window.on('move',rememberBounds)
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',event=>event.preventDefault())
  window.on('close',event=>{
    if(!exiting&&recordings.activeSummary()&&state.confirmExitWhileRecording!==false){
      event.preventDefault()
      if(!closePromptPending){closePromptPending=true;void dialog.showMessageBox(window!,{type:'question',title:'正在录音',message:'结束录音并退出 Trace？',detail:'已录下的部分会完成保存。',buttons:['继续录音','结束并退出'],defaultId:0,cancelId:0,noLink:true}).then(answer=>{if(answer.response===1)app.quit()}).catch(error=>console.error('TRACE_CLOSE_PROMPT_FAILED',error)).finally(()=>{closePromptPending=false})}
      return
    }
    if(preferencesTimer)clearTimeout(preferencesTimer);try{savePreferences()}catch(error){console.error('Trace preferences:',error)}})
  window.on('closed',()=>{window=null})
  // Restore before the first state push and pass it in the URL: the renderer applies it before first paint
  // (whitelisted again there) and no earlier state can carry the default theme, so a saved theme never flashes green.
  state.instrumentTheme=restoreInstrumentTheme(savedWindow.instrumentTheme)
  window.loadFile(join(__dirname,'../renderer/index.html'),{query:{theme:state.instrumentTheme}}).then(initialize).catch(()=>supportRuntime!.startupFailure())
  if(activateWhenReady)activateExistingWindow()
  timer=setInterval(()=>{
    if(!window||window.isDestroyed())return
    if(pollFailurePending)return
    try{
    const skip=(!window.isVisible()||window.isMinimized())&&++displayTick%10!==0
    const record=engine.recordStatus()
    const source=engine.snapshot(skip?10:state.windowSeconds,skip?1:900)
    recordings.observe(record,{recoverable:source.diagnostics.sourceRecoverable===true,error:source.error});releaseRecordingCapture()
    if(source.error&&state.error!==source.error)update({active:false,error:source.error})
    latestRecordingFrame={recording:record,recordingView:recordings.display(record)}
    if(playback.active()){if(!skip)publishInspectionSample();return}
    if(skip)return
    const snapshot:MeterSnapshot={...source,...latestRecordingFrame,eventSequence:++snapshotSequence,stateRevision:state.revision}
    if(snapshot.error&&state.error!==snapshot.error){
      console.error('TRACE_SOURCE_ERROR',JSON.stringify({error:snapshot.error,diagnostics:snapshot.diagnostics,epochId:snapshot.epochId,positionFrame:snapshot.positionFrame}))
      update({active:false,error:snapshot.error})
    }
    snapshot.stateRevision=state.revision;publishLiveSample(snapshot)
    }catch(error){
      const message='RECORD_SNAPSHOT_FAILED: '+(error instanceof Error?error.message:String(error))
      if(lastPollError!==message){lastPollError=message;console.error('TRACE_SNAPSHOT_ERROR',error);update({error:message})}
      pollFailurePending=true
      void recordings.fail(message).catch(failure=>{console.error('TRACE_RECORD_FINALIZE_ERROR',failure);update({error:message+'; '+String(failure)})}).finally(()=>{pollFailurePending=false})
    }
  },33)
}).catch(async()=>{if(supportRuntime)return supportRuntime.startupFailure();dialog.showErrorBox('Trace 启动失败','无法启动 Trace。请检查安装文件和配置目录权限。');app.exit(1)})
let exiting=false,readyToQuit=false
app.on('before-quit',event=>{
  if(readyToQuit)return
  event.preventDefault();if(exiting)return;try{if(window&&!window.isDestroyed())savePreferences()}catch(error){console.error('Trace preferences:',error)}exiting=true
  supportRuntime?.stopDialogs()
  if(timer)clearInterval(timer)
  if(preferencesTimer)clearTimeout(preferencesTimer)
  recordings?.prepareShutdown()
  const finish=(async()=>{
    if(importWatchTimer)clearInterval(importWatchTimer)
    await imports?.shutdown()
    await references?.shutdown()
    await reports?.shutdown()
    // Drain everything that can still reach the native engine before the engine
    // itself is torn down, otherwise an in-flight request runs against freed state.
    await Promise.all([spectrogram?.close(),instruments?.shutdown(),deliveries?.shutdown(),retention?.shutdown(),exporter?.pauseForRecording(),analyses?.shutdown(),playback?.close()])
    await nativeAnalysisQueue.close()
    let final:NativeRecordSnapshot|undefined
    try{final=engine?.shutdown()}catch(error){console.error('Trace shutdown:',error)}
    if(final&&recordings)await recordings.finish(final)
    await exporter?.shutdown()
    await preferencesWriter?.flush()
    await supportRuntime?.finish()
  })()
  // A wedged worker, encoder or disk write must not leave a window-less process
  // that can never quit; the recording finaliser above is the only step that
  // still needs time, and it has its own internal deadline.
  const deadlineMs=Number(process.env.TRACE_SHUTDOWN_TIMEOUT_MS??60000)
  let done=false
  const settle=()=>{if(done)return;done=true;readyToQuit=true;app.quit()}
  if(deadlineMs>0)setTimeout(()=>{if(done)return;console.error('Trace finalization: timed out after',deadlineMs,'ms');try{supportRuntime?.recordShutdownTimeout()}catch{}settle()},deadlineMs).unref?.()
  finish.catch(error=>console.error('Trace finalization:',error)).finally(settle)
})
app.on('window-all-closed',()=>app.quit())
