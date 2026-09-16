import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import {lstat,opendir,realpath,rm} from 'node:fs/promises'
import {join,relative,sep,dirname} from 'node:path'
import {freeSpace} from './storageCapacity'
import type {StoredSession} from './sessionStore'

export type LibraryUsage={directory:string;audioBytes:string;cacheBytes:string;freeBytes:string|null;incomplete:boolean}
const absent=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT'
async function walk(directory:string,visit:(file:string,size:number)=>void,strict=false):Promise<boolean>{
 let complete=true
 const descend=async(folder:string,depth:number):Promise<void>=>{
  if(depth>32){if(strict)throw Error('INVALID_CACHE_DIRECTORY');complete=false;return}
  try{
   const info=await lstat(folder)
   if(info.isSymbolicLink()||!info.isDirectory()){if(strict)throw Error('INVALID_CACHE_DIRECTORY');complete=false;return}
   const entries=await opendir(folder)
   for await(const entry of entries){
    const file=join(folder,entry.name),info=await lstat(file)
    if(info.isSymbolicLink()){if(strict)throw Error('INVALID_CACHE_DIRECTORY');complete=false}
    else if(info.isDirectory())await descend(file,depth+1)
    else if(info.isFile())visit(file,info.size)
   }
  }catch(error){if(strict||!absent(error)){if(strict)throw error;complete=false}}
 }
 await descend(directory,0);return complete
}
export async function libraryUsage(directory:string,takes:readonly StoredSession[]):Promise<LibraryUsage>{
 let audio=0n,cache=0n,incomplete=false
 for(const take of takes){
  const complete=await walk(take.directory,(file,size)=>{
   const local=relative(take.directory,file).replace(/\\/g,'/').toLowerCase()
   if(local.startsWith('audio/')||/^exports\/[^/]+\/media-[^/]+$/.test(local))audio+=BigInt(size)
   else if(local.startsWith('cache/')||/^exports\/[^/]+\/decoded-[^/]+\.wav$/.test(local)||local.startsWith('.media-'))cache+=BigInt(size)
  })
  incomplete ||= !complete
 }
 return {directory,audioBytes:audio.toString(),cacheBytes:cache.toString(),freeBytes:(await freeSpace(directory))?.toString()??null,incomplete}
}
/** Called after analysis/output users are released and the library identity is verified. */
export async function clearOwnedCache(take:StoredSession):Promise<{freedBytes:string;protectedExports:number}>{
 const root=await realpath(take.directory),cache=join(root,'cache')
 let removed=0n,protectedExports=0
 try{
  const info=await lstat(cache),actual=await realpath(cache)
  if(!info.isDirectory()||info.isSymbolicLink()||dirname(actual).toLowerCase()!==root.toLowerCase()||actual.toLowerCase()!==cache.toLowerCase())throw Error('INVALID_CACHE_DIRECTORY')
  let size=0n;await walk(actual,(_file,bytes)=>{size+=BigInt(bytes)},true)
  // The resolved path was checked against this owned take, and no child is a link.
  await rm(actual,{recursive:true});removed+=size
 }catch(error){if(!absent(error))throw error}
 for(const record of take.document.exports||[]){
  if(record.phase!=='ready'||!record.result)continue
  const result=record.result,folder=join(root,'exports',record.id)
  if(result.directory!=='exports/'+record.id)throw Error('INVALID_EXPORT_DIRECTORY')
  let canonicalValid=true
  for(const media of result.files){
   try{
    if(!/^media-[0-9]+\.(wav|mp3|m4a|aac)$/.test(media.file))throw Error('INVALID_EXPORT_FILE')
    const parent=await lstat(join(root,'exports')),dir=await lstat(folder),actualDir=await realpath(folder)
    if(parent.isSymbolicLink()||dir.isSymbolicLink()||actualDir.toLowerCase()!==folder.toLowerCase())throw Error('INVALID_EXPORT_DIRECTORY')
    const file=join(actualDir,media.file),before=await lstat(file)
    if(!before.isFile()||before.isSymbolicLink())throw Error('INVALID_EXPORT_FILE')
    const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes)
    const after=await lstat(file)
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||hash.digest('hex')!==media.sha256)canonicalValid=false
   }catch{canonicalValid=false}
  }
  if(!canonicalValid){protectedExports++;continue}
  for(const item of result.decoded){
   if(result.files.some(f=>f.file===item.file)||!/^decoded-(?:[a-f0-9]{8}-)?[0-9]+\.wav$/.test(item.file))continue
   try{
    const parent=await lstat(join(root,'exports')),dir=await lstat(folder),actualDir=await realpath(folder)
    if(parent.isSymbolicLink()||dir.isSymbolicLink()||actualDir.toLowerCase()!==folder.toLowerCase()||!actualDir.toLowerCase().startsWith((root+sep).toLowerCase()))throw Error('INVALID_EXPORT_DIRECTORY')
    const file=join(actualDir,item.file),info=await lstat(file),actual=await realpath(file)
    if(info.isSymbolicLink()||!info.isFile()||dirname(actual).toLowerCase()!==actualDir.toLowerCase())throw Error('INVALID_EXPORT_FILE')
    await rm(actual);removed+=BigInt(info.size)
   }catch(error){if(!absent(error))throw error}
  }
 }
 return {freedBytes:removed.toString(),protectedExports}
}
