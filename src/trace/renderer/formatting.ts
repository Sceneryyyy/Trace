import type {Metric} from '../shared'
export function value(metric?:Metric):string{
 if(!metric||metric.status==='insufficient')return '—'
 if(metric.status==='silence')return '−∞'
 if(metric.status!=='ready'||metric.value===null)return '—'
 return metric.value.toFixed(1).replace('-','−')
}
export function formatBytes(value:string|number):string{
 const bytes=Number(value)
 return bytes>=1073741824?(bytes/1073741824).toFixed(1)+' GiB':bytes>=1048576?(bytes/1048576).toFixed(1)+' MiB':bytes>=1024?(bytes/1024).toFixed(1)+' KiB':bytes+' B'
}
