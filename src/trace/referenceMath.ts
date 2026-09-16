import type {Metric} from './shared'
export type ReferenceRange={startFrame:string;endFrame:string}
const u64=(v:string)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>0xffffffffffffffffn)throw Error('INVALID_REFERENCE_FRAME');return BigInt(v)}
export function referenceRange(value:ReferenceRange|undefined,totalFrames:string):ReferenceRange{
 const total=u64(totalFrames),start=u64(value?.startFrame||'0'),end=u64(value?.endFrame||totalFrames)
 if(total===0n||end<=start||end>total)throw Error('INVALID_REFERENCE_RANGE')
 return {startFrame:String(start),endFrame:String(end)}
}
export function referenceOffset(value:string):bigint{
 if(typeof value!=='string'||!/^(-?[1-9][0-9]{0,13}|0)$/.test(value))throw Error('INVALID_REFERENCE_OFFSET')
 const offset=BigInt(value);if(offset< -86400000000000n||offset>86400000000000n)throw Error('INVALID_REFERENCE_OFFSET');return offset
}
/** Common time, rounded to the nearest destination sample; never silently clamp. */
export function referencePosition(frame:string,fromRate:number,toRate:number,offsetNs:string,range:ReferenceRange):string|null{
 if(![fromRate,toRate].every(r=>Number.isInteger(r)&&r>=8000&&r<=96000))throw Error('INVALID_REFERENCE_RATE')
 const offset=referenceOffset(offsetNs),p=u64(frame),a=BigInt(fromRate),b=BigInt(toRate),denominator=a*1000000000n,numerator=p*b*1000000000n+offset*a*b
 const rounded=numerator<0n?-((-numerator+denominator/2n)/denominator):(numerator+denominator/2n)/denominator
 const start=u64(range.startFrame),end=u64(range.endFrame);if(end<=start)throw Error('INVALID_REFERENCE_RANGE')
 return rounded<start||rounded>end?null:String(rounded)
}
export type ReferenceDelta={status:'ready'|'unavailable';value:number|null;unit:'LU'|'dB';reason?:string}
export function referenceDelta(kind:'integrated'|'truePeak'|'lra',a:Metric|undefined,b:Metric|undefined,durations:{a:number;b:number}):ReferenceDelta{
 const unit=kind==='truePeak'?'dB':'LU',expected=kind==='integrated'?'LUFS':kind==='truePeak'?'dBTP':'LU'
 if(kind==='lra'&&(durations.a<60||durations.b<60))return {status:'unavailable',value:null,unit,reason:'LRA 范围短于 60 秒，暂不比较'}
 if(!a||!b||a.unit!==expected||b.unit!==expected||a.status!=='ready'||b.status!=='ready'||a.value===null||b.value===null||!Number.isFinite(a.value)||!Number.isFinite(b.value))return {status:'unavailable',value:null,unit,reason:a?.status==='silence'||b?.status==='silence'?'静音读数不计算差值':'等待两份有效测量'}
 return {status:'ready',value:a.value-b.value,unit}
}
