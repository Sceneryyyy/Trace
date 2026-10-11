import type {TraceState,NativeMeterSnapshot,NativeRecordSnapshot} from './shared'
export function errorCode(value:unknown):string|null{
 if(!value)return null
 return String(value).replace(/^(?:Error:\s*)+/,'').match(/^[A-Z][A-Z0-9_]{3,}(?=[:\s(]|$)/)?.[0]||'UNSPECIFIED'
}
function safeTiming(value:unknown){
 if(!value||typeof value!=='object')return null
 const out:Record<string,number>={};for(const key of ['count','p50Us','p95Us','p99Us','maxUs']){const n=(value as Record<string,unknown>)[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0)return null;out[key]=n}return out
}
export function safeDiagnostics(version:string,state:TraceState,snapshot:NativeMeterSnapshot,record?:NativeRecordSnapshot){
 const file=state.playback
 return {product:'Trace',version,capturedAt:new Date().toISOString(),
  capture:{active:state.active,requested:state.monitoringRequested,format:snapshot.format,captureEpoch:snapshot.epochId,measurementEpoch:snapshot.measurementEpoch,errorCode:errorCode(state.error||snapshot.error),timing:safeTiming(snapshot.diagnostics?.captureTiming),nativeErrorCode:typeof snapshot.diagnostics?.sourceErrorCode==='number'?snapshot.diagnostics.sourceErrorCode:null},
  recording:record?{timings:record.timings?{write:safeTiming(record.timings.write),flush:safeTiming(record.timings.flush)}:null,phase:record.phase,acceptedFrames:record.acceptedFrames,writtenFrames:record.writtenFrames,queueDepth:record.queueDepth,queueHighWater:record.queueHighWater,errorCode:errorCode(record.error)}:null,
  view:file?{kind:file.temporary?'memory':'file',phase:file.phase,positionFrame:file.positionFrame,totalFrames:file.totalFrames,analysisPhase:file.analysisPhase,errorCode:errorCode(file.error||file.analysisError)}:{kind:'live'},
  // Whitelisted theme id only, to reproduce screenshots; no other preference is copied.
  display:{instrumentTheme:state.instrumentTheme??null},
  jobs:{analysis:state.analysisJobs?.slice(-32).map(j=>({phase:j.phase,errorCode:errorCode(j.error)})),export:state.exportJobs?.slice(-32).map(j=>({phase:j.phase,errorCode:errorCode(j.error),deliveryPhase:j.delivery?.phase,deliveryErrorCode:errorCode(j.delivery?.error)}))}
 }
}
