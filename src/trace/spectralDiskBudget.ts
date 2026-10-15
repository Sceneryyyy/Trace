import {readRegularFile,readMetadata} from './metadataFile'
import {lstat,readdir,unlink,writeFile,rename,mkdir} from 'node:fs/promises'
import {join,dirname,basename,isAbsolute} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
/** Only validated derived spectral files in registered internal cache roots. */
const roots=new Set<string>(),scanned=new Set<string>(),known=new Map<string,{path:string;root:string;bytes:number;age:number;overview:boolean;digest:string}>(),protectedFiles=new Map<string,number>()
let tail:Promise<unknown>=Promise.resolve(),registryFile:string|undefined,registryDirty=false,registryRecovered=false
export function spectralDiskUsage(){return {registeredRoots:roots.size,knownFiles:known.size,knownBytes:[...known.values()].reduce((n,e)=>n+e.bytes,0),registryRecovered,limits:spectralDiskLimits}}
export async function configureSpectralDiskRegistry(file:string){
 registryFile=file
 try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024)throw Error('INVALID_SPECTRAL_REGISTRY');const v=JSON.parse(await readMetadata(file,4*1024*1024,'INVALID_SPECTRAL_REGISTRY'));if(v.product!=='TraceSpectralRegistry'||v.version!==1||!Array.isArray(v.roots)||v.roots.length>4096||v.roots.some((r:unknown)=>typeof r!=='string'||!isAbsolute(r)||r.length>32767||r.includes('\0')))throw Error('INVALID_SPECTRAL_REGISTRY')
  for(const root of v.roots){try{const boundary=await lstat(root),owner=join(root,'.trace-spectral-owner.json'),stat=await lstat(owner);if(!boundary.isDirectory()||boundary.isSymbolicLink()||!stat.isFile()||stat.isSymbolicLink()||stat.size>1024)continue;const value=JSON.parse(await readMetadata(owner,1024,'INVALID_SPECTRAL_OWNER'));if(value.product==='TraceSpectralCache'&&value.version===1)roots.add(root)}catch{}}
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){registryRecovered=true;const info=await lstat(file);if(!info.isSymbolicLink())await rename(file,file+'.corrupt-'+randomUUID())}}
}
async function saveRegistry(){
 if(!registryFile||!registryDirty)return
 const temporary=registryFile+'.'+randomUUID()+'.tmp';let owned=false;await mkdir(dirname(registryFile),{recursive:true})
 try{await writeFile(temporary,JSON.stringify({product:'TraceSpectralRegistry',version:1,roots:[...roots]}),{flag:'wx'});owned=true;await rename(temporary,registryFile);registryDirty=false}finally{if(owned)await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e})}
}
export const spectralDiskLimits={assetBytes:96*1024*1024,totalBytes:256*1024*1024}
export function protectSpectralFile(path:string){protectedFiles.set(path,(protectedFiles.get(path)||0)+1);let released=false;return ()=>{if(released)return;released=true;const count=protectedFiles.get(path)||1;if(count===1)protectedFiles.delete(path);else protectedFiles.set(path,count-1)}}
export function enforceSpectralBudget(root:string,limits=spectralDiskLimits,writtenFile?:string):Promise<void>{
 const task=tail.catch(()=>{}).then(async()=>{
  const boundary=await lstat(root);if(!boundary.isDirectory()||boundary.isSymbolicLink())throw Error('INVALID_SPECTRAL_ROOT')
  if(!roots.has(root)){if(roots.size>=4096)throw Error('SPECTRAL_ROOT_LIMIT');roots.add(root);registryDirty=true}
  if(registryFile){const owner=join(root,'.trace-spectral-owner.json');try{const info=await lstat(owner);if(!info.isFile()||info.isSymbolicLink()||info.size>1024)throw Error('INVALID_SPECTRAL_OWNER');const v=JSON.parse(await readMetadata(owner,1024,'INVALID_SPECTRAL_OWNER'));if(v.product!=='TraceSpectralCache'||v.version!==1)throw Error('INVALID_SPECTRAL_OWNER')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(owner,JSON.stringify({product:'TraceSpectralCache',version:1}),{flag:'wx'})}await saveRegistry()}
  const entries:{path:string;root:string;bytes:number;age:number;overview:boolean;digest:string}[]=[]
  for(const root of roots){
   if(scanned.has(root))continue
   const boundary=await lstat(root).catch(()=>null);if(!boundary||!boundary.isDirectory()||boundary.isSymbolicLink())continue
   for(const key of await readdir(root)){if(!/^[a-f0-9]{64}$/.test(key))continue
    const dir=join(root,key),info=await lstat(dir);if(!info.isDirectory()||info.isSymbolicLink())continue
    for(const name of await readdir(dir)){
     if(!/^(?:[0-9]{1,20}|overview-v1-[0-9]{1,2}-[0-9]{1,20})\.bin(?:\.corrupt-[a-f0-9-]{36})?$/.test(name))continue
     const path=join(dir,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)continue
     const data=await readRegularFile(path,4*1024*1024,'INVALID_SPECTRAL_FILE'),overview=name.startsWith('overview-')
     // A filename alone never establishes ownership, including quarantines.
     {
      if(overview){if(data.subarray(0,8).toString()!=='TROV0001'||data.length<40||!createHash('sha256').update(data.subarray(40)).digest().equals(data.subarray(8,40)))continue}
      else if(data.subarray(0,8).toString()!=='TRSPV1\0\0'||data.length<128||!data.subarray(64,96).equals(Buffer.from(key,'hex'))||!createHash('sha256').update(data.subarray(0,96)).update(data.subarray(128)).digest().equals(data.subarray(96,128)))continue
     }
     known.set(path,{path,root,bytes:stat.size,age:stat.mtimeMs,overview,digest:createHash('sha256').update(data).digest('hex')})
    }
   }
  }
  for(const r of roots)scanned.add(r)
  if(writtenFile){if(dirname(dirname(writtenFile))!==root||!/^[a-f0-9]{64}$/.test(basename(dirname(writtenFile))))throw Error('INVALID_SPECTRAL_FILE');const parent=await lstat(dirname(writtenFile)),stat=await lstat(writtenFile);if(!parent.isDirectory()||parent.isSymbolicLink()||!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw Error('INVALID_SPECTRAL_FILE');known.set(writtenFile,{path:writtenFile,root,bytes:stat.size,age:Date.now(),overview:writtenFile.includes('overview-v1-'),digest:createHash('sha256').update(await readRegularFile(writtenFile,4*1024*1024,'INVALID_SPECTRAL_FILE')).digest('hex')})}
  const occupied=new Set([...known.values()].map(e=>e.root))
  for(const root of occupied){const boundary=await lstat(root).catch(()=>null);if(!boundary?.isDirectory()||boundary.isSymbolicLink()){for(const [path,e] of known)if(e.root===root)known.delete(path);scanned.delete(root)}}
  entries.push(...known.values())
  const sizes=new Map<string,number>();let total=0
  for(const e of entries){total+=e.bytes;sizes.set(e.root,(sizes.get(e.root)||0)+e.bytes)}
  if(total<=limits.totalBytes&&[...sizes.values()].every(n=>n<=limits.assetBytes))return
  // Raw tiles are cheap to rebuild; retain compact overview levels longer.
  const level=(e:typeof entries[number])=>e.path.includes('.corrupt-')?-1:e.overview?Number(e.path.match(/overview-v1-(\d+)-/)?.[1]||0):0
  entries.sort((a,b)=>level(a)-level(b)||a.age-b.age)
  for(const e of entries){if(total<=limits.totalBytes&&(sizes.get(e.root)||0)<=limits.assetBytes)continue
   if(protectedFiles.has(e.path))continue
   const parent=await lstat(dirname(e.path)).catch(()=>null),current=parent?.isDirectory()&&!parent.isSymbolicLink()?await lstat(e.path).catch(()=>null):null;
   if(!current?.isFile()||current.isSymbolicLink()||current.size!==e.bytes||createHash('sha256').update(await readRegularFile(e.path,4*1024*1024,'INVALID_SPECTRAL_FILE')).digest('hex')!==e.digest){known.delete(e.path);total-=e.bytes;sizes.set(e.root,(sizes.get(e.root)||0)-e.bytes);continue}
   await unlink(e.path);known.delete(e.path);total-=e.bytes;sizes.set(e.root,(sizes.get(e.root)||0)-e.bytes)
  }
 })
 tail=task;return task
}
