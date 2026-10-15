import {replaceMetadata,readMetadata} from './metadataFile'
import {createHash,randomUUID} from 'node:crypto'
import {mkdir,writeFile,rename,lstat,realpath,rm,readdir} from 'node:fs/promises'
import {join,sep,basename,extname} from 'node:path'
import {encodeMedia,decodeMedia} from './mediaTasks'
import {hashFiles,copyExportFile} from './fileJobs'
import {validateExportPreset} from './mediaTypes'
import {validateExportRecord} from './exportTypes'
import type {MediaTools,EncodedMedia,MediaFile,ExportPreset} from './mediaTypes'
import type {ExportRecord,ExportResult,ExportView,ExportSource,ExportPhase} from './exportTypes'
import type {ExportOwner,ExportRepository} from './exportRepository'
import type {AnalysisSource,SourceContinuity} from './analysisService'
import {sourceContinuity} from './captureIntegrity'

type Task={record:ExportRecord;take:ExportOwner;controller?:AbortController;cancelled:boolean;suspended:boolean}
const exportManifestBytes=4*1024*1024
const terminal=(phase:ExportPhase)=>['ready','failed','cancelled'].includes(phase)
export class ExportService {
 private tasks=new Map<string,Task>()
 private current:Task|undefined
 private running:Promise<void>|undefined
 private paused=false
 private closing=false
 private rebuilds=new Set<AbortController>()
 private copies=new Set<Promise<unknown>>()
 private resolutions=new Map<string,Promise<AnalysisSource>>()
 constructor(private repository:ExportRepository,private tools:MediaTools,private changed:(control?:boolean)=>void){}
 views(takeId?:string):ExportView[]{
  return this.repository.sessions().filter(t=>!takeId||t.document.sessionId===takeId).flatMap(t=>(t.document.exports||[]).map(r=>({
   delivery:r.delivery,id:r.id,takeId:t.document.sessionId,label:t.document.name,preset:r.preset,createdAt:r.createdAt,automatic:r.automatic,phase:r.phase,fraction:r.fraction,error:r.error,
   range:r.source.range,frames:r.result?.frames,sampleRate:r.result?.sampleRate,channelCount:r.result?.channelCount,actualBitrate:r.result?.actualBitrate
  }))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
 }
 async start(source:ExportSource,preset:ExportPreset,automatic=false):Promise<string>{
  if(this.closing)throw Error('APP_CLOSING')
  if(this.paused&&!automatic)throw Error('RECORDING_ACTIVE')
  const full=[...this.tasks.values()].filter(t=>!terminal(t.record.phase)).length>=8
  if(full&&!automatic)throw Error('EXPORT_QUEUE_FULL')
  const take=this.repository.session(source.takeId)
  const record:ExportRecord={version:1,id:randomUUID(),createdAt:new Date().toISOString(),source:{...source},preset:validateExportPreset(preset),automatic,phase:full?'failed':'queued',fraction:0,error:full?'导出队列已满，原始录音已保留，可以重试。':null}
  validateExportRecord(record)
  if(!(take.document.exports))take.document.exports=[]
  take.document.exports.push(record);await take.save()
  if(!full)this.tasks.set(record.id,{record,take,cancelled:false,suspended:false});this.changed();this.pump();return record.id
 }
 usesSource(takeId:string):boolean{return [...this.tasks.values()].some(t=>!terminal(t.record.phase)&&t.record.source.takeId===takeId&&t.record.source.role!=='export')}
 busy():boolean{return Boolean(this.current)||this.copies.size>0||this.resolutions.size>0||this.rebuilds.size>0||[...this.tasks.values()].some(t=>!terminal(t.record.phase))}
 owns(id:string):boolean{return this.repository.sessions().some(t=>t.document.exports?.some(r=>r.id===id))}
 private find(id:string):{record:ExportRecord;take:ExportOwner}{
  for(const take of this.repository.sessions()){const record=take.document.exports?.find(r=>r.id===id);if(record)return {record,take}}
  throw Error('UNKNOWN_EXPORT_JOB')
 }
 async retry(id:string):Promise<void>{
  const {record,take}=this.find(id)
  if(this.paused||this.closing)throw Error('RECORDING_ACTIVE')
  if(!['failed','cancelled'].includes(record.phase))throw Error('EXPORT_RETRY_UNAVAILABLE')
  if(await this.recoverCommitted(record,take))return
  await this.cleanOrphans(record,take)
  if([...this.tasks.values()].filter(t=>!terminal(t.record.phase)).length>=8)throw Error('EXPORT_QUEUE_FULL')
  record.phase='queued';record.fraction=0;record.error=null;await take.save()
  this.tasks.set(id,{record,take,cancelled:false,suspended:false});this.changed();this.pump()
 }
 cancel(id:string):void{
  const {record,take}=this.find(id);if(terminal(record.phase))return
  const task=this.tasks.get(id)
  if(task){task.cancelled=true;task.suspended=false;task.controller?.abort()}
  if(task!==this.current){this.tasks.delete(id);record.phase='cancelled';record.error=null;void take.save().catch(()=>{});this.changed()}
 }
 async pauseForRecording():Promise<void>{
  this.paused=true
  if(this.current){this.current.suspended=true;this.current.controller?.abort()}
  await this.running
 }
 resume():void{this.paused=false;this.pump()}
 private pump():void{
  if(this.current||this.paused||this.closing)return
  const task=[...this.tasks.values()].find(t=>t.record.phase==='queued'&&!t.cancelled);if(!task)return
  this.current=task;task.suspended=false;task.controller=new AbortController()
  this.running=this.run(task).finally(()=>{task.controller=undefined;this.current=undefined;this.running=undefined;if(terminal(task.record.phase))this.tasks.delete(task.record.id);this.changed();this.pump()})
 }
 private async cleanup(take:ExportOwner,working:string):Promise<void>{
  const root=await realpath(take.directory)
  try{
   const target=await realpath(working),info=await lstat(working)
   if(!info.isDirectory()||info.isSymbolicLink()||!target.toLowerCase().startsWith((root+sep).toLowerCase())||!/^\.media-[a-f0-9-]+$/.test(basename(target)))throw Error('INVALID_MEDIA_CLEANUP')
   await rm(target,{recursive:true})
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 }
 /** Follow only metadata: an original may have been removed after export. */
 private captureContinuity(record:ExportRecord):SourceContinuity{
  let current=record;const seen=new Set<string>()
  while(true){
   if(current.result?.continuity)return current.result.continuity
   if(seen.has(current.id))return 'unknown'
   seen.add(current.id)
   const doc=this.repository.session(current.source.takeId).document
   if(current.source.role!=='export')return doc.regions?sourceContinuity({...doc,regions:doc.regions},current.source.regionId):doc.kind==='imported'?'complete':'unknown'
   const parent=doc.exports?.find(r=>r.id===current.source.exportId)
   if(!parent)return 'unknown'
   current=parent
  }
 }
 private async publish(task:Task,result:EncodedMedia,working:string,continuity:SourceContinuity):Promise<ExportResult>{
  const ready=join(working,'ready');await mkdir(ready)
  const moved=new Map<string,string>(),files:ExportResult['files']=[],decoded:ExportResult['decoded']=[]
  const move=async(file:MediaFile,kind:'media'|'decoded',index:number)=>{
   let name=moved.get(file.path)
   if(!name){name=kind+'-'+String(index+1).padStart(6,'0')+extname(file.path);await rename(file.path,join(ready,name));moved.set(file.path,name)}
   return {file:name,frames:file.frames,sha256:file.sha256,...(file.clippedSamples===undefined?{}:{clippedSamples:file.clippedSamples})}
  }
  for(let i=0;i<result.files.length;i++)files.push(await move(result.files[i],'media',i))
  for(let i=0;i<result.decoded.length;i++)decoded.push(await move(result.decoded[i],'decoded',i))
  const mediaIdentity=createHash('sha256').update(JSON.stringify({version:1,files:files.map(f=>f.sha256),decoder:result.encoderSha256,recipe:result.decodeRecipe})).digest('hex')
  const record:ExportResult={continuity,version:1,directory:'exports/'+task.record.id,codec:result.codec,container:result.container,sampleRate:result.sampleRate,channelCount:result.channelCount,frames:result.frames,
   actualBitrate:result.actualBitrate,files,decoded,recipe:result.decodeRecipe,mediaIdentity,encoderSha256:result.encoderSha256,sourceSha256:result.sourceSha256}
  const final={...task.record,phase:'ready' as const,fraction:1,error:null,result:record};validateExportRecord(final)
  const manifest=JSON.stringify(final,null,2);if(Buffer.byteLength(manifest)>exportManifestBytes)throw Error('INVALID_EXPORT_MANIFEST')
  await writeFile(join(ready,'export.json'),manifest,{flag:'wx'})
  if(task.controller?.signal.aborted)throw Error('MEDIA_CANCELLED')
  const parent=join(task.take.directory,'exports');await mkdir(parent,{recursive:true})
  const base=await realpath(task.take.directory),actual=await realpath(parent),info=await lstat(parent)
  if(info.isSymbolicLink()||!actual.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_EXPORT_DIRECTORY')
  await rename(ready,join(parent,task.record.id))
  return record
 }
 private async run(task:Task):Promise<void>{
  const r=task.record,working=join(task.take.directory,'.media-'+r.id+'-'+randomUUID()),signal=task.controller!.signal
  let owned=false,committed=false
  try{
   const source=await this.repository.analysisSource(r.source.takeId,r.source.role,r.source.regionId,r.source.exportId)
   const result=await encodeMedia(this.tools,{sources:source.sources,sampleRate:source.sampleRate,channelCount:source.channelCount,frames:source.frames,origin:source.decodeRange?.startFrame,range:r.source.range},r.preset,working,{
    signal,created:async()=>{owned=true;await writeFile(join(working,'owner.json'),JSON.stringify({version:1,exportId:r.id,takeId:task.take.document.sessionId}),{flag:'wx'})},progress:value=>{if(signal.aborted)return;const control=r.phase!==value.phase;r.phase=value.phase;r.fraction=value.fraction;this.changed(control)}
   })
   r.result=await this.publish(task,result,working,source.continuity??this.captureContinuity(r));committed=true;r.phase='ready';r.fraction=1;r.error=null
   await task.take.event('export.ready',{exportId:r.id,automatic:r.automatic,container:r.result.container,frames:r.result.frames})
   await task.take.save()
  }catch(error){
   if(committed){r.phase='ready';r.error='导出文件已生成，会话记录未能更新：'+String(error)}
   else if(task.suspended&&!task.cancelled&&!this.closing){r.phase='queued';r.fraction=0;r.error=null}
   else if(task.cancelled||signal.aborted){r.phase='cancelled';r.error=null}
   else{r.phase='failed';r.error=String(error)}
   await task.take.save().catch(()=>{})
  }finally{if(owned)await this.cleanup(task.take,working).catch(error=>{r.error=(r.error?r.error+'; ':'')+String(error)})}
 }
 private async cleanOrphans(record:ExportRecord,take:ExportOwner):Promise<void>{
  for(const entry of await readdir(take.directory,{withFileTypes:true})){
   if(!entry.isDirectory()||entry.isSymbolicLink()||!entry.name.startsWith('.media-'+record.id+'-'))continue
   const directory=join(take.directory,entry.name)
   try{const file=join(directory,'owner.json'),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>4096)continue;const owner=JSON.parse(await readMetadata(file,exportManifestBytes,'INVALID_EXPORT_MANIFEST'));if(owner.version===1&&owner.exportId===record.id&&owner.takeId===take.document.sessionId)await this.cleanup(take,directory)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  }
 }
 private async recoverCommitted(record:ExportRecord,take:ExportOwner):Promise<boolean>{
  try{
   const directory=join(take.directory,'exports',record.id),file=join(directory,'export.json'),details=await lstat(file)
   if(!details.isFile()||details.isSymbolicLink()||details.size>exportManifestBytes)throw Error('INVALID_EXPORT_MANIFEST')
   const recovered=validateExportRecord(JSON.parse(await readMetadata(file,exportManifestBytes,'INVALID_EXPORT_MANIFEST')))
   if(recovered.id!==record.id||recovered.phase!=='ready'||JSON.stringify(recovered.source)!==JSON.stringify(record.source)||JSON.stringify(recovered.preset)!==JSON.stringify(record.preset))throw Error('EXPORT_MANIFEST_CONFLICT')
   const before={result:record.result,phase:record.phase,fraction:record.fraction,error:record.error}
   try{record.result=recovered.result;record.phase='ready';record.fraction=1;record.error=null;await this.resolveNow(take.document.sessionId,record.id);await take.save();this.changed();return true}
   catch(error){Object.assign(record,before);throw error}
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error}
 }
 private async rebuildDecoded(record:ExportRecord,take:ExportOwner,directory:string,encoded:string):Promise<string[]>{
  const result=record.result!
  if(result.container==='wav')throw Error('EXPORTED_FILE_CHANGED')
  if(result.encoderSha256!==this.tools.ffmpegSha256)throw Error('DECODER_BUILD_CHANGED')
  const token=randomUUID(),working=join(take.directory,'.media-'+record.id+'-'+token),controller=new AbortController()
  this.rebuilds.add(controller);let owned=false
  try{
   const decoded=await decodeMedia(this.tools,encoded,result.recipe,result.sampleRate,result.channelCount,working,{signal:controller.signal,created:async()=>{owned=true;await writeFile(join(working,'owner.json'),JSON.stringify({version:1,exportId:record.id,takeId:take.document.sessionId}),{flag:'wx'})}})
   const files:ExportResult['decoded']=[]
   for(let i=0;i<decoded.length;i++){
    const file='decoded-'+token.slice(0,8)+'-'+String(i+1).padStart(6,'0')+'.wav'
    await rename(decoded[i].path,join(directory,file));files.push({file,frames:decoded[i].frames,sha256:decoded[i].sha256})
   }
   const replacement:ExportRecord={...record,result:{...result,decoded:files}};validateExportRecord(replacement)
   await replaceMetadata(join(directory,'export.json'),JSON.stringify(replacement,null,2),exportManifestBytes,'INVALID_EXPORT_MANIFEST')
   result.decoded=files;await take.save();this.changed();return files.map(f=>join(directory,f.file))
  }finally{this.rebuilds.delete(controller);if(owned)await this.cleanup(take,working)}
 }

 async resolve(takeId:string,id:string):Promise<AnalysisSource>{
  if(this.closing)throw Error('APP_CLOSING')
  const key=takeId+':'+id,existing=this.resolutions.get(key);if(existing)return existing
  const task=this.resolveNow(takeId,id).finally(()=>this.resolutions.delete(key));this.resolutions.set(key,task);return task
 }
 private async resolveNow(takeId:string,id:string):Promise<AnalysisSource>{
  const {record,take}=this.find(id);if(take.document.sessionId!==takeId||record.phase!=='ready'||!record.result)throw Error('EXPORT_NOT_READY')
  const result=record.result;validateExportRecord(record)
  const base=await realpath(take.directory),directory=join(take.directory,result.directory),info=await lstat(directory),actual=await realpath(directory)
  if(!info.isDirectory()||info.isSymbolicLink()||!actual.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_EXPORT_DIRECTORY')
  const paths=async(files:ExportResult['files'])=>{
   const output:string[]=[]
   for(const file of files){const p=join(actual,file.file),s=await lstat(p),resolved=await realpath(p);if(!s.isFile()||s.isSymbolicLink()||!resolved.toLowerCase().startsWith((actual+sep).toLowerCase()))throw Error('INVALID_EXPORT_FILE');output.push(resolved)}
   return output
  }
  const encoded=await paths(result.files),encodedHashes=await hashFiles(encoded)
  if(encodedHashes.some((h,i)=>h!==result.files[i].sha256))throw Error('EXPORTED_FILE_CHANGED')
  let decoded:string[]
  try{
   decoded=await paths(result.decoded);const decodedHashes=await hashFiles(decoded)
   if(decodedHashes.some((h,i)=>h!==result.decoded[i].sha256))throw Error('DECODED_CACHE_CHANGED')
  }catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT'&&!String(error).includes('DECODED_CACHE_CHANGED'))throw error
   decoded=await this.rebuildDecoded(record,take,actual,encoded[0])
  }
  const cacheRoot=join(take.directory,'cache');try{const details=await lstat(cacheRoot);if(!details.isDirectory()||details.isSymbolicLink())throw Error('INVALID_CACHE_DIRECTORY')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  return {assetFormat:{format:record.preset.format,sampleRate:result.sampleRate,channelCount:result.channelCount,...(record.preset.format==='wav'?{encoding:record.preset.encoding}:{bitrate:record.preset.bitrate}),container:result.container},takeId,role:'export',exportId:id,label:take.document.name+' · '+result.container.toUpperCase()+(record.source.range?' · 选区':''),
   sources:decoded,cacheRoot,sampleRate:result.sampleRate,channelCount:result.channelCount,frames:result.frames,mediaIdentity:result.mediaIdentity,continuity:this.captureContinuity(record),
   decodeRange:result.recipe.startFrame!=='0'||result.recipe.physicalFrames!==result.frames?{startFrame:result.recipe.startFrame,endFrame:(BigInt(result.recipe.startFrame)+BigInt(result.frames)).toString()}:undefined}
 }
 saveInfo(id:string):{name:string;extension:string;multiple:boolean}{
  const {record,take}=this.find(id);if(record.phase!=='ready'||!record.result)throw Error('EXPORT_NOT_READY')
  const extension=record.result.container==='adts'?'aac':record.result.container
  return {name:take.document.name+(record.source.range?'-selection':'')+'.'+extension,extension,multiple:record.result.files.length>1}
 }
 async saveCopy(id:string,target:string,options:{signal?:AbortSignal;resume?:boolean;baseName?:string}={}):Promise<void>{
  const {record,take}=this.find(id);if(record.phase!=='ready'||!record.result)throw Error('EXPORT_NOT_READY')
  const result=record.result;validateExportRecord(record)
  const takeRoot=await realpath(take.directory),directory=join(take.directory,result.directory),info=await lstat(directory),root=await realpath(directory)
  if(info.isSymbolicLink()||!info.isDirectory()||!root.toLowerCase().startsWith((takeRoot+sep).toLowerCase()))throw Error('INVALID_EXPORT_DIRECTORY')
  const sourcePaths:string[]=[]
  for(const file of result.files){const p=join(root,file.file),info=await lstat(p),resolved=await realpath(p);if(info.isSymbolicLink()||!info.isFile()||!resolved.toLowerCase().startsWith((root+sep).toLowerCase()))throw Error('INVALID_EXPORT_FILE');sourcePaths.push(resolved)}
  const copy=async(source:string,target:string,hash:string)=>{
   if(options.signal?.aborted)throw Error('DELIVERY_PAUSED')
   if(options.resume){try{const info=await lstat(target);if(!info.isFile()||info.isSymbolicLink())throw Error('EXPORT_DESTINATION_CHANGED');const [actual]=await hashFiles([target],{signal:options.signal});if(actual===hash)return;throw Error('EXPORT_DESTINATION_CHANGED')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
   await copyExportFile(this.tools.nativePath,source,target,hash,{signal:options.signal})
  }
  const task=(async()=>{
   if(result.files.length===1){
    if(extname(target).toLowerCase()!==extname(result.files[0].file).toLowerCase())throw Error('EXPORT_EXTENSION_MISMATCH')
    await copy(sourcePaths[0],target,result.files[0].sha256)
   }else{
    const base=await realpath(target),details=await lstat(base);if(!details.isDirectory())throw Error('INVALID_EXPORT_DIRECTORY')
    for(let i=0;i<result.files.length;i++){const file=result.files[i];await copy(sourcePaths[i],join(base,(options.baseName||take.document.name)+'-'+(i+1)+extname(file.file)),file.sha256)}
   }
  })()
  this.copies.add(task);try{await task}finally{this.copies.delete(task)}
 }

 folder(id:string):string{const {record,take}=this.find(id);if(record.phase!=='ready'||!record.result)throw Error('EXPORT_NOT_READY');return join(take.directory,record.result.directory)}
 async shutdown():Promise<void>{
  this.closing=true;this.paused=true;for(const controller of this.rebuilds)controller.abort()
  if(this.current)this.current.controller?.abort()
  await this.running;await Promise.allSettled([...this.resolutions.values(),...this.copies])
  for(const task of this.tasks.values())if(!terminal(task.record.phase)){task.record.phase='cancelled';await task.take.save().catch(()=>{})}
 }
}
