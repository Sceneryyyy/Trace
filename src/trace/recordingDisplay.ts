import {SessionTimeline} from './sessionTimeline'
import type {CaptureRegion} from './sessionStore'
import type {NativeRecordSnapshot,WavePoint,LoudnessPoint,RecordingView} from './shared'
function waveMerge(points:WavePoint[],maximum:number):WavePoint[]{
 if(points.length<=maximum)return points
 const out:WavePoint[]=[]
 for(let i=0;i<maximum;i++){
  const start=Math.floor(i*points.length/maximum),end=Math.floor((i+1)*points.length/maximum)
  const first=points[start],value:WavePoint={frame:first.frame,flags:first.flags,min:[...first.min],max:[...first.max]}
  for(let j=start+1;j<end;j++){const p=points[j];value.frame=p.frame;value.flags|=p.flags;for(let c=0;c<Math.max(value.min.length,p.min.length);c++){value.min[c]=Math.min(value.min[c]??0,p.min[c]??0);value.max[c]=Math.max(value.max[c]??0,p.max[c]??0)}}
  out.push(value)
 }
 return out
}
function loudMerge(points:LoudnessPoint[],maximum:number):LoudnessPoint[]{
 if(points.length<=maximum)return points
 return Array.from({length:maximum},(_,i)=>points[Math.ceil((i+1)*points.length/maximum)-1])
}
export class RecordingDisplay {
 private waves:WavePoint[]=[]
 private loud:LoudnessPoint[]=[]
 close(regions:CaptureRegion[],region:CaptureRegion,snapshot:NativeRecordSnapshot):void{
  const timeline=new SessionTimeline(regions)
  const wave=snapshot.waveform.map((p,i)=>({...p,frame:timeline.frameToMediaNs(region.id,p.frame),flags:p.flags|(i===0&&region.ordinal>1?4:0)}))
  const loud=snapshot.loudnessHistory.map(p=>({...p,frame:timeline.frameToMediaNs(region.id,p.frame)}))
  this.waves=waveMerge([...this.waves,...wave],900);this.loud=loudMerge([...this.loud,...loud],600)
 }
 snapshot(regions:CaptureRegion[],region:CaptureRegion,live?:NativeRecordSnapshot):RecordingView{
  const active=live&&live.id===region.nativeId&&['preparing','recording'].includes(region.status)
  const data=regions.map(r=>active&&r.id===region.id?{...r,frames:live.writtenFrames,startFrame:live.startFrame,endFrameExclusive:live.endFrameExclusive}:r)
  const timeline=new SessionTimeline(data)
  const wave=active?live.waveform.map(p=>({...p,frame:timeline.frameToMediaNs(region.id,p.frame)})):[]
  const loud=active?live.loudnessHistory.map(p=>({...p,frame:timeline.frameToMediaNs(region.id,p.frame)})):[]
  return {durationNs:timeline.durationNs,waveform:waveMerge([...this.waves,...wave],1200),loudnessHistory:loudMerge([...this.loud,...loud],600),
   gapFrames:timeline.positions.slice(1).map(p=>p.mediaStartNs),channelCount:Math.max(1,...regions.map(r=>r.format.channelCount))}
 }
}
