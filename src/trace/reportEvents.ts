import type {Metric} from './shared'
import type {TargetSettings} from './targetSettings'
import type {ReportRow,ReportEvent} from './reportTypes'
const valid=(v:Metric)=>v.status==='ready'&&v.value!==null&&Number.isFinite(v.value)
/** Events describe cached windows (10 ms TP, 100 ms loudness), never inferred sample-exact crossings. */
export class ReportEvents {
 private active=new Map<string,ReportEvent>()
 private lastLoudness='0'
 private pendingGap=false
 private pendingError=false
 constructor(private targets:TargetSettings,private emit:(e:ReportEvent)=>void){}
 private update(key:string,failed:boolean,event:ReportEvent,lower=false):void {
  const previous=this.active.get(key)
  if(!failed){if(previous){this.emit(previous);this.active.delete(key)}return}
  if(previous&&previous.endFrame===event.startFrame&&previous.status===event.status){previous.endFrame=event.endFrame;previous.samples+=event.samples;if(event.extreme!==null)previous.extreme=previous.extreme===null?event.extreme:lower?Math.min(previous.extreme,event.extreme):Math.max(previous.extreme,event.extreme)}
  else{if(previous)this.emit(previous);this.active.set(key,{...event})}
 }
 push(row:ReportRow):void {
  const gap=Boolean(row.flags&4)||row.channels.some(c=>[c.samplePeak,c.rms,c.truePeak].some(m=>m.status==='gap')),error=row.channels.some(c=>[c.samplePeak,c.rms,c.truePeak].some(m=>m.status==='error'))
  const event=(kind:ReportEvent['kind'],channel:number|null,extreme:number|null,threshold:number|null,status:ReportEvent['status']='ready',startFrame=row.startFrame,endFrame=row.endFrame):ReportEvent=>({kind,channel,startFrame,endFrame,extreme,threshold,samples:1,status})
  this.update('gap',gap,event('data-gap',null,null,null,'gap'));this.update('error',error,event('data-error',null,null,null,'error'))
  for(let i=0;i<row.channels.length;i++){
   const v=row.channels[i].truePeak,limit=this.targets.truePeakMax
   this.update('tp'+i,this.targets.enabled&&limit!==null&&!gap&&!error&&valid(v)&&v.value!>limit,event('true-peak',i,valid(v)?v.value:null,limit))
  }
  this.pendingGap||=gap;this.pendingError||=error
  if(!row.loudnessUpdated)return
  const start=this.lastLoudness;this.lastLoudness=row.loudnessFrame
  const loudGap=this.pendingGap||Boolean(row.loudnessFlags&4)||[row.momentary,row.shortTerm,row.integrated].some(m=>m.status==='gap'),loudError=this.pendingError||[row.momentary,row.shortTerm,row.integrated].some(m=>m.status==='error');this.pendingGap=false;this.pendingError=false
  this.update('loudness-gap',loudGap,event('loudness-gap',null,null,null,'gap',start,row.loudnessFrame));this.update('loudness-error',loudError,event('loudness-error',null,null,null,'error',start,row.loudnessFrame))
  const loud=(kind:ReportEvent['kind'],m:Metric,limit:number|null,lower=false)=>{
   const silence=m.status==='silence',ready=valid(m),failed=this.targets.enabled&&limit!==null&&!loudGap&&!loudError&&(ready?(lower?m.value!<limit:m.value!>limit):lower&&silence)
   this.update(kind,failed,event(kind,null,ready?m.value:null,limit,silence?'silence':'ready',start,row.loudnessFrame),lower)
  }
  const i=this.targets.integrated
  loud('integrated-high',row.integrated,i?i.target+i.tolerance:null)
  loud('integrated-low',row.integrated,i?i.target-i.tolerance:null,true)
  loud('momentary-high',row.momentary,this.targets.momentaryMax);loud('short-term-high',row.shortTerm,this.targets.shortTermMax)
 }
 finish():void {for(const event of this.active.values())this.emit(event);this.active.clear()}
}
