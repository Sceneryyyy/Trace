import {appendFile,lstat,mkdir,readFile,readdir,realpath,rename,unlink,writeFile} from 'node:fs/promises'
import {basename,extname,isAbsolute,join,resolve,sep} from 'node:path'
import {randomUUID} from 'node:crypto'
import {validateTakeName} from './naming'
import {validateExportRecord} from './exportTypes'
import type {ExportRecord} from './exportTypes'
import type {ExportOwner} from './exportRepository'
import type {ImportFingerprint} from './importMedia'
import type {AssetFormat} from './assetFormat'

export type ImportedDocument={version:1;product:'Trace';kind:'imported';sessionId:string;name:string;createdAt:string;updatedAt:string;revision:number;
 status:'unprepared'|'preparing'|'ready'|'missing'|'changed'|'failed';error:string|null;sourcePath:string;sourceName:string;source?:ImportFingerprint;
 cache?:{id:string;frames:string;format:AssetFormat;mediaIdentity:string;decoderSha256:string};exports:ExportRecord[];eventSequence:number}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/
const plain=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v))
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!v.includes('\0')
const frame=(v:unknown):v is string=>text(v,20)&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=0xffffffffffffffffn
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const maxBytes=16*1024*1024
function validFormat(v:unknown):v is AssetFormat {
 if(!plain(v)||!Number.isInteger(v.sampleRate)||Number(v.sampleRate)<8000||Number(v.sampleRate)>96000||![1,2].includes(Number(v.channelCount))||typeof v.channelCount!=='number')return false
 return v.format==='wav'?['pcm16','pcm24','float32'].includes(String(v.encoding)):v.format==='mp3'?v.container==='mp3':v.format==='aac'&&['m4a','adts'].includes(String(v.container))
}
export function validateImportedDocument(raw:unknown):ImportedDocument {
 if(!plain(raw)||Object.keys(raw).some(k=>!['version','product','kind','sessionId','name','createdAt','updatedAt','revision','status','error','sourcePath','sourceName','source','cache','exports','eventSequence'].includes(k)))throw Error('INVALID_IMPORTED_ASSET');const d=raw as ImportedDocument
 if(d.version!==1||d.product!=='Trace'||d.kind!=='imported'||!text(d.sessionId,36)||!uuid.test(d.sessionId)||!text(d.createdAt,64)||!text(d.updatedAt,64)||!Number.isFinite(Date.parse(d.createdAt))||!Number.isFinite(Date.parse(d.updatedAt))||!Number.isSafeInteger(d.revision)||d.revision<1||!Number.isSafeInteger(d.eventSequence)||d.eventSequence<0||!text(d.sourcePath,32767)||!isAbsolute(d.sourcePath)||!text(d.sourceName,1024)||!['unprepared','preparing','ready','missing','changed','failed'].includes(d.status)||(d.error!==null&&!text(d.error,8192))||!Array.isArray(d.exports)||d.exports.length>10000)throw Error('INVALID_IMPORTED_ASSET')
 if(validateTakeName(d.name)!==d.name)throw Error('INVALID_IMPORT_NAME')
 if(d.source&&(!plain(d.source)||!text(d.source.path,32767)||!isAbsolute(d.source.path)||!text(d.source.name,1024)||!frame(d.source.bytes)||BigInt(d.source.bytes)<=0n||!same(resolve(d.source.path),resolve(d.sourcePath))||!Number.isFinite(d.source.mtimeMs)||!hash.test(d.source.sha256)))throw Error('INVALID_IMPORT_FINGERPRINT')
 if(d.cache&&(!plain(d.cache)||!uuid.test(d.cache.id)||!frame(d.cache.frames)||BigInt(d.cache.frames)<=0n||!hash.test(d.cache.mediaIdentity)||!hash.test(d.cache.decoderSha256)||!validFormat(d.cache.format)||!d.source))throw Error('INVALID_IMPORT_CACHE_REFERENCE')
 if(d.status==='ready'&&(!d.cache||!d.source))throw Error('INVALID_IMPORT_READY_STATE')
 for(const record of d.exports){validateExportRecord(record);if(record.source.takeId!==d.sessionId||!['source','export'].includes(record.source.role)||record.source.regionId)throw Error('INVALID_IMPORT_EXPORT_OWNER')}
 return d
}
async function checkOwner(root:string,directory:string,id:string):Promise<void>{
 if(!uuid.test(id)||!same(resolve(directory),join(resolve(root),id)))throw Error('INVALID_IMPORT_STORE_DIRECTORY')
 const rootInfo=await lstat(root),dir=await lstat(directory)
 if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory()||dir.isSymbolicLink()||!dir.isDirectory()||!same(await realpath(root),resolve(root))||!same(await realpath(directory),resolve(directory)))throw Error('INVALID_IMPORT_STORE_DIRECTORY')
 const path=join(directory,'owner.json'),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>4096)throw Error('INVALID_IMPORT_STORE_OWNER')
 const owner=JSON.parse(await readFile(path,'utf8'));if(owner.product!=='TraceImportedAsset'||owner.version!==1||owner.id!==id)throw Error('INVALID_IMPORT_STORE_OWNER')
}
export class StoredImportedAsset implements ExportOwner {
 private writes:Promise<void>=Promise.resolve()
 constructor(readonly root:string,readonly directory:string,readonly document:ImportedDocument){}
 save():Promise<void>{
  this.document.updatedAt=new Date().toISOString();const snapshot=JSON.stringify(validateImportedDocument(this.document),null,2)+'\n'
  if(Buffer.byteLength(snapshot)>maxBytes)throw Error('IMPORT_METADATA_TOO_LARGE')
  const id=this.document.sessionId
  this.writes=this.writes.catch(()=>{}).then(async()=>{
   await checkOwner(this.root,this.directory,id);const temp=join(this.directory,'import.'+randomUUID()+'.tmp'),target=join(this.directory,'import.json')
   try{await writeFile(temp,snapshot,{flag:'wx'});for(let n=0;;n++){await checkOwner(this.root,this.directory,id);try{await rename(temp,target);break}catch(error){if(n>=5||!['EACCES','EPERM','EBUSY'].includes((error as NodeJS.ErrnoException).code||''))throw error;await new Promise(r=>setTimeout(r,[20,50,100,200,400][n]))}}}
   finally{await unlink(temp).catch(()=>{})}
  });return this.writes
 }
 event(type:string,details:Record<string,unknown>={}):Promise<void>{
  if(!text(type,128))throw Error('INVALID_IMPORT_EVENT');const event=JSON.stringify({...details,seq:++this.document.eventSequence,type,at:new Date().toISOString()})+'\n';if(Buffer.byteLength(event)>64*1024)throw Error('IMPORT_EVENT_TOO_LARGE')
  this.writes=this.writes.catch(()=>{}).then(async()=>{await checkOwner(this.root,this.directory,this.document.sessionId);const target=join(this.directory,'events.jsonl');try{const s=await lstat(target);if(!s.isFile()||s.isSymbolicLink())throw Error('INVALID_IMPORT_EVENT_FILE')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}await appendFile(target,event)});return this.writes
 }
 async settled():Promise<void>{await this.writes}
}
export class ImportStore {
 readonly root:string
 constructor(root:string){this.root=resolve(root)}
 async initialize():Promise<{assets:StoredImportedAsset[];issues:Array<{id:string;error:string}>}>{
  await mkdir(this.root,{recursive:true});const info=await lstat(this.root);if(!info.isDirectory()||info.isSymbolicLink()||!same(await realpath(this.root),this.root))throw Error('INVALID_IMPORT_STORE_ROOT')
  const assets:StoredImportedAsset[]=[],issues:Array<{id:string;error:string}>=[]
  for(const entry of await readdir(this.root,{withFileTypes:true})){
   if(!uuid.test(entry.name))continue;const directory=join(this.root,entry.name)
   try{await checkOwner(this.root,directory,entry.name);const file=join(directory,'import.json'),s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>maxBytes)throw Error('INVALID_IMPORT_METADATA');const d=validateImportedDocument(JSON.parse(await readFile(file,'utf8')));if(d.sessionId!==entry.name)throw Error('INVALID_IMPORT_STORE_OWNER')
    if(d.status==='preparing'){d.status='failed';d.error='上次素材准备未完成，请重试。'}
    for(const r of d.exports){if(!['ready','failed','cancelled'].includes(r.phase)){r.phase='failed';r.error='上次导出未完成，请重试。'}if(r.delivery&&['pending','copying'].includes(r.delivery.phase)){r.delivery.phase='failed';r.delivery.error='上次另存未完成，请重新选择保存位置。'}}
    assets.push(new StoredImportedAsset(this.root,directory,d))
   }catch(error){issues.push({id:entry.name,error:String(error)})}
  }
  return {assets,issues}
 }
 async create(sourcePath:string,name?:string):Promise<StoredImportedAsset>{
  if(!text(sourcePath,32767)||!isAbsolute(sourcePath))throw Error('INVALID_IMPORT_PATH')
  const rootInfo=await lstat(this.root);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||!same(await realpath(this.root),this.root))throw Error('INVALID_IMPORT_STORE_ROOT')
  const sourceInfo=await lstat(sourcePath),canonical=await realpath(sourcePath);if(!sourceInfo.isFile()||sourceInfo.isSymbolicLink())throw Error('INVALID_IMPORT_FILE');if(canonical.toLowerCase().startsWith((this.root+sep).toLowerCase()))throw Error('IMPORT_SOURCE_INSIDE_CACHE')
  const sourceName=basename(sourcePath),stem=basename(sourcePath,extname(sourcePath)).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'');let suggested='';for(const c of stem){if((suggested+c).length>120)break;suggested+=c}suggested=suggested.replace(/[. ]+$/,'')||'素材';if(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(suggested))suggested='素材_'+suggested
  const label=validateTakeName(name??suggested),id=randomUUID(),directory=join(this.root,id),now=new Date().toISOString()
  await mkdir(directory,{recursive:false});await writeFile(join(directory,'owner.json'),JSON.stringify({product:'TraceImportedAsset',version:1,id}),{flag:'wx'})
  const item=new StoredImportedAsset(this.root,directory,{version:1,product:'Trace',kind:'imported',sessionId:id,name:label,createdAt:now,updatedAt:now,revision:1,status:'unprepared',error:null,sourcePath:canonical,sourceName,eventSequence:0,exports:[]});await item.save();return item
 }
}
