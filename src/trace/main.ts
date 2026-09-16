import {DeliveryService} from './deliveryService'
import {safeDiagnostics} from './diagnostics'
import {exportPreferencesVersion} from './exportPreferences'
import {recordingCapacity,freeSpace} from './storageCapacity'
import {mediaDurationNs} from './sessionTimeline'
import {LibraryService} from './libraryService'
import { app, BrowserWindow, dialog, ipcMain, shell, screen, clipboard } from 'electron'
import { join, resolve, sep,isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { validateRequest, isMutation } from './contracts'
import { RecordingService } from './recording'
import { AnalysisService } from './analysisService'
import { PlaybackService } from './playbackService'
import {ExportService} from './exportService'
import {SourceRetention} from './sourceRetention'
import type {ExportSource} from './exportTypes'
import {validateExportPreset} from './mediaTypes'
import {recordSettingsVersion} from './recordSettings'
import {defaultDisplaySettings,validateDisplaySettings,restoreDisplaySettings,displaySettingsVersion,validWindowSeconds} from './displaySettings'
import {restoreWindowBounds} from './windowGeometry'
import {product} from './product'
import type {PlaybackNative} from './playbackService'
import type { Device, NativeMeterSnapshot, MeterSnapshot, NativeRecordSnapshot, Reply, Request, SourceFormat, TraceState } from './shared'
const requireNative=createRequire(__filename)
const root=resolve(__dirname,'../..')
const captureInstance=randomUUID()
type NativeEngine=PlaybackNative&{
  runtimeModules():Record<string,string|null>;devices():Device[];start(id:string):SourceFormat;stop():void;reset():void;shutdown():NativeRecordSnapshot
  snapshot(seconds:number,columns:number):NativeMeterSnapshot
  recordStart(id:string,path:string,encoding:string,segmentBytes?:number,journalPath?:string):NativeRecordSnapshot
  recordStop():NativeRecordSnapshot;recordStatus():NativeRecordSnapshot
}
let engine:NativeEngine
let recordings:RecordingService
let analyses:AnalysisService
let playback:PlaybackService
let exporter:ExportService
let deliveries:DeliveryService
let library:LibraryService
let managingLibrary=false
let retention:SourceRetention
let window:BrowserWindow|null=null
let closePromptPending=false
let timer:ReturnType<typeof setInterval>|undefined
let inspection:{id:string;sourceKind:string;sourceId:string;epochId:string;measurementEpoch:string;origin:bigint;rate:number;total:bigint}|null=null
let finishingOutput=false,inspectionFailurePending=false
let latestRecordingFrame:Pick<MeterSnapshot,'recording'|'recordingView'>={}
let recordingCaptureHeld=false
let preferencesTimer:ReturnType<typeof setTimeout>|undefined
let displayTick=0,snapshotSequence=0,pollFailurePending=false,lastPollError=''
let state:TraceState={revision:0,active:false,monitoringRequested:true,deviceId:'',windowSeconds:30,error:null,displaySettings:{...defaultDisplaySettings}}
const completed=new Map<string,{signature:string;reply:Reply}>()
const pending=new Map<string,{signature:string;promise:Promise<Reply>}>()
let mutations:Promise<unknown>=Promise.resolve()
const testMode=process.argv.includes('--trace-test')
const testRoot=testMode?(process.env.TRACE_TEST_ROOT?resolve(process.env.TRACE_TEST_ROOT):app.isPackaged?join(app.getPath('temp'),'Trace-validation',String(process.pid)):join(root,'artifacts')):undefined
if(testMode){if(!testRoot||!isAbsolute(testRoot))throw Error('INVALID_TEST_ROOT');const dir=process.env.TRACE_TEST_USER_DATA?resolve(process.env.TRACE_TEST_USER_DATA):join(testRoot,'test-users',String(process.pid));if(!dir.toLowerCase().startsWith((testRoot+sep).toLowerCase()))throw Error('INVALID_TEST_USER_DATA');mkdirSync(dir,{recursive:true});app.setPath('userData',dir)}
app.setName('Trace')
function emitState():void{state={...state,eventSequence:(state.eventSequence||0)+1};if(window&&!window.isDestroyed())window.webContents.send('trace:state',{...state})}
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
function syncAnalysisState(control:boolean):void{if(!analyses)return;const patch={analysisJobs:analyses.snapshots(),playback:playback?.view()};if(control)update(patch);else{state={...state,...patch};emitState()}void prepareMemoryAnalyses()}
function releaseRecordingCapture():void{
  if(!recordingCaptureHeld||recordings.busy()||exiting)return
  try{
    if(!state.monitoringRequested){engine.stop();update({active:false,error:state.error?.startsWith('CAPTURE_RELEASE_FAILED:')?null:state.error})}
    recordingCaptureHeld=false
  }catch(error){const message='CAPTURE_RELEASE_FAILED: '+String(error);if(state.error!==message)update({error:message})}
}
function syncRecordingState():void{
  if(!recordings)return
  releaseRecordingCapture()
  analyses?.setRecordingBusy(recordings.busy()||managingLibrary)
  if(exporter){if(recordings.busy()||exiting||managingLibrary)void exporter.pauseForRecording();else exporter.resume()}
  if(deliveries){if(recordings.busy()||exiting||managingLibrary)void deliveries.pause();else deliveries.resume()}
  if(retention){if(recordings.busy()||exiting||managingLibrary)void retention.pause();else retention.resume()}
  update({recordSettings:{...recordings.settings},recordDirectory:recordings.directory,currentRecord:recordings.activeSummary(),recordings:library?library.summaries():recordings.summaries()})
}
function syncExportState(control=true):void{if(!exporter||!recordings)return;const patch={exportJobs:exporter.views().map(e=>library?library.exportView(e):e),recordings:library?library.summaries():recordings.summaries()};if(control)update(patch);else{state={...state,...patch};emitState()}retention?.schedule();deliveries?.observe();void prepareMemoryAnalyses()}
function syncPlaybackState():void{if(playback)update({playback:playback.view()});retention?.schedule()}
function syncRetentionState():void{if(recordings)update({recordings:library?library.summaries():recordings.summaries()})}
function publishInspectionSample():void{
  if(!window||window.isDestroyed()||!playback.active()||inspectionFailurePending)return
  const owner=playback.view()!
  void playback.sample().then(snapshot=>{
    const current=playback.view()
    if(!snapshot||!window||window.isDestroyed()||current?.id!==snapshot.sourceId||
      current.generation!==snapshot.playback.generation||current.startFrame!==snapshot.fileView.startFrame||
      current.endFrame!==snapshot.fileView.endFrame)return
    window.webContents.send('trace:snapshot',{...snapshot,...latestRecordingFrame,eventSequence:++snapshotSequence,stateRevision:state.revision})
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
  mkdirSync(app.getPath('userData'),{recursive:true})
  const target=preferencesPath(),temp=target+'.tmp'
  writeFileSync(temp,JSON.stringify({windowBounds:window&&!window.isDestroyed()?window.getNormalBounds():undefined,maximized:window?.isMaximized(),displaySettingsVersion,monitoringRequested:state.monitoringRequested,displaySettings:state.displaySettings,settingsVersion:recordSettingsVersion,deviceId:state.deviceId,windowSeconds:state.windowSeconds,recordSettings:recordings.settings,recordDirectory:recordings.directory,exportPreferencesVersion,lastExportPreset:state.lastExportPreset,confirmExitWhileRecording:state.confirmExitWhileRecording!==false,lastExportSaveCopy:state.lastExportSaveCopy===true}))
  renameSync(temp,target)
}
function schedulePreferences():void{if(preferencesTimer)clearTimeout(preferencesTimer);preferencesTimer=setTimeout(()=>{try{savePreferences()}catch(error){console.error("Trace preferences:",error)}},150)}
function startDevice(id:string):SourceFormat{
  const format=engine.start(id);lastPollError='';update({deviceId:id,active:true,error:null});savePreferences();return format
}
function resumeInput():void{
  if(!exiting&&!playback?.outputActive()&&state.monitoringRequested&&state.deviceId&&!engine.snapshot(5,1).active&&!recordings.busy())startDevice(state.deviceId)
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
async function chooseDirectory():Promise<boolean>{
  if(recordings.busy())throw Error('RECORDING_ACTIVE')
  if(exporter?.busy()||deliveries?.busy()||retention?.active())throw Error('EXPORT_ACTIVE')
  const result=await dialog.showOpenDialog(window!,{title:'选择录音保存目录',properties:['openDirectory','createDirectory']})
  if(result.canceled||!result.filePaths[0])return false
  managingLibrary=true
  try{
    await retention.pause();await deliveries.pause();await analyses.pauseForRecording();await recordings.settled()
    if(exporter.busy())throw Error('EXPORT_ACTIVE')
    if(playback.active()&&!playback.view()?.temporary)await closeInspection()
    for(const take of recordings.sessions()){await analyses.forgetTake(take.document.sessionId);retention.forget(take.document.sessionId);deliveries.forgetTake(take.document.sessionId)}
    await recordings.setDirectory(result.filePaths[0]);update({recordDirectoryError:null});savePreferences();return true
  }finally{managingLibrary=false;syncRecordingState();resumeInput()}
}
async function dispatch(request:Request):Promise<Reply>{
  try{
    if(isMutation(request.command)&&request.expectedStateRevision!==state.revision)throw Error('STALE_REQUEST')
    if(testMode&&isMutation(request.command))console.log('TRACE_CONTROL',JSON.stringify({command:request.command,revision:state.revision,at:new Date().toISOString()}))
    let data:unknown=null
    switch(request.command){
      case 'app.configure':update({confirmExitWhileRecording:request.payload.confirmExitWhileRecording as boolean});savePreferences();break
      case 'app.diagnostics':data=safeDiagnostics(product.version,state,engine.snapshot(5,1),engine.recordStatus());break
      case 'app.copyDiagnostics':clipboard.writeText(JSON.stringify(safeDiagnostics(product.version,state,engine.snapshot(5,1),engine.recordStatus()),null,2));data={copied:true};break
      case 'app.info':data={...product,packaged:app.isPackaged,appVersion:app.getVersion(),electron:process.versions.electron,nativeModules:engine.runtimeModules(),resourcesPath:process.resourcesPath,userData:app.getPath('userData'),windowBounds:window?.getBounds(),displays:screen.getAllDisplays().map(d=>({id:d.id,scaleFactor:d.scaleFactor,bounds:d.bounds,workArea:d.workArea}))};break
      case 'record.capacity':{
        const snapshot=engine.snapshot(5,1),format=snapshot.active&&snapshot.sourceId===state.deviceId?snapshot.format:engine.devices().find(d=>d.id===state.deviceId)?.format||snapshot.format
        update({recordingCapacity:{...recordingCapacity(await freeSpace(recordings.directory),recordings.settings,format.sampleRate,format.channelCount),directory:recordings.directory}});break
      }
      case 'export.configure':update({lastExportPreset:validateExportPreset(request.payload)});schedulePreferences();break
      case 'export.describe':{
        const s=await recordings.analysisSource(request.payload.takeId as string,request.payload.role as import('./shared').AnalysisRole,request.payload.regionId as string|undefined,request.payload.exportId as string|undefined)
        data={label:s.label,frames:s.frames,sampleRate:s.sampleRate,assetFormat:s.assetFormat};break
      }
      case 'library.storage':data=await library.usage();break
      case 'library.clearCache':{
        if(recordings.busy()||exporter.busy()||deliveries.busy())throw Error('LIBRARY_BUSY')
        const takeId=request.payload.takeId as string,item=await library.describe(takeId)
        const answer=await dialog.showMessageBox(window!,{type:'question',title:'清理缓存',message:item.name,detail:'清理该录音可重建的分析与解码缓存，录音和成品音频保留。再次查看时会重新准备。',buttons:['取消','清理缓存'],defaultId:0,cancelId:0,noLink:true})
        if(answer.response!==1)break
        managingLibrary=true
        try{await retention.pause();await analyses.pauseForRecording();await recordings.settled();if(playback.view()?.takeId===takeId)await closeInspection();await analyses.forgetTake(takeId);data=await library.clearCache(takeId)}
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
            deliveries.forgetTake(item.takeId,item.exportId);await analyses.forgetTake(item.takeId,item.exportId);retention.forget(item.takeId);await library.remove(item.takeId,item.exportId);removed++}
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
          deliveries.forgetTake(takeId,exportId);await analyses.forgetTake(takeId,exportId);retention.forget(takeId)
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
      case 'view.settings':update({displaySettings:validateDisplaySettings(request.payload)});savePreferences();break
      case 'view.gain':update({displaySettings:{...(state.displaySettings||defaultDisplaySettings),waveGain:request.payload.gain as number}});schedulePreferences();break
      case 'view.window':
        update({windowSeconds:request.payload.seconds as number});schedulePreferences();break
      case 'record.configure':
        recordings.configure(request.payload);savePreferences();break
      case 'record.chooseDirectory':data=await chooseDirectory();break
      case 'cache.save':{
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        const replay=playback.replayForSave(request.payload.playbackId as string,request.payload.useSelection as boolean)
        if(!recordings.directory&&!(await chooseDirectory())){data={cancelled:true};break}
        await retention.pause();await deliveries.pause();await exporter.pauseForRecording();await analyses.pauseForRecording()
        try{const saved=await recordings.saveReplay(replay.info,replay.range);memoryAnalysisTakes.add(saved.takeId);data=saved;void prepareMemoryAnalyses()}
        finally{syncRecordingState()}
        break
      }
      case 'record.start':
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        if(!state.deviceId)throw Error('DEVICE_UNAVAILABLE')
        if(!recordings.directory&&!(await chooseDirectory()))break
        if(playback.active()){await playback.close();inspection=null}
        await retention.pause();await deliveries.pause();await exporter.pauseForRecording();await analyses.pauseForRecording()
        recordingCaptureHeld=true
        if(!engine.snapshot(5,1).active||state.error)startDevice(state.deviceId)
        await recordings.start(engine.snapshot(10,1).format,{deviceId:state.deviceId,captureEpochId:captureInstance+':'+engine.snapshot(10,1).epochId});break
      case 'record.stop':data=await recordings.stop();releaseRecordingCapture();break
      case 'file.open':{
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        const source=await recordings.analysisSource(request.payload.takeId as string,request.payload.role as import('./shared').AnalysisRole,request.payload.regionId as string|undefined,request.payload.exportId as string|undefined)
        if(playback.outputActive())await playback.pause(playback.view()!.id)
        inspection=null;resumeInput();await playback.open(source,state.deviceId);break
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
      case 'playback.clearSelection':playback.clearSelection(request.payload.playbackId as string);break
      case 'playback.retryAnalysis':
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        if(playback.view()?.id!==request.payload.playbackId)throw Error('STALE_PLAYBACK_SOURCE')
        if(playback.outputActive()){await playback.pause(request.payload.playbackId as string);resumeInput()}
        playback.retryAnalysis(request.payload.playbackId as string);break
      case 'playback.selection':playback.selection(request.payload.playbackId as string,request.payload.startFrame as string,request.payload.endFrame as string,request.payload.loop as boolean);break
      case 'playback.follow':playback.follow(request.payload.playbackId as string,request.payload.enabled as boolean);break
      case 'playback.window':playback.window(request.payload.playbackId as string,request.payload.startFrame as string,request.payload.endFrame as string,request.payload.pixelWidth as number);break
      case 'export.start':{
        if(recordings.busy())throw Error('RECORDING_ACTIVE')
        const source:ExportSource={takeId:request.payload.takeId as string,role:request.payload.role as ExportSource['role'],
          regionId:request.payload.regionId as string|undefined,exportId:request.payload.exportId as string|undefined,range:request.payload.range as ExportSource['range']}
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
        {const source=await recordings.analysisSource(request.payload.takeId as string,request.payload.role as import('./shared').AnalysisRole,request.payload.regionId as string|undefined,request.payload.exportId as string|undefined)
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
    if(recordings&&!recordings.busy())releaseRecordingCapture()
    analyses?.setRecordingBusy(recordings?.busy()||false)
    if(exporter&&!recordings?.busy()&&!exiting){exporter.resume();retention?.resume()}
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
      completed.set(requestId,{signature,reply});pending.delete(requestId)
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
  let preferred:{monitoringRequested?:boolean;deviceId?:string;windowSeconds?:number;recordSettings?:unknown;recordDirectory?:string;displaySettings?:unknown;lastExportPreset?:unknown;confirmExitWhileRecording?:boolean;lastExportSaveCopy?:boolean}={}
  try{preferred=JSON.parse(readFileSync(preferencesPath(),'utf8'))}catch{}
  if(validWindowSeconds(preferred.windowSeconds))state.windowSeconds=preferred.windowSeconds
  state.monitoringRequested=preferred.monitoringRequested!==false
  state.confirmExitWhileRecording=preferred.confirmExitWhileRecording!==false
  state.lastExportSaveCopy=preferred.lastExportSaveCopy===true
  try{if(preferred.displaySettings)state.displaySettings=restoreDisplaySettings(preferred.displaySettings)}catch{}
  try{if(preferred.recordSettings)recordings.configure(preferred.recordSettings)}catch{}
  try{if(preferred.lastExportPreset)state.lastExportPreset=validateExportPreset(preferred.lastExportPreset)}catch{}
  if(testMode&&process.env.TRACE_RECORD_TEST_DIR){
    const target=resolve(process.env.TRACE_RECORD_TEST_DIR)
    if(!target.toLowerCase().startsWith((testRoot!+sep).toLowerCase()))throw Error('TEST_DIRECTORY_OUTSIDE_ARTIFACTS')
    mkdirSync(target,{recursive:true});await recordings.setDirectory(target)
  }else if(preferred.recordDirectory){try{await recordings.setDirectory(preferred.recordDirectory)}catch{update({recordDirectoryError:'SAVE_DIRECTORY_UNAVAILABLE'})}}
  syncRecordingState();await library.refresh()
  const devices=engine.devices()
  const device=devices.find(d=>d.id===preferred.deviceId&&d.supported)||devices.find(d=>d.isDefault&&d.supported)
  if(device){if(state.monitoringRequested)startDevice(device.id);else update({deviceId:device.id,active:false,error:null})}else update({error:'没有可用的单声道或双声道播放设备。'})
}
app.whenReady().then(()=>{
  engine=requireNative(app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node')) as NativeEngine
  const ffroot=app.isPackaged?join(process.resourcesPath,'ffmpeg'):join(root,'.tools/ffmpeg/bin')
  const segment=testMode&&process.env.TRACE_TEST_SEGMENT_BYTES?Number(process.env.TRACE_TEST_SEGMENT_BYTES):2147483648
  recordings=new RecordingService(engine,join(ffroot,'ffmpeg.exe'),join(ffroot,'ffprobe.exe'),app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),syncRecordingState,segment)
  analyses=new AnalysisService(app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),syncAnalysisState)
  playback=new PlaybackService(engine,analyses,syncPlaybackState)
  const encoderLock=JSON.parse(readFileSync(app.isPackaged?join(process.resourcesPath,'ffmpeg.lock.json'):join(root,'ffmpeg.lock.json'),'utf8'))
  exporter=new ExportService(recordings,{ffmpeg:join(ffroot,'ffmpeg.exe'),ffprobe:join(ffroot,'ffprobe.exe'),nativePath:app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),ffmpegSha256:encoderLock.ffmpegSha256,ffprobeSha256:encoderLock.ffprobeSha256},syncExportState)
  deliveries=new DeliveryService(recordings,exporter,()=>syncExportState(),()=>!recordings.busy()&&!exiting&&!managingLibrary)
  library=new LibraryService(recordings,path=>shell.trashItem(path),()=>{if(recordings)update({recordings:library.summaries(),exportJobs:exporter.views().map(e=>library.exportView(e))})},()=>exporter.busy()||deliveries.busy())
  recordings.setExportResolver((takeId,exportId)=>exporter.resolve(takeId,exportId))
  retention=new SourceRetention(recordings,exporter,playback,analyses,app.isPackaged?join(process.resourcesPath,'native/trace_engine.node'):join(root,'build/trace-engine/Release/trace_engine.node'),syncRetentionState)
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
  let savedWindow:{windowBounds?:unknown;maximized?:boolean}={};try{savedWindow=JSON.parse(readFileSync(preferencesPath(),'utf8'))}catch{}
  if(testMode&&process.env.TRACE_TEST_WINDOW_BOUNDS){try{savedWindow.windowBounds=JSON.parse(process.env.TRACE_TEST_WINDOW_BOUNDS)}catch{throw Error('INVALID_TEST_WINDOW_BOUNDS')}}
  const bounds=restoreWindowBounds(savedWindow.windowBounds,screen.getAllDisplays().map(d=>d.workArea))
  window=new BrowserWindow({
    icon:app.isPackaged?join(process.resourcesPath,'icon.png'):join(root,'resources/trace/icon.png'),title:testMode?'Trace — 自动验证':'Trace — Audio Recorder & Analyzer',width:1280,height:800,minWidth:1024,minHeight:700,
    ...(bounds||{}),backgroundColor:'#121615',autoHideMenuBar:true,show:!testMode,
    webPreferences:{preload:join(__dirname,'../preload/index.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:true},
  })
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
  window.loadFile(join(__dirname,'../renderer/index.html')).then(initialize).catch(error=>update({active:false,error:String(error)}))
  timer=setInterval(()=>{
    if(!window||window.isDestroyed())return
    if(pollFailurePending)return
    try{
    const skip=window.isMinimized()&&++displayTick%10!==0
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
    snapshot.stateRevision=state.revision;window.webContents.send('trace:snapshot',snapshot)
    }catch(error){
      const message='RECORD_SNAPSHOT_FAILED: '+(error instanceof Error?error.message:String(error))
      if(lastPollError!==message){lastPollError=message;console.error('TRACE_SNAPSHOT_ERROR',error);update({error:message})}
      pollFailurePending=true
      void recordings.fail(message).catch(failure=>{console.error('TRACE_RECORD_FINALIZE_ERROR',failure);update({error:message+'; '+String(failure)})}).finally(()=>{pollFailurePending=false})
    }
  },33)
}).catch(error=>{console.error('Trace startup failed:',error);app.exit(1)})
let exiting=false,readyToQuit=false
app.on('before-quit',event=>{
  if(readyToQuit)return
  event.preventDefault();if(exiting)return;try{if(window&&!window.isDestroyed())savePreferences()}catch(error){console.error('Trace preferences:',error)}exiting=true
  if(timer)clearInterval(timer)
  if(preferencesTimer)clearTimeout(preferencesTimer)
  recordings?.prepareShutdown()
  let final:NativeRecordSnapshot|undefined
  try{final=engine?.shutdown()}catch(error){console.error('Trace shutdown:',error)}
  const finish=(async()=>{
    await Promise.all([deliveries?.shutdown(),retention?.shutdown(),exporter?.pauseForRecording(),analyses?.shutdown(),playback?.close()])
    if(final&&recordings)await recordings.finish(final)
    await exporter?.shutdown()
  })()
  finish.catch(error=>console.error('Trace finalization:',error)).finally(()=>{readyToQuit=true;app.quit()})
})
app.on('window-all-closed',()=>app.quit())
