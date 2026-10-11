import type {Metric} from './shared'
export type LoudnessMatch={enabled:boolean;status:'ready'|'unavailable'|'off';targetLufs:number|null;aDb:number;bDb:number;headroomDbTP:number;reason?:string}
const valid=(m:Metric|undefined,unit:Metric['unit'])=>m?.status==='ready'&&m.unit===unit&&m.value!==null&&Number.isFinite(m.value)
/** Match downwards, preserving at least 1 dBTP of measured output headroom. */
export function loudnessMatch(enabled:boolean,compatible:boolean,a?:{integratedToCursor:Metric;maxTruePeak:Metric},b?:{integratedToCursor:Metric;maxTruePeak:Metric}):LoudnessMatch{
 const base={enabled,targetLufs:null,aDb:0,bDb:0,headroomDbTP:-1}
 if(!enabled)return {...base,status:'off'}
 if(!compatible||!valid(a?.integratedToCursor,'LUFS')||!valid(b?.integratedToCursor,'LUFS')||!valid(a?.maxTruePeak,'dBTP')||!valid(b?.maxTruePeak,'dBTP'))return {...base,status:'unavailable',reason:'需要完整来源、相同计量版本的两份有效范围 I 与 TP；静音、缺口、估计填充或未完成分析不可匹配'}
 const ia=a!.integratedToCursor.value!,ib=b!.integratedToCursor.value!,target=Math.min(ia,ib,ia-1-a!.maxTruePeak.value!,ib-1-b!.maxTruePeak.value!)
 return {...base,status:'ready',targetLufs:target,aDb:target-ia,bDb:target-ib}
}
