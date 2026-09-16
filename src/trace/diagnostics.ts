import type {TraceState,NativeMeterSnapshot,NativeRecordSnapshot} from './shared'
export function errorCode(value:unknown):string|null{
 if(!value)return null
 return String(value).replace(/^(?:Error:\s*)+/,'').match(/^[A-Z][A-Z0-9_]{3,}(?=[:\s(]|$)/)?.[0]||'UNSPECIFIED'
}
export function safeDiagnostics(version:string,state:TraceState,snapshot:NativeMeterSnapshot,record?:NativeRecordSnapshot){
 const file=state.playback
 return {product:'Trace',version,capturedAt:new Date().toISOString(),
  capture:{active:state.active,requested:state.monitoringRequested,format:snapshot.format,captureEpoch:snapshot.epochId,measurementEpoch:snapshot.measurementEpoch,errorCode:errorCode(state.error||snapshot.error),nativeErrorCode:typeof snapshot.diagnostics?.sourceErrorCode==='number'?snapshot.diagnostics.sourceErrorCode:null},
  recording:record?{phase:record.phase,acceptedFrames:record.acceptedFrames,writtenFrames:record.writtenFrames,queueDepth:record.queueDepth,queueHighWater:record.queueHighWater,errorCode:errorCode(record.error)}:null,
  view:file?{kind:file.temporary?'memory':'file',phase:file.phase,positionFrame:file.positionFrame,totalFrames:file.totalFrames,analysisPhase:file.analysisPhase,errorCode:errorCode(file.error||file.analysisError)}:{kind:'live'},
  jobs:{analysis:state.analysisJobs?.map(j=>({phase:j.phase,errorCode:errorCode(j.error)})),export:state.exportJobs?.map(j=>({phase:j.phase,errorCode:errorCode(j.error),deliveryPhase:j.delivery?.phase,deliveryErrorCode:errorCode(j.delivery?.error)}))}
 }
}
