import {lstat,realpath,unlink} from 'node:fs/promises'
import {join,sep} from 'node:path'
import {analyzeFiles,hashFiles} from './fileJobs'
import type {RecordingService} from './recording'
import type {ExportService} from './exportService'
import type {PlaybackService} from './playbackService'
import type {AnalysisService} from './analysisService'
const stillPresent=async(file:string):Promise<boolean>=>{
 try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('INVALID_RETENTION_SOURCE');return true}
 catch(error){if(['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code||''))return false;throw error}
}
export class SourceRetention {
 usesSource?:(takeId:string)=>boolean
 private pending=new Set<string>()
 private running:Promise<void>|undefined
 private current:string|undefined
 private controller:AbortController|undefined
 private paused=false
 private closing=false
 constructor(private recordings:RecordingService,private exporter:ExportService,private playback:PlaybackService,private analyses:AnalysisService,private nativePath:string,private changed:()=>void){}
 forget(id:string):void{this.pending.delete(id)}
 schedule():void{
  if(this.closing)return
  for(const take of this.recordings.sessions()){
   const d=take.document
   if(this.current===d.sessionId||d.preset.keepOriginal!==false||!['ready','recovered'].includes(d.status)||['removed','kept','error'].includes(d.retention?.phase||''))continue
   const output=d.preset.format?d.exports?.some(r=>r.automatic&&r.phase==='ready'):d.assets.some(a=>a.role==='deliverable'&&a.state==='ready')
   if(!output){
    if(!d.preset.format&&!d.assets.some(a=>a.role==='deliverable')&&d.status==='ready'){d.retention={phase:'kept',error:null};void take.save().catch(()=>{})}
    continue
   }
   this.pending.add(d.sessionId)
  }
  this.pump()
 }
 private pump():void{
  if(this.paused||this.closing||this.running)return
  const id=[...this.pending].find(id=>!this.usesSource?.(id)&&(this.playback.view()?.takeId!==id||this.playback.view()?.role==='export'))
  if(!id||this.exporter.usesSource(id))return
  this.pending.delete(id);this.current=id;this.controller=new AbortController()
  this.running=this.run(id,this.controller.signal).finally(()=>{this.current=undefined;this.controller=undefined;this.running=undefined;this.changed();this.pump()})
 }
 private async run(id:string,signal:AbortSignal):Promise<void>{
  const take=this.recordings.session(id),d=take.document
  try{
   if(d.preset.keepOriginal!==false||['removed','kept'].includes(d.retention?.phase||''))return
   d.retention={phase:'verifying',error:null};this.changed()
   const output=[...(d.exports||[])].reverse().find(r=>r.automatic&&r.phase==='ready')
   const source=d.preset.format&&output?await this.exporter.resolve(id,output.id):await this.recordings.analysisSource(id,'deliverable')
   const analyzed=await analyzeFiles(this.nativePath,source.sources,source.cacheRoot,{signal,range:source.decodeRange,mediaIdentity:source.mediaIdentity})
   if(analyzed.manifest.frames!==source.frames)throw Error('RETENTION_OUTPUT_FRAME_MISMATCH')
   await this.analyses.cancelSources(id)
   if(signal.aborted)throw Error('RETENTION_PAUSED')
   if(this.playback.view()?.takeId===id&&this.playback.view()?.role!=='export'||this.exporter.usesSource(id)||this.usesSource?.(id))throw Error('RETENTION_PAUSED')
   const base=await realpath(take.directory),audio=await realpath(join(base,'audio'))
   if(!audio.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_RETENTION_DIRECTORY')
   const candidates=d.assets.filter(a=>['source','recovered','session'].includes(a.role)&&a.state!=='removed'&&a.state!=='superseded')
   const files:string[]=[]
   for(const asset of candidates){
    if(!/^audio\/[^/\\\0]+\.wav$/i.test(asset.relativePath)||!asset.hash)throw Error('RETENTION_SOURCE_IDENTITY_MISSING')
    const file=join(base,asset.relativePath)
    try{const info=await lstat(file),resolved=await realpath(file);if(info.isSymbolicLink()||!info.isFile()||!resolved.toLowerCase().startsWith((audio+sep).toLowerCase()))throw Error('INVALID_RETENTION_SOURCE');files.push(resolved)}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'&&asset.state==='removing'){asset.state='removed';files.push('')}else throw error}
   }
   const existing=files.map((p,i)=>({p,i})).filter(v=>v.p),hashes=existing.length?await hashFiles(existing.map(v=>v.p),{signal}):[]
   if(existing.some((v,i)=>hashes[i]!==candidates[v.i].hash))throw Error('RETENTION_SOURCE_CHANGED')
   if(signal.aborted)throw Error('RETENTION_PAUSED')
   if(this.usesSource?.(id)||this.playback.view()?.takeId===id&&this.playback.view()?.role!=='export'||this.exporter.usesSource(id))throw Error('RETENTION_PAUSED')
   const previous=candidates.map(a=>a.state)
   d.retention={phase:'removing',error:null};for(const asset of candidates)if(asset.state!=='removed')asset.state='removing'
   await take.save()
   // After this persisted commit, finish the small deletion batch before allowing
   // a new recording. No unique source is removed before output validation.
   let removalError:unknown
   for(let i=0;i<files.length;i++){
    try{if(files[i])await unlink(files[i]);candidates[i].state='removed'}
    catch(error){removalError=error;break}
   }
   if(removalError){
    // The intent was committed for the whole batch, so a file that survived the
    // failure would stay hidden behind 'removing' forever — it is filtered out
    // of the library, analysis and recovery. Give survivors their state back.
    let inspectionError:unknown
    for(let i=0;i<candidates.length;i++){
     if(candidates[i].state!=='removing')continue
     let present=true
     try{if(files[i])present=await stillPresent(files[i])}catch(error){inspectionError=error}
     candidates[i].state=present?(previous[i]==='removing'?undefined:previous[i]):'removed'
    }
    try{await take.save()}catch{throw Error('RETENTION_REPAIR_PERSIST_FAILED')}
    if(inspectionError)throw inspectionError
    throw removalError
   }
   d.retention={phase:'removed',error:null};await take.event('source.retention.completed',{assetIds:candidates.map(a=>a.assetId),outputAnalysisKey:analyzed.manifest.cacheKey});await take.save()
  }catch(error){
   // Any unconfirmed 'removing' entry must stay discoverable, even if the
   // initial intent save or the rollback save failed. Missing files are still
   // reported by LibraryService rather than silently treated as complete.
   for(const asset of d.assets)if(asset.state==='removing')delete asset.state
   if(signal.aborted||String(error).includes('RETENTION_PAUSED')){d.retention={phase:'pending',error:null};this.pending.add(id)}
   else d.retention={phase:'error',error:String(error)}
   await take.save().catch(()=>{})
  }
 }
 async pause():Promise<void>{this.paused=true;this.controller?.abort();await this.running}
 resume():void{if(this.closing)return;this.paused=false;this.schedule()}
 async retry(id:string):Promise<void>{const take=this.recordings.session(id);take.document.retention={phase:'pending',error:null};await take.save();this.schedule()}
 async shutdown():Promise<void>{this.closing=true;await this.pause()}
 active():boolean{return Boolean(this.current)}
}
