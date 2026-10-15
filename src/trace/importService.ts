import {readMetadata} from './metadataFile'
import {lstat,readdir,realpath} from 'node:fs/promises'
import {join,resolve,sep} from 'node:path'
import type {AssetFormat} from './assetFormat'
import {ImportStore,type ImportedDocument,type StoredImportedAsset} from './importStore'
import {decodeImport,fingerprintImport,readImportedPCM,removeImportedPCM,type ImportedPCM} from './importMedia'
import {clearOwnedCache} from './libraryStorage'
import {validateTakeName} from './naming'
import type {MediaTools,MediaProgress} from './mediaTypes'
import type {ExportView} from './exportTypes'
import type {AnalysisSource} from './analysisService'
export type ImportView={id:string;name:string;sourceName:string;createdAt:string;status:ImportedDocument['status'];error:string|null;revision:number;format?:AssetFormat;frames?:string;phase?:'queued'|'hashing'|'decoding'|'verifying'|'ready'|'failed'|'cancelled';fraction:number;hasCache:boolean}
type Job={id:string;phase:NonNullable<ImportView['phase']>;fraction:number;acceptChanged:boolean;cancelled:boolean;suspended:boolean;controller?:AbortController}
type Ops={decode:typeof decodeImport;fingerprint:typeof fingerprintImport;read:typeof readImportedPCM;remove:typeof removeImportedPCM}
const operations:Ops={decode:decodeImport,fingerprint:fingerprintImport,read:readImportedPCM,remove:removeImportedPCM}
const terminal=(phase:Job['phase'])=>['ready','failed','cancelled'].includes(phase)
const missing=(error:unknown)=>['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code||'')
const check=(signal:AbortSignal)=>{if(signal.aborted)throw Error('IMPORT_CANCELLED')}
export class ImportService {
 readonly store:ImportStore
 private assets=new Map<string,StoredImportedAsset>()
 private jobs=new Map<string,Job>()
 private current?:Job
 private work?:Promise<void>
 private paused=false
 private closing=false
 private holds=new Set<string>()
 private epochs=new Map<string,number>()
 private epoch(id:string){return this.epochs.get(id)||0}
 private invalidate(id:string){this.epochs.set(id,this.epoch(id)+1)}
 private creating:Promise<unknown>=Promise.resolve()
 private reservations=0
 private reads=new Map<string,{controller:AbortController;promise:Promise<AnalysisSource>}>()
 private refreshing?:Promise<void>
 private refreshController?:AbortController
 private exportAvailability=new Map<string,'present'|'missing'|'unavailable'>()
 exportView(value:ExportView):ExportView{return {...value,availability:this.exportAvailability.get(value.id)}}
 issues:Array<{id:string;error:string}>=[]
 constructor(root:string,private tools:MediaTools,private changed:()=>void,private release:(id:string)=>Promise<void>,private canMutate:()=>boolean=()=>true,private ops:Ops=operations){this.store=new ImportStore(root)}
 folder(id:string):string{return this.session(id).directory}
 sourceFile(id:string):string{return this.session(id).document.sourcePath}
 async initialize():Promise<void>{const result=await this.store.initialize();this.assets=new Map(result.assets.map(a=>[a.document.sessionId,a]));this.issues=result.issues;this.changed()}
 has(id:string):boolean{return Boolean(this.assets.has(id)&&!this.assets.get(id)!.document.archived)}
 session(id:string):StoredImportedAsset{const a=this.assets.get(id);if(!a||a.document.archived)throw Error('UNKNOWN_IMPORTED_ASSET');return a}
 sessions():StoredImportedAsset[]{return [...this.assets.values()].filter(a=>!a.document.archived)}
 preparing(id:string):boolean{return Boolean(this.jobs.has(id)&&!terminal(this.jobs.get(id)!.phase))}
 views():ImportView[]{return this.sessions().map(a=>{const d=a.document,j=this.jobs.get(d.sessionId),finishing=this.current?.id===d.sessionId&&j&&terminal(j.phase);return {id:d.sessionId,name:d.name,sourceName:d.sourceName,createdAt:d.createdAt,status:j&&(!terminal(j.phase)||finishing)?j.phase==='queued'?'unprepared':'preparing':d.status,error:d.error,revision:d.revision,format:d.cache?.format,frames:d.cache?.frames,phase:finishing?'verifying':j?.phase,fraction:j?.fraction||0,hasCache:Boolean(d.cache)}}).reverse()}
 private count(){return this.reservations+[...this.jobs.values()].filter(j=>!terminal(j.phase)).length}
 async add(file:string):Promise<string>{
  if(this.closing)throw Error('APP_CLOSING');if(this.count()>=4)throw Error('IMPORT_QUEUE_FULL');this.reservations++
  const created=this.creating.then(async()=>{if(this.closing)throw Error('APP_CLOSING');const canonical=await realpath(resolve(file)),existing=this.sessions().find(a=>a.document.sourcePath.toLowerCase()===canonical.toLowerCase());if(existing){const id=existing.document.sessionId;if(this.current?.id===id&&terminal(this.current.phase))await this.work;if(existing.document.status!=='ready'&&!this.preparing(id)&&this.current?.id!==id&&!this.holds.has(id)){this.invalidate(id);this.jobs.set(id,{id,phase:'queued',fraction:0,acceptChanged:false,cancelled:false,suspended:false});this.changed()}return id}
   const a=await this.store.create(canonical);this.assets.set(a.document.sessionId,a);this.jobs.set(a.document.sessionId,{id:a.document.sessionId,phase:'queued',fraction:0,acceptChanged:false,cancelled:false,suspended:false});this.changed();return a.document.sessionId})
  this.creating=created.catch(()=>{});try{return await created}finally{this.reservations--;this.pump()}
 }
 prepare(id:string,acceptChanged=false):void{
  if(this.closing)throw Error('APP_CLOSING');this.session(id);if(this.holds.has(id)||this.current?.id===id)throw Error('IMPORT_SOURCE_BUSY');if(this.preparing(id))return;if(!this.canMutate())throw Error('LIBRARY_BUSY');if(this.count()>=4)throw Error('IMPORT_QUEUE_FULL')
  this.invalidate(id);this.jobs.set(id,{id,phase:'queued',fraction:0,acceptChanged,cancelled:false,suspended:false});this.changed();this.pump()
 }
 setRecordingBusy(value:boolean):void{this.paused=value;if(value){this.refreshController?.abort();for(const read of this.reads.values())read.controller.abort()}if(value&&this.current){this.current.suspended=true;this.current.controller?.abort()}else if(!value)this.pump()}
 resume():void{this.pump()}
 cancel(id:string):void{const j=this.jobs.get(id);if(!j||terminal(j.phase))return;j.cancelled=true;j.suspended=false;if(j===this.current)j.controller?.abort();else j.phase='cancelled';this.changed()}
 private pump():void{
  if(this.current||this.paused||this.closing||!this.canMutate())return
  const j=[...this.jobs.values()].find(j=>j.phase==='queued'&&!this.holds.has(j.id));if(!j)return;this.current=j;j.controller=new AbortController();j.suspended=false;j.phase='hashing';j.fraction=0;this.changed()
  this.work=this.run(j).catch(error=>{const a=this.assets.get(j.id);j.phase='failed';if(a)a.document.error=String(error);console.error('TRACE_IMPORT_TASK_FAILED',String(error))}).finally(()=>{j.controller=undefined;this.current=undefined;this.work=undefined;this.changed();this.pump()})
 }
 private async run(j:Job):Promise<void>{
  const a=this.session(j.id),d=a.document,signal=j.controller!.signal,before={sourcePath:d.sourcePath,source:d.source,cache:d.cache,revision:d.revision};let generated:ImportedPCM|undefined,published=false
  try{
   const reading=this.reads.get(j.id);reading?.controller.abort();await reading?.promise.catch(()=>{});await this.release(j.id);check(signal);d.status='preparing';d.error=null;await a.save();this.changed()
   const fingerprint=await this.ops.fingerprint(d.sourcePath,signal);check(signal);if(before.source&&fingerprint.sha256!==before.source.sha256&&!j.acceptChanged)throw Error('IMPORT_SOURCE_CHANGED')
   const progress=(p:MediaProgress)=>{if(signal.aborted)return;j.phase=p.phase==='decoding'?'decoding':p.phase==='verifying'?'verifying':'hashing';j.fraction=p.fraction;this.changed()}
   generated=await this.ops.decode(this.tools,d.sourcePath,join(a.directory,'decoded'),{signal,progress});check(signal)
   if(generated.source.sha256!==fingerprint.sha256)throw Error('IMPORT_SOURCE_CHANGED')
   d.sourcePath=generated.source.path;d.source=generated.source;d.cache={id:generated.id,format:generated.format,frames:generated.frames,decoderSha256:generated.decoderSha256,mediaIdentity:generated.mediaIdentity}
   if(before.cache&&before.cache.mediaIdentity!==generated.mediaIdentity)d.revision++
   d.status='ready';d.error=null;await a.save();published=true;j.phase='ready';j.fraction=1
   if(before.cache&&before.cache.id!==generated.id)try{await this.ops.remove(join(a.directory,'decoded'),join(a.directory,'decoded',before.cache.id))}catch(error){if(!missing(error)){d.error='旧缓存清理未完成：'+String(error);await a.save()}}
  }catch(error){
   if(!published){d.sourcePath=before.sourcePath;d.source=before.source;d.cache=before.cache;d.revision=before.revision
    if(generated)try{await this.ops.remove(join(a.directory,'decoded'),generated.directory)}catch(cleanup){console.warn('TRACE_IMPORT_CLEANUP_FAILED',String(cleanup))}
    if(j.suspended&&!j.cancelled&&!this.closing){j.phase='queued';j.fraction=0;d.status='unprepared';d.error=null}
    else if(signal.aborted||j.cancelled){j.phase='cancelled';d.status='unprepared';d.error=null}
    else{j.phase='failed';d.status=missing(error)?'missing':String(error).includes('SOURCE_CHANGED')?'changed':'failed';d.error=String(error)}
    try{await a.save()}catch(saveError){d.error=(d.error||'')+'；元数据未保存：'+String(saveError)}
   }else{d.error='旧缓存清理未完成：'+String(error)}
  }
 }
 async analysisSource(id:string):Promise<AnalysisSource>{
  const existing=this.reads.get(id);if(existing)return existing.promise
  const a=this.session(id),d=a.document;if(this.closing||this.holds.has(id)||this.preparing(id))throw Error('IMPORT_SOURCE_BUSY');if(d.status!=='ready'||!d.cache||!d.source)throw Error('IMPORT_NOT_READY')
  const controller=new AbortController(),epoch=this.epoch(id),revision=d.revision,cached=structuredClone(d.cache),source=structuredClone(d.source)
  const promise=(async()=>{try{
   const actual=await this.ops.fingerprint(d.sourcePath,controller.signal);if(actual.sha256!==source.sha256)throw Error('IMPORT_SOURCE_CHANGED')
   const decoded=await this.ops.read(join(a.directory,'decoded'),cached.id,source.sha256,controller.signal)
   if(decoded.mediaIdentity!==cached.mediaIdentity||decoded.frames!==cached.frames||decoded.decoderSha256!==this.tools.ffmpegSha256||(['format','sampleRate','channelCount','encoding','container','bitrate'] as const).some(key=>decoded.format[key]!==cached.format[key]))throw Error('IMPORT_CACHE_IDENTITY_CHANGED')
   check(controller.signal);if(this.epoch(id)!==epoch||this.holds.has(id)||d.status!=='ready'||d.revision!==revision||d.cache?.id!==cached.id)throw Error('IMPORT_SOURCE_CHANGED')
   return {continuity:'complete' as const,takeId:id,role:'source' as const,label:d.name+' · 外部素材',sources:decoded.files.map(f=>join(decoded.directory,f.file)),cacheRoot:join(a.directory,'cache'),sampleRate:decoded.format.sampleRate,channelCount:decoded.format.channelCount,frames:decoded.frames,mediaIdentity:decoded.mediaIdentity,assetFormat:decoded.format}
  }catch(error){if(!controller.signal.aborted&&!this.holds.has(id)&&this.epoch(id)===epoch){d.status=missing(error)?'missing':String(error).includes('SOURCE_CHANGED')?'changed':'failed';d.error=String(error);await a.save().catch(()=>{});this.changed()}throw error}
  finally{this.reads.delete(id)}})()
  this.reads.set(id,{controller,promise});return promise
 }
 private async held<T>(id:string,action:(a:StoredImportedAsset)=>Promise<T>):Promise<T>{
  const a=this.session(id);if(this.paused||this.holds.has(id)||!this.canMutate())throw Error('LIBRARY_BUSY');this.holds.add(id);this.invalidate(id)
  try{this.cancel(id);this.reads.get(id)?.controller.abort();if(this.current?.id===id)await this.work;await this.reads.get(id)?.promise.catch(()=>{});await this.release(id);await a.settled().catch(()=>{});return await action(a)}
  finally{this.holds.delete(id);this.changed();this.pump()}
 }
 private async clear(a:StoredImportedAsset):Promise<void>{
  delete a.document.cache;a.document.status='unprepared';a.document.error=null;await a.save()
  await clearOwnedCache(a)
  const root=join(a.directory,'decoded');let entries:string[]
  try{entries=await readdir(root)}catch(error){if(missing(error))return;throw error}
  for(const id of entries)await this.ops.remove(root,join(root,String(id)))
 }
 async clearCache(id:string):Promise<void>{await this.held(id,a=>this.clear(a))}
 async remove(id:string):Promise<void>{await this.held(id,async a=>{await this.clear(a);a.document.archived=true;try{await a.save()}catch(error){a.document.archived=false;throw error}this.jobs.delete(id)})}
 async removeExport(id:string,exportId:string,trash:(path:string)=>Promise<void>):Promise<void>{
  if(!/^[a-f0-9-]{36}$/.test(exportId))throw Error('INVALID_IMPORTED_EXPORT')
  await this.held(id,async a=>{const record=a.document.exports.find(r=>r.id===exportId);if(!record)throw Error('UNKNOWN_EXPORT_JOB');await a.save()
   const directory=join(a.directory,'exports',exportId)
   try{const parent=await lstat(join(a.directory,'exports')),info=await lstat(directory),actual=await realpath(directory)
    if(parent.isSymbolicLink()||!parent.isDirectory()||info.isSymbolicLink()||!info.isDirectory()||actual.toLowerCase()!==directory.toLowerCase())throw Error('INVALID_EXPORT_DIRECTORY')
    const metadata=join(actual,'export.json'),meta=await lstat(metadata);if(!meta.isFile()||meta.isSymbolicLink()||meta.size>4*1024*1024)throw Error('INVALID_EXPORT_MANIFEST')
    const owner=JSON.parse(await readMetadata(metadata,4*1024*1024,'LIBRARY_IDENTITY_CHANGED'));if(owner.id!==exportId||owner.source?.takeId!==id)throw Error('LIBRARY_IDENTITY_CHANGED')
    await trash(actual)
   }catch(error){if(!missing(error))throw error}
   const previous=a.document.exports;a.document.exports=previous.filter(r=>r.id!==exportId);try{await a.save()}catch(error){a.document.exports=previous;throw error}this.exportAvailability.delete(exportId)
  })
 }
 async rename(id:string,name:string):Promise<void>{const a=this.session(id),old=a.document.name;a.document.name=validateTakeName(name);try{await a.save()}catch(error){a.document.name=old;throw error}this.changed()}
 async relocate(id:string,path:string):Promise<void>{
  await this.held(id,async a=>{const fingerprint=await this.ops.fingerprint(path);if(a.document.source&&a.document.source.sha256!==fingerprint.sha256)throw Error('IMPORT_RELOCATE_CONTENT_CHANGED');if(fingerprint.path.toLowerCase().startsWith((this.store.root+sep).toLowerCase()))throw Error('IMPORT_SOURCE_INSIDE_CACHE');const old={sourcePath:a.document.sourcePath,source:a.document.source,sourceName:a.document.sourceName,status:a.document.status,error:a.document.error};a.document.sourcePath=fingerprint.path;a.document.sourceName=fingerprint.name;a.document.source=fingerprint;a.document.status=a.document.cache?'ready':'unprepared';a.document.error=null;try{await a.save()}catch(e){Object.assign(a.document,old);throw e}})
 }
 async refresh():Promise<void>{
  if(this.paused||this.closing)return;if(this.refreshing)return this.refreshing
  const controller=new AbortController();this.refreshController=controller
  this.refreshing=(async()=>{for(const a of this.sessions()){if(controller.signal.aborted)return;const d=a.document,epoch=this.epoch(d.sessionId),valid=()=>!controller.signal.aborted&&this.epoch(d.sessionId)===epoch&&!this.holds.has(d.sessionId)&&!d.archived&&!this.preparing(d.sessionId);if(this.holds.has(d.sessionId)||this.preparing(d.sessionId))continue
   let next:ImportedDocument['status']=d.status,error=d.error
   try{const s=await lstat(d.sourcePath);if(!s.isFile()||s.isSymbolicLink())throw Error('INVALID_IMPORT_FILE');if(d.source&&(String(s.size)!==d.source.bytes||s.mtimeMs!==d.source.mtimeMs||d.status==='missing'||d.status==='changed')){const fingerprint=await this.ops.fingerprint(d.sourcePath,controller.signal);if(!valid())continue;if(fingerprint.sha256!==d.source.sha256){next='changed';error='IMPORT_SOURCE_CHANGED'}else{d.source=fingerprint;d.sourcePath=fingerprint.path;await a.save();if(d.status==='missing'||d.status==='changed'){next=d.cache?'ready':'unprepared';error=null}}}}
   catch(e){if(controller.signal.aborted)return;next=missing(e)?'missing':'failed';error=String(e)}
   if(!valid())continue
   if(next!==d.status||error!==d.error){await this.release(d.sessionId);if(!valid())continue;d.status=next;d.error=error;await a.save().catch(()=>{});this.changed()}
   for(const r of d.exports){if(r.phase!=='ready'||!r.result)continue;let availability:'present'|'missing'|'unavailable'='present';for(const f of r.result.files){try{const s=await lstat(join(a.directory,r.result.directory,f.file));if(!s.isFile()||s.isSymbolicLink())availability='unavailable'}catch(e){availability=missing(e)?'missing':'unavailable'}}if(this.exportAvailability.get(r.id)!==availability){this.exportAvailability.set(r.id,availability);this.changed()}}
  }})().finally(()=>{this.refreshing=undefined;this.refreshController=undefined});return this.refreshing
 }
 async shutdown():Promise<void>{this.closing=true;this.paused=true;this.refreshController?.abort();await this.creating;for(const j of this.jobs.values())this.cancel(j.id);for(const r of this.reads.values())r.controller.abort();await Promise.allSettled([this.work,this.refreshing,...[...this.reads.values()].map(r=>r.promise)]);await Promise.allSettled([...this.assets.values()].map(a=>a.settled()))}
}
