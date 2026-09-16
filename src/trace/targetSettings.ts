import type {Metric} from './shared'
export type TargetSettings={version:1;enabled:boolean;preset:'custom'|'ebu-qc-2023'|'ebu-live-2023';integrated:{target:number;tolerance:number}|null;truePeakMax:number|null;lra:{min:number;max:number}|null;momentaryMax:number|null;shortTermMax:number|null}
export const targetPresets={
 'ebu-qc-2023':{name:'EBU R 128 · QC',revision:'2023-11 / §h–i, m',url:'https://tech.ebu.ch/docs/r/r128.pdf',tolerance:.2},
 'ebu-live-2023':{name:'EBU R 128 · 直播参考',revision:'2023-11 / §h, m',url:'https://tech.ebu.ch/docs/r/r128.pdf',tolerance:1}
} as const
export const defaultTargetSettings:TargetSettings={version:1,enabled:false,preset:'custom',integrated:{target:-23,tolerance:1},truePeakMax:-1,lra:null,momentaryMax:null,shortTermMax:null}
export function targetPreset(id:Exclude<TargetSettings['preset'],'custom'>,enabled=true):TargetSettings{return {...structuredClone(defaultTargetSettings),enabled,preset:id,integrated:{target:-23,tolerance:targetPresets[id].tolerance}}}
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)
const bounded=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max
export function validateTargetSettings(value:unknown):TargetSettings {
 if(!object(value)||Object.keys(value).sort().join(',')!=='enabled,integrated,lra,momentaryMax,preset,shortTermMax,truePeakMax,version')throw Error('INVALID_TARGET_SETTINGS')
 const s=value as TargetSettings
 if(s.version!==1||typeof s.enabled!=='boolean'||!['custom','ebu-qc-2023','ebu-live-2023'].includes(s.preset)||
  s.integrated!==null&&(!object(s.integrated)||Object.keys(s.integrated).sort().join(',')!=='target,tolerance'||!bounded(s.integrated.target,-60,0)||!bounded(s.integrated.tolerance,0,10))||
  s.lra!==null&&(!object(s.lra)||Object.keys(s.lra).sort().join(',')!=='max,min'||!bounded(s.lra.min,0,50)||!bounded(s.lra.max,s.lra.min,50))||
  s.truePeakMax!==null&&!bounded(s.truePeakMax,-24,6)||s.momentaryMax!==null&&!bounded(s.momentaryMax,-60,0)||s.shortTermMax!==null&&!bounded(s.shortTermMax,-60,0))throw Error('INVALID_TARGET_SETTINGS')
 if(s.enabled&&s.integrated===null&&s.truePeakMax===null&&s.lra===null&&s.momentaryMax===null&&s.shortTermMax===null)throw Error('EMPTY_TARGETS')
 if(s.preset!=='custom'){
  const p=targetPreset(s.preset,s.enabled)
  if(s.integrated?.target!==p.integrated!.target||s.integrated?.tolerance!==p.integrated!.tolerance||s.truePeakMax!==p.truePeakMax||s.lra!==null||s.momentaryMax!==null||s.shortTermMax!==null)throw Error('MODIFIED_TARGET_PRESET')
 }
 return {version:1,enabled:s.enabled,preset:s.preset,integrated:s.integrated?{target:s.integrated.target,tolerance:s.integrated.tolerance}:null,truePeakMax:s.truePeakMax,lra:s.lra?{min:s.lra.min,max:s.lra.max}:null,momentaryMax:s.momentaryMax,shortTermMax:s.shortTermMax}
}
export function restoreTargetSettings(value:unknown,legacy?:{targetEnabled:boolean;targetLufs:number}):TargetSettings {
 try{return validateTargetSettings(value)}catch{return {...structuredClone(defaultTargetSettings),enabled:legacy?.targetEnabled===true,integrated:{target:legacy&&bounded(legacy.targetLufs,-60,0)?legacy.targetLufs:-23,tolerance:1}}}
}
export function targetKey(s:TargetSettings):string {return JSON.stringify(validateTargetSettings(s))}
export type TargetCheck={id:'integrated'|'truePeak'|'lra'|'momentaryMax'|'shortTermMax';state:'pass'|'fail'|'unavailable'|'disabled';value:number|null;metricStatus:Metric['status'];min:number|null;max:number|null;reason?:string}
export function checkTarget(id:TargetCheck['id'],metric:Metric,min:number|null,max:number|null,enabled=true):TargetCheck {
 const base={id,value:metric.value,metricStatus:metric.status,min,max}
 if(!enabled||min===null&&max===null)return {...base,state:'disabled'}
 if(metric.status==='silence'&&id!=='lra')return {...base,state:min===null?'pass':'fail'}
 if(metric.status!=='ready'||metric.value===null||!Number.isFinite(metric.value))return {...base,state:'unavailable'}
 return {...base,state:min!==null&&metric.value<min||max!==null&&metric.value>max?'fail':'pass'}
}
export function evaluateTargets(s:TargetSettings,metrics:{integrated:Metric;truePeak:Metric;lra:Metric;momentaryMax:Metric;shortTermMax:Metric},durationSeconds:number):{state:TargetCheck['state'];checks:TargetCheck[]} {
 const checks=[checkTarget('integrated',metrics.integrated,s.integrated?s.integrated.target-s.integrated.tolerance:null,s.integrated?s.integrated.target+s.integrated.tolerance:null,s.enabled),
  checkTarget('truePeak',metrics.truePeak,null,s.truePeakMax,s.enabled),checkTarget('lra',metrics.lra,s.lra?.min??null,s.lra?.max??null,s.enabled),
  checkTarget('momentaryMax',metrics.momentaryMax,null,s.momentaryMax,s.enabled),checkTarget('shortTermMax',metrics.shortTermMax,null,s.shortTermMax,s.enabled)]
 const lra=checks[2];if(lra.state!=='disabled'&&durationSeconds<60){lra.state='unavailable';lra.reason='范围短于 60 秒，LRA 不用于目标判定'}
 const selected=checks.filter(c=>c.state!=='disabled')
 return {state:!selected.length?'disabled':selected.some(c=>c.state==='fail')?'fail':selected.some(c=>c.state==='unavailable')?'unavailable':'pass',checks}
}
