import { randomUUID } from 'node:crypto'
import { analyzeFiles } from './fileJobs'
import { AnalysisCache } from './analysisCache'
import type { AnalyzeJobResult } from './analysisWorker'
import type { AnalysisJobView, AnalysisRole } from './shared'
export type AnalysisSource = {takeId:string;role:AnalysisRole;regionId?:string;exportId?:string;label:string;sources:string[];cacheRoot:string;sampleRate:number;channelCount:number;frames:string;mediaIdentity?:string;decodeRange?:{startFrame:string;endFrame:string};range?:{startFrame:string;endFrame:string}}
type Job={view:AnalysisJobView;source:AnalysisSource;controller?:AbortController;result?:AnalyzeJobResult;cancelled:boolean;suspended:boolean;repairs:number}
const terminal=(phase:string)=>['ready','failed','cancelled'].includes(phase)
export class AnalysisService {
  private jobs=new Map<string,Job>()
  private retained=new Set<string>()
  private current:Job|undefined
  private currentTask:Promise<void>|undefined
  private paused=false
  private closing=false
  private cache:{id:string;value:AnalysisCache}|undefined
  constructor(private nativePath:string,private changed:(control:boolean)=>void,private runAnalysis:typeof analyzeFiles=analyzeFiles){}
  retain(id:string):void{if(!this.jobs.has(id))throw Error('UNKNOWN_ANALYSIS_JOB');if(!this.retained.has(id)&&this.retained.size>=8)throw Error('ANALYSIS_REFERENCE_LIMIT');this.retained.add(id)}
  release(id:string):void{this.retained.delete(id)}
  snapshots():AnalysisJobView[]{return [...this.jobs.values()].reverse().map(job=>({...job.view}))}
  start(source:AnalysisSource):string {
    if(this.closing)throw Error('APP_CLOSING')
    const running=[...this.jobs.values()].find(job=>job.source.takeId===source.takeId&&job.source.role===source.role&&job.source.regionId===source.regionId&&job.source.exportId===source.exportId&&JSON.stringify(job.source.range)===JSON.stringify(source.range)&&job.source.mediaIdentity===source.mediaIdentity&&!terminal(job.view.phase))
    if(running)return running.view.id
    if([...this.jobs.values()].filter(job=>!terminal(job.view.phase)).length>=8)throw Error('ANALYSIS_QUEUE_FULL')
    const id=randomUUID()
    this.jobs.set(id,{source,cancelled:false,suspended:false,repairs:0,view:{id,takeId:source.takeId,role:source.role,regionId:source.regionId,exportId:source.exportId,selectionRange:source.range,label:source.label,
      phase:'queued',frames:'0',totalFrames:source.frames,error:null,sampleRate:source.sampleRate,channelCount:source.channelCount}})
    while(this.jobs.size>64){
      const oldest=[...this.jobs.values()].find(job=>terminal(job.view.phase)&&!this.retained.has(job.view.id))
      if(!oldest)break
      this.jobs.delete(oldest.view.id);if(this.cache?.id===oldest.view.id)this.cache=undefined
    }
    this.changed(true);this.pump();return id
  }
  cancel(id:string):void{
    const job=this.jobs.get(id);if(!job)throw Error('UNKNOWN_ANALYSIS_JOB')
    if(terminal(job.view.phase))return
    job.cancelled=true;job.suspended=false
    if(job===this.current)job.controller?.abort()
    else{job.view.phase='cancelled';this.changed(true)}
  }
  async pauseForRecording():Promise<void>{
    this.paused=true
    if(this.current){this.current.suspended=true;this.current.controller?.abort()}
    await this.currentTask
  }
  setRecordingBusy(value:boolean):void {
    if(value){void this.pauseForRecording();return}
    this.paused=false;this.pump()
  }
  private pump():void {
    if(this.current||this.paused||this.closing)return
    const job=[...this.jobs.values()].find(item=>item.view.phase==='queued'&&!item.cancelled)
    if(!job)return
    this.current=job;job.suspended=false;job.controller=new AbortController();job.view.phase='hashing';job.view.error=null;this.changed(true)
    this.currentTask=this.runAnalysis(this.nativePath,job.source.sources,job.source.cacheRoot,{signal:job.controller.signal,mediaIdentity:job.source.mediaIdentity,range:job.source.range?{startFrame:(BigInt(job.source.decodeRange?.startFrame||'0')+BigInt(job.source.range.startFrame)).toString(),endFrame:(BigInt(job.source.decodeRange?.startFrame||'0')+BigInt(job.source.range.endFrame)).toString()}:job.source.decodeRange,progress:progress=>{
      if(job.cancelled||job.suspended||this.closing)return
      const phase=progress.phase==='ready'?'verifying':progress.phase
      const control=phase!==job.view.phase
      job.view.phase=phase;job.view.frames=progress.frames
      if(progress.totalFrames!=='0')job.view.totalFrames=progress.totalFrames
      this.changed(control)
    }}).then(result=>{
      if(job.cancelled||job.suspended||this.closing)throw Error('ANALYSIS_CANCELLED')
      const m=result.manifest
      if(m.frames!==job.source.frames||m.sampleRate!==job.source.sampleRate||m.channelCount!==job.source.channelCount)throw Error('ANALYSIS_ASSET_CHANGED')
      job.result=result;job.view.phase='ready';job.view.frames=m.frames;job.view.totalFrames=m.frames
      job.view.summary=m.summary;job.view.cacheKey=m.cacheKey
    }).catch(error=>{
      if(job.suspended&&!job.cancelled&&!this.closing){job.view.phase='queued';job.view.frames='0';job.view.error=null}
      else if(job.cancelled||this.closing){job.view.phase='cancelled';job.view.error=null}
      else{job.view.phase='failed';job.view.error=String(error)}
    }).finally(()=>{
      job.controller=undefined;this.current=undefined;this.currentTask=undefined;this.changed(true);this.pump()
    })
  }
  private async readyCache(id:string):Promise<AnalysisCache>{
    const job=this.jobs.get(id)
    if(!job||job.view.phase!=='ready'||!job.result)throw Error('ANALYSIS_NOT_READY')
    if(this.cache?.id===id)return this.cache.value
    const value=await AnalysisCache.open(job.result.directory,job.result.manifest.cacheKey)
    this.cache={id,value};return value
  }
  private repair(id:string,error:unknown):void{
    if(!String(error).includes('CORRUPT_CACHE')&&(error as NodeJS.ErrnoException).code!=='ENOENT')return
    const job=this.jobs.get(id)
    if(!job||job.view.phase!=='ready')return
    this.cache=undefined;job.result=undefined;job.view.summary=undefined
    if(++job.repairs>2){job.view.phase='failed';job.view.error='缓存无法通过检查，请重新分析文件。';this.changed(true);return}
    job.view.phase='queued';job.view.frames='0';job.view.error=null;job.cancelled=false
    this.changed(true);this.pump()
  }
  async metrics(id:string,positionFrame:string){
    try{return await (await this.readyCache(id)).metrics(positionFrame)}
    catch(error){this.repair(id,error);throw error}
  }
  async timeline(id:string,startFrame:string,endFrame:string,width:number){
    try{
      const cache=await this.readyCache(id)
      const [waveform,loudnessHistory]=await Promise.all([cache.waveform(startFrame,endFrame,width),cache.loudness(startFrame,endFrame,Math.min(width,600))])
      return {waveform,loudnessHistory,totalFrames:cache.manifest.frames,sampleRate:cache.manifest.sampleRate}
    }catch(error){this.repair(id,error);throw error}
  }
  async forgetTake(takeId:string,exportId?:string):Promise<void>{
    const matches=(job:Job)=>job.source.takeId===takeId&&(!exportId||job.source.exportId===exportId)
    for(const job of this.jobs.values())if(matches(job)&&!terminal(job.view.phase))this.cancel(job.view.id)
    if(this.current&&matches(this.current))await this.currentTask
    for(const [id,job]of this.jobs)if(matches(job)){this.jobs.delete(id);this.retained.delete(id);if(this.cache?.id===id)this.cache=undefined}
    this.changed(true)
  }
  async cancelSources(takeId:string):Promise<void>{
    for(const job of this.jobs.values())if(job.source.takeId===takeId&&job.source.role!=='export'&&job.source.role!=='deliverable'&&!terminal(job.view.phase))this.cancel(job.view.id)
    if(this.current?.source.takeId===takeId&&this.current.source.role!=='export'&&this.current.source.role!=='deliverable')await this.currentTask
  }
  async shutdown():Promise<void>{
    this.closing=true;this.paused=true
    for(const job of this.jobs.values())if(!terminal(job.view.phase)){job.cancelled=true;if(job!==this.current)job.view.phase='cancelled'}
    this.current?.controller?.abort();await this.currentTask;this.cache=undefined
  }
}
