import {lstat,realpath,readFile} from 'node:fs/promises'
import {dirname,join,sep} from 'node:path'
import type {RecordingService} from './recording'
import type {ExportView} from './exportTypes'
import type {TakeSummary} from './shared'
export type Availability='present'|'missing'|'unavailable'
type Inventory={status:Availability;missingFiles:number;missingRoles:string[]}
async function identity(file:string):Promise<Record<string,unknown>>{
 try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>16*1024*1024)throw Error();return JSON.parse(await readFile(file,'utf8'))}
 catch{throw Error('LIBRARY_IDENTITY_CHANGED')}
}
const absent=(error:unknown)=>['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code||'')
export class LibraryService{
 private takes=new Map<string,Inventory>()
 private exports=new Map<string,Availability>()
 private scanning:Promise<void>|undefined
 constructor(private recordings:RecordingService,private trash:(path:string)=>Promise<void>,private changed:()=>void,private processing:()=>boolean=()=>false){}
 summaries():TakeSummary[]{return this.recordings.summaries().map(t=>({...t,...(this.takes.has(t.id)?{availability:this.takes.get(t.id)!.status,missingFiles:this.takes.get(t.id)!.missingFiles,missingRoles:this.takes.get(t.id)!.missingRoles}:{}),exports:t.exports?.map(e=>this.exportView(e))}))}
 exportView(value:ExportView):ExportView{return {...value,availability:this.exports.get(value.id)}}
 async refresh():Promise<void>{
  if(this.scanning)return this.scanning
  this.scanning=this.scan().finally(()=>{this.scanning=undefined});return this.scanning
 }
 private async scan():Promise<void>{
  const takes=new Map<string,Inventory>(),exports=new Map<string,Availability>()
  const inspect=async(file:string):Promise<Availability>=>{try{const st=await lstat(file);return st.isFile()&&!st.isSymbolicLink()?'present':'unavailable'}catch(e){return absent(e)?'missing':'unavailable'}}
  for(const take of this.recordings.sessions()){
   const d=take.document
   if(!['ready','failed','recovered','recoverable'].includes(d.status))continue
   let missingFiles=0,unavailable=false
   const missingRoles=new Set<string>()
   for(const a of d.assets.filter(a=>!['superseded','removed','removing'].includes(a.state||''))){
    const state=await inspect(join(take.directory,a.relativePath))
    if(state!=='present'){missingFiles++;missingRoles.add(a.role);unavailable ||= state==='unavailable'}
   }
   for(const r of d.exports||[]){
    if(r.phase!=='ready'||!r.result)continue
    let state:Availability='present'
    for(const f of r.result.files){const v=await inspect(join(take.directory,r.result.directory,f.file));if(v==='unavailable')state=v;else if(v==='missing'&&state!=='unavailable')state=v;if(v!=='present')missingFiles++}
    exports.set(r.id,state);unavailable ||= state==='unavailable'
   }
   try{const st=await lstat(take.directory);if(!st.isDirectory()||st.isSymbolicLink())unavailable=true}catch(e){if(absent(e))missingFiles=Math.max(1,missingFiles);else unavailable=true}
   takes.set(d.sessionId,{status:unavailable?'unavailable':missingFiles?'missing':'present',missingFiles,missingRoles:[...missingRoles]})
  }
  // The status of the recording itself stays independent from file availability.
  this.takes=takes;this.exports=exports;this.changed()
 }
 async describe(takeId:string,exportId?:string):Promise<{path:string;name:string;missing:boolean;takeMissing?:boolean;exportId?:string}>{
  const take=this.recordings.session(takeId)
  if(this.recordings.busy()||this.processing()||!['ready','failed','recovered','recoverable'].includes(take.document.status))throw Error('LIBRARY_BUSY')
  const record=exportId?take.document.exports?.find(r=>r.id===exportId):undefined
  if(exportId&&(!record||!['ready','failed','cancelled'].includes(record.phase)))throw Error('LIBRARY_BUSY')
  const target=take.directory
  let actual:string
  try{const st=await lstat(target),root=await realpath(this.recordings.directory);actual=await realpath(target);if(!st.isDirectory()||st.isSymbolicLink()||dirname(actual).toLowerCase()!==root.toLowerCase())throw Error('INVALID_LIBRARY_PATH')}
  catch(e){if(absent(e))return {path:target,name:take.document.name,missing:true,takeMissing:true,exportId};throw e}
  const manifestPath=join(actual,'session.json'),manifestStat=await lstat(manifestPath)
  if(!manifestStat.isFile()||manifestStat.isSymbolicLink()||manifestStat.size>16*1024*1024)throw Error('LIBRARY_IDENTITY_CHANGED')
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
  if(manifest.product!=='Trace'||manifest.sessionId!==takeId)throw Error('LIBRARY_IDENTITY_CHANGED')
  if(!exportId)return {path:actual,name:take.document.name,missing:false}
  const parent=join(actual,'exports'),child=join(parent,exportId)
  try{const p=await lstat(parent),c=await lstat(child),resolved=await realpath(child);if(!p.isDirectory()||p.isSymbolicLink()||!c.isDirectory()||c.isSymbolicLink()||resolved.toLowerCase()!==child.toLowerCase()||!resolved.toLowerCase().startsWith((actual+sep).toLowerCase()))throw Error('INVALID_LIBRARY_PATH');const owner=await identity(join(resolved,'export.json'));if(owner.id!==exportId||(owner.source as {takeId?:string}|undefined)?.takeId!==takeId)throw Error('LIBRARY_IDENTITY_CHANGED');return {path:resolved,name:take.document.name+' · 成品与导出',missing:false,exportId}}
  catch(e){if(absent(e))return {path:child,name:take.document.name+' · 成品与导出',missing:true,exportId};throw e}
 }
 async remove(takeId:string,exportId?:string):Promise<void>{
  await this.scanning
  await this.recordings.settled()
  const item=await this.describe(takeId,exportId),take=this.recordings.session(takeId)
  await take.settled()
  if(!item.missing)await this.trash(item.path)
  if(exportId&&!item.takeMissing){
   const before=take.document.exports
   take.document.exports=before?.filter(r=>r.id!==exportId)
   try{await take.save()}catch(e){take.document.exports=before;throw e}
   this.exports.delete(exportId)
  }else{this.recordings.forget(takeId);this.takes.delete(takeId)}
  await this.refresh()
 }
}
