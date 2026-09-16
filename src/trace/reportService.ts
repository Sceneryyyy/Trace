import {mkdir,lstat,realpath,unlink,rmdir,readdir,readFile,writeFile,open} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {runReport} from './reportJobs'
import {validateTargetSettings,targetKey} from './targetSettings'
import type {ReportRequest,ReportResult} from './reportTypes'
import type {TargetSettings} from './targetSettings'
export type ReportJobView={id:string;playbackId:string;label:string;takeId:string;scope:ReportRequest['source']['scope'];phase:'queued'|'running'|'ready'|'failed'|'cancelled';rows:number;total:string;error:string|null;targetKey:string;createdAt:string;eventCount?:number;verdict?:string;exportState?:{phase:'writing'|'ready'|'failed'|'cancelled';directory?:string;error?:string}}
export type ReportInput={playbackId:string;request:Omit<ReportRequest,'targets'|'outputDirectory'>;retain:()=>()=>void}
type Job={view:ReportJobView;input:ReportInput;targets:TargetSettings;directory:string;result?:ReportResult;controller?:AbortController;release?:()=>void;work?:Promise<void>;suspended?:boolean}
const files=['report.html','summary.csv','history.csv','events.csv']
export class ReportService {
 private jobs=new Map<string,Job>()
 private workerPeak={rss:0,heapUsed:0}
 get diagnostics(){return {drafts:this.jobs.size,queued:[...this.jobs.values()].filter(j=>j.view.phase==='queued').length,running:this.active,workerPeak:{...this.workerPeak}}}
 private active=false
 private starting=0
 private creating:Promise<unknown>=Promise.resolve()
 private closing=false
 private paused=false
 private holds=new Set<string>()
 readonly root:string
 constructor(root:string,private changed:()=>void,private runner:typeof runReport=runReport){this.root=resolve(root)}
 async initialize():Promise<void>{
  await mkdir(this.root,{recursive:true});if((await lstat(this.root)).isSymbolicLink())throw Error('INVALID_REPORT_ROOT')
  for(const entry of await readdir(this.root,{withFileTypes:true})){if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[-a-f0-9]{36}$/.test(entry.name))continue
   const directory=join(this.root,entry.name),marker=join(directory,'owner.json');try{const info=await lstat(marker);if(!info.isFile()||info.isSymbolicLink())continue;const value=JSON.parse(await readFile(marker,'utf8'));if(value.product==='TraceReportDraft'&&value.version===1&&value.id===entry.name)await this.clean(directory)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&!(e instanceof SyntaxError))throw e}}
 }
 views():ReportJobView[]{return [...this.jobs.values()].reverse().map(j=>structuredClone(j.view))}
 usesTake(id:string):boolean{return [...this.jobs.values()].some(j=>j.view.takeId===id&&Boolean(j.release))}
 async start(input:ReportInput,settings:TargetSettings):Promise<string>{
  if(this.closing)throw Error('APP_CLOSING')
  if(this.starting+[...this.jobs.values()].filter(j=>['queued','running'].includes(j.view.phase)).length>=2)throw Error('REPORT_QUEUE_FULL')
  this.starting++
  const created=this.creating.then(()=>this.create(input,settings));this.creating=created.catch(()=>{})
  try{return await created}finally{this.starting--}
 }
 private async create(input:ReportInput,settings:TargetSettings):Promise<string>{
  if(this.closing||this.holds.has(input.request.source.takeId))throw Error('REPORT_SOURCE_BUSY')
  await mkdir(this.root,{recursive:true});if((await lstat(this.root)).isSymbolicLink())throw Error('INVALID_REPORT_ROOT')
  while(this.jobs.size>=8){const entry=[...this.jobs.entries()].find(([,j])=>!['queued','running'].includes(j.view.phase)&&!j.controller);if(!entry)throw Error('REPORT_QUEUE_FULL');await this.clean(entry[1].directory);this.jobs.delete(entry[0])}
  const targets=validateTargetSettings(settings),id=randomUUID(),directory=join(this.root,id);await mkdir(directory,{recursive:false});await writeFile(join(directory,'owner.json'),JSON.stringify({product:'TraceReportDraft',version:1,id}),{flag:'wx'})
  let release:()=>void
  try{if(this.closing||this.holds.has(input.request.source.takeId))throw Error('REPORT_SOURCE_BUSY');release=input.retain()}catch(error){await unlink(join(directory,'owner.json')).catch(()=>{});await rmdir(directory).catch(()=>{});throw error}
  const view:ReportJobView={id,playbackId:input.playbackId,label:input.request.source.label,takeId:input.request.source.takeId,scope:input.request.source.scope,phase:'queued',rows:0,total:'0',error:null,targetKey:targetKey(targets),createdAt:new Date().toISOString()}
  this.jobs.set(id,{view,input:{...input,request:structuredClone(input.request)},targets,directory,release});this.changed();this.pump();return id
 }
 setRecordingBusy(value:boolean):void {this.paused=value;if(value){for(const j of this.jobs.values())if(j.view.exportState?.phase==='writing')j.controller?.abort();const job=[...this.jobs.values()].find(j=>j.view.phase==='running');if(job){job.suspended=true;job.controller?.abort()}}else this.pump()}
 private pump():void {
  if(this.active||this.closing||this.paused)return
  const job=[...this.jobs.values()].find(j=>j.view.phase==='queued'&&!this.holds.has(j.view.takeId));if(!job)return
  this.active=true;job.suspended=false;job.view.phase='running';job.controller=new AbortController();this.changed()
  job.work=(async()=>{try{
   const result=await this.runner({...job.input.request,targets:job.targets,outputDirectory:join(job.directory,'data')},job.controller!.signal,(rows,total,memory)=>{if(memory&&Number.isFinite(memory.rss)&&Number.isFinite(memory.heapUsed)){this.workerPeak.rss=Math.max(this.workerPeak.rss,memory.rss);this.workerPeak.heapUsed=Math.max(this.workerPeak.heapUsed,memory.heapUsed)}if(job.view.phase==='running'){job.view.rows=rows;job.view.total=total;this.changed()}})
   if(job.controller!.signal.aborted)throw Error('REPORT_CANCELLED')
   job.result=result;job.view.phase='ready';job.view.eventCount=result.events;job.view.verdict=result.evaluation.state
  }catch(error){job.view.phase=job.suspended&&!this.closing?'queued':job.controller!.signal.aborted?'cancelled':'failed';job.view.error=job.view.phase==='failed'?String(error):null;try{await this.cleanData(job.directory)}catch(cleanupError){job.view.phase='failed';job.view.error=(job.view.error||'REPORT_CANCELLED')+'; REPORT_CLEANUP_FAILED: '+String(cleanupError)}}
  finally{if(job.view.phase!=='queued'){job.release?.();job.release=undefined}job.controller=undefined;this.active=false;this.changed();this.pump()}})()
 }
 cancel(id:string):void {const job=this.get(id);if(job.view.exportState?.phase==='writing'){job.controller?.abort();return}if(!['queued','running'].includes(job.view.phase))return;job.suspended=false;job.view.phase='cancelled';job.controller?.abort();if(!job.controller){job.release?.();job.release=undefined}this.changed()}
 async retry(id:string,targets:TargetSettings):Promise<string>{const job=this.get(id);if(['queued','running'].includes(job.view.phase))throw Error('REPORT_BUSY');return this.start(job.input,targets)}
 private get(id:string):Job{const job=this.jobs.get(id);if(!job)throw Error('UNKNOWN_REPORT');return job}
 result(id:string):ReportResult{const job=this.get(id);if(!job.result)throw Error('REPORT_NOT_READY');return structuredClone(job.result)}
 file(id:string):string{const job=this.get(id);if(!job.result)throw Error('REPORT_NOT_READY');return join(job.directory,'data','report.html')}
 async forgetTake(id:string):Promise<void>{
  this.holds.add(id)
  try{await this.creating;const matches=[...this.jobs.values()].filter(j=>j.view.takeId===id);for(const j of matches)this.cancel(j.view.id);await Promise.all(matches.map(j=>j.work));for(const j of matches){await this.clean(j.directory);this.jobs.delete(j.view.id)}}finally{this.holds.delete(id);this.changed();this.pump()}
 }
 private async safeDirectory(directory:string):Promise<boolean>{
  try{const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error('INVALID_REPORT_DIRECTORY');const base=await realpath(this.root),actual=await realpath(directory);if(!actual.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_REPORT_DIRECTORY');return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}
 }
 private async cleanData(directory:string):Promise<void>{
  if(!await this.safeDirectory(directory))return;const data=join(directory,'data');if(!await this.safeDirectory(data))return
  for(const name of files)await unlink(join(data,name)).catch(e=>{if(e.code!=='ENOENT')throw e})
  await rmdir(data).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e})
 }
 private async clean(directory:string):Promise<void>{await this.cleanData(directory);if(await this.safeDirectory(directory)){await unlink(join(directory,'owner.json')).catch(e=>{if(e.code!=='ENOENT')throw e});await rmdir(directory).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e})}}
 assertExportable(id:string):void {const job=this.get(id);if(!job.result||job.controller||this.closing||this.paused)throw Error('REPORT_NOT_READY')}
 async export(id:string,parent:string):Promise<string>{
  this.assertExportable(id);const job=this.get(id)
  const created:string[]=[],signal=new AbortController();job.controller=signal;job.view.exportState={phase:'writing'};this.changed()
  let directory:string|undefined,directoryCreated=false,resolveWork:()=>void=()=>{};job.work=new Promise<void>(resolve=>resolveWork=resolve)
  const sha=async(file:string)=>{const h=createHash('sha256');for await(const chunk of createReadStream(file)){if(signal.signal.aborted)throw Error('REPORT_CANCELLED');h.update(chunk)}return h.digest('hex')}
  try{
   const root=await realpath(parent);directory=join(root,'Trace-Report-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));if(signal.signal.aborted)throw Error('REPORT_CANCELLED');await mkdir(directory,{recursive:false});directoryCreated=true
   for(const name of [...files.slice(1),files[0]]){if(signal.signal.aborted)throw Error('REPORT_CANCELLED');const source=join(job.directory,'data',name),target=join(directory,name);const reader=await open(source,'r');let writer:Awaited<ReturnType<typeof open>>|undefined
     try{writer=await open(target,'wx');created.push(target);const buffer=Buffer.alloc(64*1024);for(;;){if(signal.signal.aborted)throw Error('REPORT_CANCELLED');const {bytesRead}=await reader.read(buffer);if(!bytesRead)break;let offset=0;while(offset<bytesRead){const result=await writer.write(buffer,offset,bytesRead-offset);if(!result.bytesWritten)throw Error('REPORT_COPY_FAILED');offset+=result.bytesWritten}}}finally{await reader.close();await writer?.close()}
     if(await sha(source)!==await sha(target))throw Error('REPORT_COPY_CHANGED')}
   job.view.exportState={phase:'ready',directory};this.changed();return directory
  }catch(error){for(const file of created)await unlink(file).catch(()=>{});if(directory&&directoryCreated)await rmdir(directory).catch(()=>{});job.view.exportState={phase:signal.signal.aborted?'cancelled':'failed',error:String(error)};this.changed();throw error}
  finally{job.controller=undefined;resolveWork()}
 }
 async shutdown():Promise<void>{this.closing=true;await this.creating;for(const job of this.jobs.values())this.cancel(job.view.id);await Promise.all([...this.jobs.values()].map(j=>j.work))}
}
