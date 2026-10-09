import {createHash,randomUUID} from 'node:crypto'
import {lstat,realpath,mkdir,open,readFile,writeFile,readdir,unlink,rmdir} from 'node:fs/promises'
import {basename,dirname,isAbsolute,join,resolve,sep} from 'node:path'
import {hashFiles} from './fileJobs'
import {mediaProcess} from './mediaProcess'
import {wavInputOptions} from './wavInput'
import {mp3Declaration} from './mp3Integrity'
import {floatWave,verifyMediaTools,type MediaOptions} from './mediaTasks'
import {freeSpace} from './storageCapacity'
import type {AssetFormat} from './assetFormat'
import type {MediaTools} from './mediaTypes'

export type ImportFingerprint={path:string;name:string;bytes:string;mtimeMs:number;sha256:string}
export type ImportProbe={source:ImportFingerprint;format:AssetFormat;codec:string;container:string;durationEstimate:number|null;exactFrames?:string}
export type ImportedPCM={version:1;id:string;source:ImportFingerprint;format:AssetFormat;codec:string;frames:string;decoderSha256:string;mediaIdentity:string;trim:'decoder-metadata'|'decoded-content';directory:string;files:Array<{file:string;frames:string;sha256:string}>}
type Stream={codec_type?:string;codec_name?:string;profile?:string;sample_rate?:string;channels?:number;time_base?:string;duration_ts?:number|string;bit_rate?:string;disposition?:{attached_pic?:number}}
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const hashPattern=/^[a-f0-9]{64}$/
const frame=(s:unknown):s is string=>typeof s==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(s)&&BigInt(s)<=0xffffffffffffffffn
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
function check(signal?:AbortSignal){if(signal?.aborted)throw Error('IMPORT_CANCELLED')}
async function inputFile(file:string){
 if(!isAbsolute(file)||file.length>32767||file.includes('\0'))throw Error('INVALID_IMPORT_PATH')
 const path=resolve(file),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||!Number.isSafeInteger(info.size)||info.size<=0)throw Error('INVALID_IMPORT_FILE')
 return {path:await realpath(path),info}
}
export async function fingerprintImport(file:string,signal?:AbortSignal):Promise<ImportFingerprint>{
 check(signal);const before=await inputFile(file),[sha256]=await hashFiles([before.path],{signal}),after=await inputFile(file)
 if(!same(before.path,after.path)||before.info.size!==after.info.size||before.info.mtimeMs!==after.info.mtimeMs)throw Error('IMPORT_SOURCE_CHANGED')
 return {path:after.path,name:basename(file),bytes:String(after.info.size),mtimeMs:after.info.mtimeMs,sha256}
}
export function classifyImport(value:unknown):Omit<ImportProbe,'source'>{
 const v=value as {streams?:Stream[];format?:{format_name?:string;duration?:string}}
 if(!v||!Array.isArray(v.streams)||v.streams.length>32)throw Error('INVALID_IMPORT_MEDIA')
 const audio=v.streams.filter(s=>s.codec_type==='audio')
 if(audio.length!==1||v.streams.some(s=>s.codec_type!=='audio'&&!(s.codec_type==='video'&&s.disposition?.attached_pic===1)))throw Error('UNSUPPORTED_IMPORT_STREAMS')
 const s=audio[0],rate=Number(s.sample_rate),channels=s.channels,codec=s.codec_name||'',names=(v.format?.format_name||'').split(',')
 if(!Number.isInteger(rate)||rate<8000||rate>96000||![1,2].includes(channels||0))throw Error('UNSUPPORTED_IMPORT_FORMAT')
 let format:AssetFormat,container:string
 const precision={pcm_s16le:'pcm16',pcm_s24le:'pcm24',pcm_f32le:'float32'} as const
 if(names.includes('wav')&&Object.hasOwn(precision,codec)){container='wav';format={format:'wav',encoding:precision[codec as keyof typeof precision],sampleRate:rate,channelCount:channels!}}
 else if(names.includes('mp3')&&codec==='mp3'){container='mp3';format={format:'mp3',container,sampleRate:rate,channelCount:channels!}}
 else if(codec==='aac'&&s.profile==='LC'&&(names.includes('aac')||names.includes('mov'))){container=names.includes('aac')?'adts':'m4a';format={format:'aac',container,sampleRate:rate,channelCount:channels!}}
 else throw Error('UNSUPPORTED_IMPORT_CODEC')
 const bitrate=Number(s.bit_rate);if(format.format!=='wav'&&Number.isFinite(bitrate)&&bitrate>0)format.bitrate=Math.round(bitrate/1000)
 const duration=Number(v.format?.duration),durationEstimate=Number.isFinite(duration)&&duration>0?duration:null
 let exactFrames:string|undefined
 if(container==='wav'&&s.time_base==='1/'+rate&&(typeof s.duration_ts==='string'||Number.isSafeInteger(s.duration_ts))&&frame(String(s.duration_ts))&&BigInt(s.duration_ts!)>0n)exactFrames=String(s.duration_ts)
 return {format,codec,container,durationEstimate,exactFrames}
}
export async function probeImport(tools:MediaTools,file:string,signal?:AbortSignal):Promise<ImportProbe>{
 await verifyMediaTools(tools,signal);const source=await fingerprintImport(file,signal)
 const declaration=await mp3Declaration(source.path)
 if(declaration?.bytes!==undefined&&BigInt(declaration.offset)+BigInt(declaration.bytes)>BigInt(source.bytes))throw Error('IMPORT_MP3_TRUNCATED')
 const raw=await mediaProcess(tools.ffprobe,['-v','error','-protocol_whitelist','file,pipe',...await wavInputOptions(source.path),...(declaration?.packets!==undefined?['-count_packets']:[]),'-show_entries','format=format_name,duration:stream=codec_type,codec_name,profile,sample_rate,channels,time_base,duration_ts,bit_rate,nb_read_packets:stream_disposition=attached_pic','-of','json',source.path],{signal,capture:true,maximumOutput:256*1024})
 const value=JSON.parse(raw),classified=classifyImport(value)
 if(classified.container==='mp3'&&declaration?.packets!==undefined&&String(value.streams.find((s:Stream)=>s.codec_type==='audio').nb_read_packets)!==String(declaration.packets))throw Error('IMPORT_MP3_FRAME_MISMATCH')
 return {source,...classified}
}
async function ownedDirectory(root:string,directory:string):Promise<string>{
 const base=await realpath(root),target=resolve(directory),info=await lstat(target),actual=await realpath(target)
 if(!info.isDirectory()||info.isSymbolicLink()||!idPattern.test(basename(target))||!same(dirname(actual),base)||!same(actual,target))throw Error('INVALID_IMPORT_CACHE_DIRECTORY')
 const marker=join(actual,'owner.json'),stat=await lstat(marker);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error('INVALID_IMPORT_CACHE_OWNER')
 const owner=JSON.parse(await readFile(marker,'utf8'));if(owner.product!=='TraceImportedPCM'||owner.version!==1||owner.id!==basename(actual))throw Error('INVALID_IMPORT_CACHE_OWNER')
 return actual
}
export async function readImportedPCM(root:string,id:string,sourceSha256:string,signal?:AbortSignal):Promise<ImportedPCM>{
 if(!idPattern.test(id)||!hashPattern.test(sourceSha256))throw Error('INVALID_IMPORT_CACHE_REFERENCE')
 const directory=await ownedDirectory(root,join(resolve(root),id)),metadata=join(directory,'decoded.json'),info=await lstat(metadata)
 if(!info.isFile()||info.isSymbolicLink()||info.size>16*1024*1024)throw Error('INVALID_IMPORT_CACHE_METADATA')
 const d=JSON.parse(await readFile(metadata,'utf8')) as ImportedPCM
 if(!d||d.version!==1||d.id!==id||!d.source||d.source.sha256!==sourceSha256||!hashPattern.test(d.decoderSha256)||!hashPattern.test(d.mediaIdentity)||!frame(d.frames)||d.frames==='0'||!d.format||!['decoder-metadata','decoded-content'].includes(d.trim)||!Array.isArray(d.files)||!d.files.length||d.files.length>10000)throw Error('INVALID_IMPORT_CACHE_METADATA')
 const normalized=classifyImport({streams:[{codec_type:'audio',codec_name:d.codec,profile:d.codec==='aac'?'LC':undefined,sample_rate:String(d.format.sampleRate),channels:d.format.channelCount,bit_rate:d.format.bitrate===undefined?undefined:String(d.format.bitrate*1000)}],format:{format_name:d.format.format==='aac'?(d.format.container==='adts'?'aac':'mov'):d.format.format}})
 const identity=createHash('sha256').update(JSON.stringify({version:1,sourceSha256,decoder:d.decoderSha256,recipe:'full-external-decoding-v1',frames:d.frames,format:normalized.format})).digest('hex')
 if(identity!==d.mediaIdentity||d.trim!==(normalized.container==='adts'?'decoded-content':'decoder-metadata')||new Set(d.files.map(f=>f.file)).size!==d.files.length)throw Error('INVALID_IMPORT_CACHE_IDENTITY')
 const paths:string[]=[];let frames=0n
 const pcm=join(directory,'pcm'),pcmInfo=await lstat(pcm);if(!pcmInfo.isDirectory()||pcmInfo.isSymbolicLink()||!same(await realpath(pcm),pcm))throw Error('INVALID_IMPORT_CACHE_DIRECTORY')
 for(const [index,f] of d.files.entries()){check(signal);if(f.file!=='pcm/part-'+String(index).padStart(6,'0')+'.wav'||!/^pcm\/part-[0-9]{6}\.wav$/.test(f.file)||!frame(f.frames)||f.frames==='0'||!hashPattern.test(f.sha256))throw Error('INVALID_IMPORT_CACHE_FILE');const file=join(directory,f.file),s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||!same(await realpath(file),file))throw Error('INVALID_IMPORT_CACHE_FILE');paths.push(file);frames+=BigInt(f.frames)}
 if(frames.toString()!==d.frames)throw Error('IMPORT_CACHE_FRAME_MISMATCH')
 const hashes=await hashFiles(paths,{signal});if(hashes.some((h,i)=>h!==d.files[i].sha256))throw Error('IMPORT_DECODED_CACHE_CHANGED')
 return {...d,directory,format:normalized.format}
}
/** Deletes only the decoder's own identified files. Unknown contents stop cleanup. */
export async function removeImportedPCM(root:string,directory:string):Promise<void>{
 const actual=await ownedDirectory(root,directory),names=await readdir(actual),files:string[]=[]
 if(names.some(n=>!['owner.json','decoded.json','pcm'].includes(n)))throw Error('IMPORT_CACHE_HAS_UNKNOWN_FILES')
 const pcm=join(actual,'pcm');if(names.includes('pcm')){
  const info=await lstat(pcm);if(!info.isDirectory()||info.isSymbolicLink()||!same(await realpath(pcm),pcm))throw Error('INVALID_IMPORT_CACHE_DIRECTORY')
  const parts=await readdir(pcm);if(parts.length>10000||parts.some(n=>!/^part-[0-9]{6}\.wav$/.test(n)))throw Error('IMPORT_CACHE_HAS_UNKNOWN_FILES')
  for(const name of parts){const file=join(pcm,name),s=await lstat(file);if(!s.isFile()||s.isSymbolicLink())throw Error('INVALID_IMPORT_CACHE_FILE');files.push(file)}
 }
 if(names.includes('decoded.json')){const file=join(actual,'decoded.json'),s=await lstat(file);if(!s.isFile()||s.isSymbolicLink())throw Error('INVALID_IMPORT_CACHE_FILE');files.push(file)}
 for(const file of files)await unlink(file);if(names.includes('pcm'))await rmdir(pcm);await unlink(join(actual,'owner.json'));await rmdir(actual)
}
export async function decodeImport(tools:MediaTools,file:string,cacheRoot:string,options:MediaOptions&{capacity?:()=>Promise<bigint|null>}={}):Promise<ImportedPCM>{
 if(!isAbsolute(cacheRoot))throw Error('INVALID_IMPORT_CACHE_ROOT')
 await mkdir(cacheRoot,{recursive:true});const rootInfo=await lstat(cacheRoot);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw Error('INVALID_IMPORT_CACHE_ROOT')
 const root=await realpath(cacheRoot),probe=await probeImport(tools,file,options.signal)
 if(probe.source.path.toLowerCase().startsWith((root+sep).toLowerCase()))throw Error('IMPORT_SOURCE_INSIDE_CACHE')
 const available=await (options.capacity?options.capacity():freeSpace(root)),estimate=probe.durationEstimate===null?0:Math.ceil(probe.durationEstimate*probe.format.sampleRate*probe.format.channelCount*4*1.15)
 if(!Number.isSafeInteger(estimate)||available!==null&&available<BigInt(estimate)+512n*1024n*1024n)throw Error('IMPORT_INSUFFICIENT_SPACE')
 check(options.signal);const id=randomUUID(),directory=join(root,id);await mkdir(directory)
 // A failed owner write may leave a torn marker. Track the exclusively opened
 // handle so only our own marker is removed; preserve any foreign contents.
 let marker:Awaited<ReturnType<typeof open>>|undefined
 try{marker=await open(join(directory,'owner.json'),'wx');await marker.writeFile(JSON.stringify({product:'TraceImportedPCM',version:1,id}));await marker.close();marker=undefined}
 catch(error){
  try{if(marker){await marker.close();await unlink(join(directory,'owner.json'))}await rmdir(directory)}catch(cleanupError){console.warn('TRACE_IMPORT_CLEANUP_FAILED',String(cleanupError))}
  throw error
 }
 try{
  const decoded=await floatWave(tools,['-xerror','-err_detect','explode','-protocol_whitelist','file,pipe',...await wavInputOptions(probe.source.path),'-i',probe.source.path],undefined,join(directory,'pcm'),probe.format.sampleRate,probe.format.channelCount,probe.durationEstimate||0,options,'decoding')
  const frames=decoded.reduce((n,f)=>n+BigInt(f.frames),0n).toString();if(frames==='0'||probe.exactFrames&&frames!==probe.exactFrames||decoded.length>10000)throw Error('IMPORT_DECODED_FRAME_MISMATCH')
  options.progress?.({phase:'verifying',fraction:0});const after=await fingerprintImport(file,options.signal);if(after.sha256!==probe.source.sha256||after.bytes!==probe.source.bytes||after.mtimeMs!==probe.source.mtimeMs||!same(after.path,probe.source.path))throw Error('IMPORT_SOURCE_CHANGED')
  const mediaIdentity=createHash('sha256').update(JSON.stringify({version:1,sourceSha256:after.sha256,decoder:tools.ffmpegSha256,recipe:'full-external-decoding-v1',frames,format:probe.format})).digest('hex')
  const result:ImportedPCM={version:1,id,source:after,format:probe.format,codec:probe.codec,frames,decoderSha256:tools.ffmpegSha256,mediaIdentity,trim:probe.container==='adts'?'decoded-content':'decoder-metadata',directory,
   files:decoded.map(f=>({file:'pcm/'+basename(f.path),frames:f.frames,sha256:f.sha256}))}
  if(result.files.some(f=>!/^pcm\/part-[0-9]{6}\.wav$/.test(f.file)||!frame(f.frames)||!hashPattern.test(f.sha256)))throw Error('INVALID_IMPORT_DECODED_FILE')
  check(options.signal);await writeFile(join(directory,'decoded.json'),JSON.stringify(result,null,2),{flag:'wx'});check(options.signal);return result
 }catch(error){try{await removeImportedPCM(root,directory)}catch(cleanupError){console.warn('TRACE_IMPORT_CLEANUP_FAILED',String(cleanupError))}throw error}
}
