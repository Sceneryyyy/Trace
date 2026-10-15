import {readRegularFile} from './metadataFile'
import {enforceSpectralBudget,protectSpectralFile} from './spectralDiskBudget'
import {mkdir,lstat,writeFile,rename,unlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {encodeSpectrogramTile,decodeSpectrogramTile} from './spectrogramCodec'
import {validateSpectrogramTile,type SpectrogramTile} from './spectrogramTile'
export type TileRequest={key:string;firstFrame:string;columns:number}
type Cached={tile:SpectrogramTile;bytes:number}
/** Owns only rebuildable spectral tiles. No PCM/audio writes and no recursive deletion. */
export class SpectrogramStore{
 private memory=new Map<string,Cached>()
 private bytes=0
 private pending=new Map<string,Promise<SpectrogramTile>>()
 private tail:Promise<unknown>=Promise.resolve()
 private generation=0
 private closed=false
 readonly root:string|undefined
 constructor(private fetchTile:(request:TileRequest)=>Promise<SpectrogramTile>,root?:string,readonly budgetBytes=64*1024*1024){
  if(!Number.isSafeInteger(budgetBytes)||budgetBytes<4*1024*1024)throw Error('INVALID_SPECTROGRAM_BUDGET')
  this.root=root?resolve(root):undefined
 }
 hasMemory(r:TileRequest):boolean{const cached=this.memory.get(this.id(r));return Boolean(cached&&cached.tile.columns>=r.columns)}
 get usage(){return {bytes:this.bytes,tiles:this.memory.size,pending:this.pending.size}}
 retainRange(key:string,startFrame:string,endFrame:string):void{
  const start=BigInt(startFrame),end=BigInt(endFrame)
  for(const [id,item] of this.memory){const first=BigInt(item.tile.firstFrame),last=first+BigInt((item.tile.columns-1)*item.tile.hop)
   if(!id.startsWith(key+':')||last<start||first>end){this.memory.delete(id);this.bytes-=item.bytes}
  }
 }
 private id(r:TileRequest){if(!/^[a-f0-9]{64}$/.test(r.key)||!/^[0-9]{1,20}$/.test(r.firstFrame)||BigInt(r.firstFrame)>0xffffffffffffffffn||!Number.isInteger(r.columns)||r.columns<1||r.columns>64)throw Error('INVALID_TILE_REQUEST');return r.key+':'+r.firstFrame}
 private keep(id:string,tile:SpectrogramTile){
  const previous=this.memory.get(id);if(previous)this.bytes-=previous.bytes
  this.memory.delete(id);const bytes=tile.decibels.byteLength+tile.status.byteLength+256
  this.memory.set(id,{tile,bytes});this.bytes+=bytes
  while(this.bytes>this.budgetBytes){const first=this.memory.entries().next().value!;this.memory.delete(first[0]);this.bytes-=first[1].bytes}
 }
 async get(request:TileRequest):Promise<SpectrogramTile>{
  const id=this.id(request);if(this.closed)throw Error('SPECTROGRAM_CLOSED')
  const cached=this.memory.get(id)
  if(cached&&cached.tile.columns>=request.columns){this.memory.delete(id);this.memory.set(id,cached);return cached.tile}
  const active=this.pending.get(id);if(active)return active.then(tile=>tile.columns>=request.columns?tile:this.get(request))
  if(this.pending.size>=2)throw Error('SPECTROGRAM_QUEUE_FULL')
  const generation=this.generation,current=()=>{if(this.closed||generation!==this.generation)throw Error('SPECTROGRAM_CANCELLED')}
  const task=this.tail.catch(()=>{}).then(async()=>{
   current();let prefix=cached?.tile;let directory:string|undefined,file:string|undefined
   if(this.root){
    // Refuse links at the owned cache boundary and at each newly-created key directory.
    await mkdir(this.root,{recursive:true});current()
    if((await lstat(this.root)).isSymbolicLink())throw Error('LINKED_SPECTROGRAM_CACHE')
    directory=join(this.root,request.key);await mkdir(directory,{recursive:true});current()
    if((await lstat(directory)).isSymbolicLink())throw Error('LINKED_SPECTROGRAM_CACHE')
    file=join(directory,request.firstFrame+'.bin')
    const release=protectSpectralFile(file);try{
    try{
     const stat=await lstat(file);if(stat.isSymbolicLink())throw Error('LINKED_SPECTROGRAM_CACHE');if(!stat.isFile()||stat.size>4*1024*1024)throw Error('CORRUPT_SPECTROGRAM_TILE')
     const tile=decodeSpectrogramTile(await readRegularFile(file,4*1024*1024,'CORRUPT_SPECTROGRAM_TILE'),request.key);current()
     if(tile.firstFrame!==request.firstFrame)throw Error('CORRUPT_SPECTROGRAM_TILE')
     if(tile.columns>=request.columns){this.keep(id,tile);return tile}
     if(!prefix||tile.columns>prefix.columns)prefix=tile
    }catch(error){
     if((error as NodeJS.ErrnoException).code!=='ENOENT'){
      if(!(error instanceof Error)||error.message!=='CORRUPT_SPECTROGRAM_TILE')throw error
      current();await rename(file,file+'.corrupt-'+randomUUID())
     }
    }
    }finally{release()}
   }
   const next=prefix?{...request,firstFrame:String(BigInt(prefix.firstFrame)+BigInt(prefix.columns*prefix.hop)),columns:request.columns-prefix.columns}:request
   const suffix=validateSpectrogramTile(await this.fetchTile(next));current()
   if(suffix.firstFrame!==next.firstFrame||suffix.columns<next.columns)throw Error('STALE_SPECTROGRAM_TILE')
   let tile=suffix
   if(prefix){
    if(['fftSize','hop','bins','sampleRate','channels'].some(key=>prefix![key as keyof SpectrogramTile]!==suffix[key as keyof SpectrogramTile]))throw Error('STALE_SPECTROGRAM_TILE')
    const decibels=new Float32Array(request.columns*prefix.bins),status=new Uint8Array(request.columns)
    decibels.set(prefix.decibels);decibels.set(suffix.decibels.subarray(0,next.columns*prefix.bins),prefix.decibels.length)
    status.set(prefix.status);status.set(suffix.status.subarray(0,next.columns),prefix.columns)
    tile=validateSpectrogramTile({...prefix,columns:request.columns,decibels,status})
   }
   if(tile.firstFrame!==request.firstFrame||tile.columns<request.columns)throw Error('STALE_SPECTROGRAM_TILE')
   if(file){
    const temporary=file+'.'+randomUUID()+'.tmp';let owned=false
    try{await writeFile(temporary,encodeSpectrogramTile(tile,request.key),{flag:'wx'});owned=true;current();await rename(temporary,file);const release=protectSpectralFile(file);try{await enforceSpectralBudget(this.root!,undefined,file)}finally{release()}}
    finally{if(owned)await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e})}
   }
   current();this.keep(id,tile);return tile
  })
  this.pending.set(id,task);this.tail=task
  try{return await task}finally{if(this.pending.get(id)===task)this.pending.delete(id)}
 }
 async clearMemory(){this.generation++;this.memory.clear();this.bytes=0;await Promise.allSettled([...this.pending.values()])}
 async close(){this.closed=true;await this.clearMemory()}
}
