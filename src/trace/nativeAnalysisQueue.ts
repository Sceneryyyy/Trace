type Task={priority:number;run:()=>Promise<unknown>;resolve:(value:unknown)=>void;reject:(error:unknown)=>void}
/** Shared by instantaneous and tiled FFT clients; capture/writer never enter this queue. */
export class NativeAnalysisQueue {
 private queued:Task[]=[]
 private active=new Set<Promise<unknown>>()
 private closed=false
 get usage(){return {active:this.active.size,queued:this.queued.length}}
 run<T>(work:()=>Promise<T>,priority=0):Promise<T>{
  if(this.closed)return Promise.reject(Error('NATIVE_ANALYSIS_QUEUE_CLOSED'))
  if(this.queued.length>=4)return Promise.reject(Error('NATIVE_ANALYSIS_QUEUE_FULL'))
  return new Promise<T>((resolve,reject)=>{this.queued.push({priority,run:work,resolve:resolve as (v:unknown)=>void,reject});this.pump()})
 }
 private pump(){while(!this.closed&&this.active.size<2&&this.queued.length){const priority=Math.min(...this.queued.map(t=>t.priority)),index=this.queued.findIndex(t=>t.priority===priority),task=this.queued.splice(index,1)[0]
  const work=Promise.resolve().then(task.run).then(task.resolve,task.reject).finally(()=>{this.active.delete(work);this.pump()});this.active.add(work)
 }}
 async close(){this.closed=true;for(const t of this.queued.splice(0))t.reject(Error('NATIVE_ANALYSIS_QUEUE_CLOSED'));await Promise.allSettled([...this.active])}
}
