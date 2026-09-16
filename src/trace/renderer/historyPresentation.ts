import type {MeterSnapshot,PlaybackView,TraceState} from '../shared'

type Target={id:string;generation:string;startFrame:string;endFrame:string}
function matches(frame:MeterSnapshot|null,target:Target):boolean{
 return Boolean(frame?.sourceKind==='file'&&frame.sourceId===target.id&&frame.playback?.generation===target.generation&&
  frame.fileView?.startFrame===target.startFrame&&frame.fileView?.endFrame===target.endFrame)
}

/** Hold the last complete presentation while the next cursor request is in flight. */
export class HistoryPresentation{
 private last:MeterSnapshot|null=null
 private pending:{target:Target;resolve:()=>void}|null=null
 get snapshot():MeterSnapshot|null{return this.last}
 accept(frame:MeterSnapshot,state:TraceState):boolean{
  if(this.last&&frame.eventSequence<=this.last.eventSequence)return false
  if(frame.sourceKind==='file'){
   const file=state.playback
   if(!file||file.error?.startsWith('FILE_SNAPSHOT_FAILED:')||!matches(frame,file))return false
  }else if(state.playback||frame.stateRevision<state.revision||frame.sourceId!==state.deviceId)return false
  this.last=frame
  if(this.pending&&matches(frame,this.pending.target))this.cancel()
  return true
 }
 reconcile(state:TraceState):void{
  const target=this.pending?.target,file=state.playback
  if(target&&(!file||file.error||file.id!==target.id||file.generation!==target.generation||
   file.startFrame!==target.startFrame||file.endFrame!==target.endFrame))this.cancel()
 }
 waitFor(file:PlaybackView|null|undefined):Promise<void>{
  if(!file||file.error||matches(this.last,file))return Promise.resolve()
  this.cancel()
  return new Promise(resolve=>{this.pending={target:{id:file.id,generation:file.generation,startFrame:file.startFrame,endFrame:file.endFrame},resolve}})
 }
 cancel():void{const pending=this.pending;this.pending=null;pending?.resolve()}
}
