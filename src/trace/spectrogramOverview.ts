import {readRegularFile} from './metadataFile'
import {createHash,randomUUID} from 'node:crypto'
import {lstat,writeFile,rename,unlink,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import type {SpectrogramTile} from './spectrogramTile'
import {enforceSpectralBudget,protectSpectralFile} from './spectralDiskBudget'
export type SpectralOverview={version:1;key:string;level:number;firstFrame:string;columns:number;hop:number;fftSize:number;sampleRate:number;channels:number;binStride:number;bins:number;peaks:Float32Array;masks:Uint8Array;ready:Float32Array}
export function overviewFromTile(tile:SpectrogramTile,key:string):SpectralOverview{return {version:1,key,level:0,...tile,binStride:1,peaks:tile.decibels,masks:Uint8Array.from(tile.status,s=>1<<s),ready:Float32Array.from(tile.status,s=>s===1?1:0)}}
export function mergeOverview(a:SpectralOverview,b:SpectralOverview|undefined):SpectralOverview{
 if(b&&(a.key!==b.key||a.level!==b.level||a.fftSize!==b.fftSize||a.sampleRate!==b.sampleRate||a.channels!==b.channels||a.firstFrame===b.firstFrame||BigInt(a.firstFrame)+BigInt(a.columns*a.hop)!==BigInt(b.firstFrame)))throw Error('INVALID_SPECTRAL_OVERVIEW')
 const level=a.level+1,binStride=Math.min(64,a.binStride*2),bins=Math.ceil((a.fftSize/2+1)/binStride),columns=Math.ceil((a.columns+(b?.columns||0))/2)
 const out:SpectralOverview={version:1,key:a.key,level,firstFrame:a.firstFrame,columns,hop:a.hop*2,fftSize:a.fftSize,sampleRate:a.sampleRate,channels:a.channels,binStride,bins,peaks:new Float32Array(columns*bins).fill(-Infinity),masks:new Uint8Array(columns),ready:new Float32Array(columns)}
 for(let col=0;col<a.columns+(b?.columns||0);col++){
  const source=col<a.columns?a:b!,at=col<a.columns?col:col-a.columns,to=Math.floor(col/2)
  out.masks[to]|=source.masks[at];out.ready[to]+=source.ready[at]/2
  if(!(source.masks[at]&2))continue
  for(let bin=0;bin<source.bins;bin++){const target=Math.floor(bin*source.binStride/binStride);out.peaks[to*bins+target]=Math.max(out.peaks[to*bins+target],source.peaks[at*source.bins+bin])}
 }
 if((a.columns+(b?.columns||0))%2)out.masks[columns-1]|=1
 return out
}
export function encodeOverview(v:SpectralOverview):Buffer{
 const array=(v:Float32Array|Uint8Array)=>Buffer.from(v.buffer,v.byteOffset,v.byteLength).toString('base64')
 const payload=Buffer.from(JSON.stringify({...v,peaks:array(v.peaks),masks:array(v.masks),ready:array(v.ready)})),result=Buffer.alloc(40+payload.length)
 result.write('TROV0001');createHash('sha256').update(payload).digest().copy(result,8);payload.copy(result,40);return result
}
export function decodeOverview(bytes:Buffer,key:string,level:number,firstFrame:string):SpectralOverview{
 try{
  if(bytes.length>4*1024*1024||bytes.length<40||bytes.subarray(0,8).toString()!=='TROV0001'||!bytes.subarray(8,40).equals(createHash('sha256').update(bytes.subarray(40)).digest()))throw Error()
  const v=JSON.parse(bytes.subarray(40).toString())
  if(v.version!==1||v.key!==key||v.level!==level||v.firstFrame!==firstFrame||!Number.isInteger(level)||level<1||level>24||![512,1024,2048,4096,8192,16384].includes(v.fftSize)||!Number.isInteger(v.sampleRate)||v.sampleRate<8000||v.sampleRate>96000||![1,2].includes(v.channels)||!Number.isInteger(v.columns)||v.columns<1||v.columns>64||v.binStride!==Math.min(64,2**level)||v.bins!==Math.ceil((v.fftSize/2+1)/v.binStride)||v.hop!==Math.min(v.fftSize/4,Math.floor(v.sampleRate/50))*2**level)throw Error()
  const floats=(s:string,n:number)=>{const b=Buffer.from(s,'base64');if(b.length!==n*4)throw Error();const out=new Float32Array(n);new Uint8Array(out.buffer).set(b);return out}
  v.peaks=floats(v.peaks,v.columns*v.bins);v.ready=floats(v.ready,v.columns);v.masks=Uint8Array.from(Buffer.from(v.masks,'base64'))
  if(v.masks.length!==v.columns||v.masks.some((s:number)=>s<1||s>15)||v.ready.some((n:number)=>!Number.isFinite(n)||n<0||n>1)||v.peaks.some((n:number)=>!Number.isFinite(n)&&n!==-Infinity))throw Error()
  return v
 }catch{throw Error('CORRUPT_SPECTRAL_OVERVIEW')}
}
/** A recursive, disk-backed peak pyramid; at most 24 temporary ancestors. */
export class SpectrogramOverviewStore {
 private cache=new Map<string,SpectralOverview>();bytes=0
 constructor(private raw:(block:bigint)=>Promise<SpectrogramTile>,private key:string,private root?:string,private budget=8*1024*1024){}
 async get(level:number,block:bigint,first:bigint,hop:number,lastBlock:bigint,current:()=>void=()=>{}):Promise<SpectralOverview>{
  current();if(!Number.isInteger(level)||level<0||level>24)throw Error('INVALID_SPECTRAL_OVERVIEW')
  if(level===0){const tile=await this.raw(block);current();return overviewFromTile(tile,this.key)}
  const frame=String(first+block*64n*BigInt(hop)),id=level+':'+frame,cached=this.cache.get(id)
  if(cached){this.cache.delete(id);this.cache.set(id,cached);return cached}
  const file=this.root?join(this.root,this.key,`overview-v1-${level}-${frame}.bin`):undefined
  let value:SpectralOverview|undefined
  if(file){const release=protectSpectralFile(file);try{const stat=await lstat(file);if(stat.isSymbolicLink())throw Error('LINKED_SPECTROGRAM_CACHE');if(!stat.isFile()||stat.size>4*1024*1024)throw Error('CORRUPT_SPECTRAL_OVERVIEW');value=decodeOverview(await readRegularFile(file,4*1024*1024,'CORRUPT_SPECTRAL_OVERVIEW'),this.key,level,frame)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&String(e).includes('CORRUPT_'))await rename(file,file+'.corrupt-'+randomUUID());else if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}finally{release()}}
  if(!value){
   const left=await this.get(level-1,block,first,hop,lastBlock,current),rightBlock=block+(1n<<BigInt(level-1))
   value=mergeOverview(left,rightBlock<=lastBlock?await this.get(level-1,rightBlock,first,hop,lastBlock,current):undefined)
   current();if(file){const dir=join(this.root!,this.key);await mkdir(dir,{recursive:true});if((await lstat(this.root!)).isSymbolicLink()||(await lstat(dir)).isSymbolicLink())throw Error('LINKED_SPECTROGRAM_CACHE')
    const temp=file+'.'+randomUUID()+'.tmp',release=protectSpectralFile(file);let owned=false
    try{await writeFile(temp,encodeOverview(value),{flag:'wx'});owned=true;await rename(temp,file);await enforceSpectralBudget(this.root!,undefined,file)}finally{release();if(owned)await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e})}
   }
  }
  this.cache.set(id,value);this.bytes+=value.peaks.byteLength+value.masks.byteLength+value.ready.byteLength+512
  while(this.bytes>this.budget&&this.cache.size){const [id,v]=[...this.cache.entries()].reduce((a,b)=>b[1].level<a[1].level?b:a);this.cache.delete(id);this.bytes-=v.peaks.byteLength+v.masks.byteLength+v.ready.byteLength+512}
  return value
 }
 clear(){this.cache.clear();this.bytes=0}
}
