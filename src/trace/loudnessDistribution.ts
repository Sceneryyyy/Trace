import type {Metric} from './shared'
import type {ReportRow} from './reportTypes'
export type LoudnessHistogram={minLufs:number;stepLu:number;frames:string[];readyFrames:string;silenceFrames:string;excludedFrames:string;underflowFrames:string;overflowFrames:string}
export type DynamicsMetric={status:'ready'|'unavailable';value:number|null;unit:'LU';definition:string;reason?:string}
export type LoudnessDistribution={version:1;scope:{startFrame:string;endFrame:string};sampleRate:number;momentary:LoudnessHistogram;shortTerm:LoudnessHistogram;plr:DynamicsMetric;psr:{mean:DynamicsMetric;max:DynamicsMetric;readyFrames:string}}
const valid=(m:Metric)=>m.status==='ready'&&m.value!==null&&Number.isFinite(m.value)
class Histogram {
 bins=Array<bigint>(145).fill(0n);ready=0n;silence=0n;excluded=0n;underflow=0n;overflow=0n
 push(m:Metric,frames:bigint,excluded:boolean){if(excluded){this.excluded+=frames;return}if(m.status==='silence'){this.silence+=frames;return}if(!valid(m)){this.excluded+=frames;return}
  if(m.value!< -120)this.underflow+=frames;if(m.value!>=25)this.overflow+=frames
  this.bins[Math.max(0,Math.min(144,Math.floor(m.value!+120)))]+=frames;this.ready+=frames
 }
 snapshot():LoudnessHistogram{return {minLufs:-120,stepLu:1,frames:this.bins.map(String),readyFrames:String(this.ready),silenceFrames:String(this.silence),excludedFrames:String(this.excluded),underflowFrames:String(this.underflow),overflowFrames:String(this.overflow)}}
}
/** Streaming frame weighting, fixed histograms and a bounded 3 s TP queue. */
export class DistributionAccumulator {
 private m=new Histogram();private s=new Histogram()
 private peaks:{end:bigint;db:number;valid:boolean}[]=[]
 private maxima:{end:bigint;db:number;valid:boolean}[]=[]
 private invalidPeaks=0
 private psrFrames=0n;private psrSum=0;private psrMax=-Infinity
 private previous=0n
 constructor(private rate:number){}
 push(row:ReportRow){
  const start=BigInt(row.startFrame),end=BigInt(row.endFrame),frames=end-start
  if(frames<=0n||start!==this.previous)throw Error('INVALID_DISTRIBUTION_TIMELINE');this.previous=end
  const excluded=Boolean((row.flags|row.loudnessFlags)&(4|32))
  this.m.push(row.momentary,frames,excluded);this.s.push(row.shortTerm,frames,excluded)
  const tp=row.channels.map(c=>c.truePeak),peak=Math.max(...tp.filter(valid).map(m=>m.value!)),allValid=!excluded&&tp.every(m=>valid(m)||m.status==='silence')
  const sample={end,db:peak,valid:allValid};this.peaks.push(sample);if(!allValid)this.invalidPeaks++;while(this.maxima.length&&this.maxima[this.maxima.length-1].db<=peak)this.maxima.pop();this.maxima.push(sample);const first=end-BigInt(this.rate)*3n
  while(this.peaks.length&&this.peaks[0].end<=first){const expired=this.peaks.shift()!;if(!expired.valid)this.invalidPeaks--}
  while(this.maxima.length&&this.maxima[0].end<=first)this.maxima.shift()
  if(this.peaks.length>512)throw Error('DISTRIBUTION_CADENCE_EXCEEDED')
  if(end>=BigInt(this.rate)*3n&&valid(row.shortTerm)&&this.invalidPeaks===0){
   const psr=(this.maxima[0]?.db??-Infinity)-row.shortTerm.value!
   if(Number.isFinite(psr)){this.psrFrames+=frames;this.psrSum+=psr*Number(frames);this.psrMax=Math.max(this.psrMax,psr)}
  }
 }
 finish(summary:{integratedToCursor:Metric;maxTruePeak:Metric},scope:{startFrame:string;endFrame:string},complete:boolean):LoudnessDistribution{
  const metric=(value:number|null,definition:string):DynamicsMetric=>({status:complete&&value!==null&&Number.isFinite(value)?'ready':'unavailable',value:complete&&value!==null&&Number.isFinite(value)?value:null,unit:'LU',definition,...(!complete?{reason:'来源质量或数据覆盖不足'}:value===null?{reason:'有效窗口不足或静音'}:{})})
  const plr=valid(summary.integratedToCursor)&&valid(summary.maxTruePeak)?summary.maxTruePeak.value!-summary.integratedToCursor.value!:null
  return {version:1,scope:{...scope},sampleRate:this.rate,momentary:this.m.snapshot(),shortTerm:this.s.snapshot(),plr:metric(plr,'范围最大 TP − 范围 I'),psr:{mean:metric(this.psrFrames?this.psrSum/Number(this.psrFrames):null,'3 秒窗口最大 TP − 同时刻 S；有效时间加权平均'),max:metric(this.psrFrames?this.psrMax:null,'3 秒窗口最大 TP − 同时刻 S；有效窗口最大值'),readyFrames:String(this.psrFrames)}}
 }
}
