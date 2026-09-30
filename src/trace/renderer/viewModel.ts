import {useMemo} from 'react'
import type {Device,MeterSnapshot,PlaybackView,TraceState} from '../shared'
import {useMeterSnapshot,useSnapshotSelector} from './snapshotStore'
import type {ReadoutAvailability} from './metricReadout'

export interface WindowDraft{id:string;startFrame:string;endFrame:string}
export interface RecordWindow{mode:'all'|'follow'|'manual';start:string;end:string}

/** App-level inputs that combine with the 30 Hz snapshot into the display view. */
export interface ViewInputs{
 state:TraceState
 devices:Device[]
 windowDraft:WindowDraft|null
 recordWindow:RecordWindow
 seconds:number
}

/**
 * Pure derivation of everything the workbench displays from a meter snapshot
 * plus App-level state. Extracted from App.tsx unchanged so each instrument
 * container can subscribe independently instead of re-rendering the whole tree.
 */
export function deriveView({state,devices,windowDraft,recordWindow,seconds,snapshot}:ViewInputs&{snapshot:MeterSnapshot|null}){
 const file=state.playback&&windowDraft?.id===state.playback.id?{...state.playback,startFrame:windowDraft.startFrame,endFrame:windowDraft.endFrame,follow:false}:state.playback
 const selected=devices.find(d=>d.id===state.deviceId)
 const liveSnapshot=snapshot?.sourceKind!=='file'&&snapshot?.sourceId===state.deviceId?snapshot:null
 const format=state.active&&liveSnapshot?.format.sampleRate?liveSnapshot.format:selected?.format||liveSnapshot?.format
 const record=snapshot?.recording
 const recordBusy=Boolean(state.currentRecord&&record?.id&&record.sourceFormat.sampleRate>0)
 const isRecording=Boolean(state.currentRecord)||recordBusy
 const finalizing=record?.phase==='finalizing'||state.currentRecord?.phase==='finalizing'
 const reconnecting=state.currentRecord?.phase==='reconnecting',multiRegion=(state.currentRecord?.regionCount||0)>1
 const view=snapshot?.recordingView
 const rawDisplaySnapshot:MeterSnapshot|null=file?(snapshot?.sourceKind==='file'&&snapshot.sourceId===file.id?{...snapshot,positionFrame:snapshot.positionFrame,fileView:snapshot.fileView?{...snapshot.fileView,startFrame:file.startFrame,endFrame:file.endFrame,selection:file.selection,selectionAnalysis:file.selectionAnalysis,playingIntent:file.phase==='playing'||file.phase==='buffering'}:undefined}:null):snapshot?.sourceKind==='file'||snapshot?.sourceId!==state.deviceId?null:isRecording&&view&&snapshot?{...snapshot,...(recordBusy&&record?record.meters:{}),sourceKind:'take',sourceId:state.currentRecord?.id||record?.id||'',positionFrame:view.durationNs,timelineRate:1000000000,format:{...snapshot.format,channelCount:view.channelCount},waveform:view.waveform,loudnessHistory:view.loudnessHistory,lraProvisional:!record||BigInt(record.writtenFrames)<BigInt(record.sourceFormat.sampleRate)*60n,continuity:multiRegion?'gaps':snapshot.continuity}:snapshot
 const recEnd=BigInt(view?.durationNs||'0'),recSpan=BigInt(Math.round(seconds*1000000000))
 const recBounds=recordWindow.mode==='all'?{startFrame:'0',endFrame:recEnd.toString()}:recordWindow.mode==='follow'?{startFrame:(recEnd>recSpan?recEnd-recSpan:0n).toString(),endFrame:recEnd.toString()}:{startFrame:recordWindow.start,endFrame:recordWindow.end}
 const liveEnd=BigInt(rawDisplaySnapshot?.positionFrame||'0'),liveSpan=BigInt(Math.round(seconds*(rawDisplaySnapshot?.format.sampleRate||48000)))
 const displaySnapshot=rawDisplaySnapshot?.sourceKind==='take'?{...rawDisplaySnapshot,timelineAvailableRange:view?.inspectableRange,timelineWindow:recBounds,positionFrame:rawDisplaySnapshot.positionFrame}:rawDisplaySnapshot?.sourceKind==='live'?{...rawDisplaySnapshot,timelineAvailableRange:typeof rawDisplaySnapshot.diagnostics.replayStartFrame==='string'&&typeof rawDisplaySnapshot.diagnostics.replayEndFrame==='string'?{startFrame:rawDisplaySnapshot.diagnostics.replayStartFrame,endFrame:rawDisplaySnapshot.diagnostics.replayEndFrame}:undefined,timelineWindow:{startFrame:(liveEnd>liveSpan?liveEnd-liveSpan:0n).toString(),endFrame:liveEnd.toString()}}:rawDisplaySnapshot
 const sourceError=state.error||displaySnapshot?.error||null
 const snapshotFailure=Boolean(state.error?.startsWith('RECORD_SNAPSHOT_FAILED:'))
 const continuity=sourceError?'':displaySnapshot?.continuity==='gaps'?'音频有中断':''
 const history=Boolean(file?.temporary)
 const replaySeconds=Number(liveSnapshot?.diagnostics.replayFrames||0)/(format?.sampleRate||48000)
 const numberMetrics=file?.error?.startsWith('FILE_SNAPSHOT_FAILED:')||(file?file.analysisPhase!=='ready'||Boolean(displaySnapshot?.error):Boolean(sourceError)||reconnecting)?null:displaySnapshot
 // Preserve numerical suppression while retaining its cause for readout labels.
 // Background LIVE errors do not invalidate a healthy file's measurements.
 const numberAvailability:ReadoutAvailability=file?
  file.error?.startsWith('FILE_SNAPSHOT_FAILED:')||displaySnapshot?.error||['failed','cancelled'].includes(file.analysisPhase)?'unavailable':file.analysisPhase!=='ready'?'analyzing':displaySnapshot?'available':'measuring':
  reconnecting?'reconnecting':sourceError?'unavailable':displaySnapshot?'available':'measuring'
 const timelineRate=displaySnapshot?.timelineRate||displaySnapshot?.format.sampleRate||48000
 const workbenchFile:PlaybackView=file?{...file,positionFrame:displaySnapshot?.positionFrame||file.positionFrame}:{
  id:'live',takeId:'',role:'source',label:isRecording?'本次录音':'系统声音',phase:'paused',error:null,
  positionFrame:displaySnapshot?.positionFrame||'0',totalFrames:displaySnapshot?.positionFrame||'0',sampleRate:timelineRate,channelCount:format?.channelCount||2,
  generation:'0',analysisId:'',analysisPhase:'ready',gain:1,loop:false,follow:true,selection:null,startFrame:displaySnapshot?.timelineWindow?.startFrame||'0',endFrame:displaySnapshot?.timelineWindow?.endFrame||'0'}
 return {file,selected,liveSnapshot,format,record,recordBusy,isRecording,finalizing,reconnecting,multiRegion,view,recEnd,recBounds,displaySnapshot,sourceError,snapshotFailure,continuity,history,replaySeconds,numberMetrics,numberAvailability,timelineRate,workbenchFile}
}
export type DerivedView=ReturnType<typeof deriveView>

/** Full display view for an instrument container; re-renders with every published frame. */
export function useDerivedView(inputs:ViewInputs):DerivedView{
 const snapshot=useMeterSnapshot()
 return useMemo(()=>deriveView({...inputs,snapshot}),[inputs,snapshot])
}

export interface ChromeFlags{
 recordBusy:boolean
 finalizing:boolean
 replayAvailable:boolean
 error:string
 continuity:string
 format:DerivedView['format']
}
function chromeEqual(a:ChromeFlags,b:ChromeFlags):boolean{
 if(a.recordBusy!==b.recordBusy||a.finalizing!==b.finalizing||a.replayAvailable!==b.replayAvailable||a.error!==b.error||a.continuity!==b.continuity)return false
 if(a.format===b.format)return true
 if(!a.format||!b.format)return false
 return a.format.sampleRate===b.format.sampleRate&&a.format.channelCount===b.format.channelCount&&a.format.encoding===b.format.encoding&&a.format.containerBits===b.format.containerBits
}
/**
 * Rarely-changing flags the App chrome (top bar, source bar, footer, banners)
 * needs from the snapshot stream. Re-renders only when a flag actually flips.
 */
export function useChromeFlags(inputs:ViewInputs):ChromeFlags{
 return useSnapshotSelector(snapshot=>{
  const view=deriveView({...inputs,snapshot})
  return {recordBusy:view.recordBusy,finalizing:view.finalizing,replayAvailable:view.replaySeconds>0,error:view.sourceError||'',continuity:view.continuity,format:view.format}
 },chromeEqual)
}
