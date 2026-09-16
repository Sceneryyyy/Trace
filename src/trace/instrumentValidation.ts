import type {InstrumentSettings,InstrumentRequest,NativeInstrumentResult} from './instrumentTypes'
export function validateInstrumentResult(data:NativeInstrumentResult,request:InstrumentRequest,settings:InstrumentSettings):NativeInstrumentResult{
 const bad=()=>{throw Error('INVALID_INSTRUMENT_RESULT')}
 const frame=(s:unknown)=>typeof s==='string'&&/^[0-9]{1,20}$/.test(s)&&BigInt(s)<=0xffffffffffffffffn
 if(!data||data.positionFrame!==request.positionFrame||data.sampleRate!==request.sampleRate||data.fftSize!==settings.fftSize||![1,2].includes(data.channelCount)||
  !['ready','silence','insufficient','gap','error'].includes(data.status)||!frame(data.windowStart)||BigInt(data.windowStart)>BigInt(data.positionFrame)||!Number.isFinite(data.binHz)||data.binHz!==data.sampleRate/data.fftSize||!Number.isFinite(data.elapsedMs)||data.elapsedMs<0)bad()
 for(const array of [data.current,data.average,data.peakHold]){
  if(!(array instanceof Float64Array)||![0,data.fftSize/2+1].includes(array.length)||array.length!==data.current.length||array.some(v=>!Number.isFinite(v)||v<0))bad()
 }
 if(data.current.length&&BigInt(data.positionFrame)-BigInt(data.windowStart)!==BigInt(data.fftSize))bad()
 if(data.hop!==Math.min(data.fftSize/4,Math.max(1,Math.floor(data.sampleRate/50)))||typeof data.partialAverage!=='boolean'||typeof data.partialHold!=='boolean'||![data.averageWindows,data.holdWindows].every(n=>Number.isInteger(n)&&n>=0&&n<=4000))bad()
 const f=data.field
 if(!f||typeof f.partial!=='boolean'||!frame(f.firstFrame)||f.endFrame!==data.positionFrame||BigInt(f.firstFrame)>BigInt(f.endFrame)||!(f.points instanceof Float32Array)||f.points.length>8192||f.points.length%4||f.points.some(v=>!Number.isFinite(v)))bad()
 for(const m of [f.correlation,f.balance])if(!m||!['ready','silence','insufficient','gap','error'].includes(m.status)||(m.status==='ready'?m.value===null||!Number.isFinite(m.value)||Math.abs(m.value)>1:m.value!==null))bad()
 for(const array of [f.polarPeak,f.polarRms,f.polarEnvelope])if(!(array instanceof Float64Array)||array.length!==181||array.some(v=>!Number.isFinite(v)||v<0))bad()
 return data
}
