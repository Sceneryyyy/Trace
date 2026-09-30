import type {Metric} from '../shared'

/** Presentation state only; unavailable sources must not regain held numerical readings. */
export type ReadoutAvailability='available'|'measuring'|'analyzing'|'reconnecting'|'unavailable'
export type MetricReadout={value:string;note:string;fault:boolean;ready:boolean}

export function metricReadout(metric:Metric|undefined,availability:ReadoutAvailability='available'):MetricReadout{
 if(availability==='unavailable'||metric?.status==='error'||metric?.status==='gap')return {value:'—',note:'无数据',fault:true,ready:false}
 if(availability==='reconnecting')return {value:'—',note:'重新连接',fault:true,ready:false}
 if(availability==='analyzing')return {value:'—',note:'分析中',fault:false,ready:false}
 if(availability==='measuring'||!metric||metric.status==='insufficient')return {value:'—',note:'测量中',fault:false,ready:false}
 if(metric.status==='silence')return {value:'−∞',note:'',fault:false,ready:false}
 if(metric.value===null)return {value:'—',note:'无数据',fault:true,ready:false}
 return {value:metric.value.toFixed(1).replace('-','−'),note:'',fault:false,ready:true}
}
