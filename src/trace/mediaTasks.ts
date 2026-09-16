import {mkdir,readdir,writeFile,lstat} from 'node:fs/promises'
import {join,basename} from 'node:path'
import {mediaProcess} from './mediaProcess'
import {hashFiles,quantizeFiles} from './fileJobs'
import {validateExportPreset} from './mediaTypes'
import type {MediaTools,MediaInput,MediaProgress,MediaFile,EncodedMedia,ExportPreset,DecodeRecipe} from './mediaTypes'
export type MediaOptions={signal?:AbortSignal;progress?:(value:MediaProgress)=>void;segmentBytes?:number;created?:(directory:string)=>void|Promise<void>}
type Probe={codec_name:string;profile?:string;sample_rate:string;channels:number;time_base?:string;duration_ts?:number|string;bit_rate?:string;initial_padding?:number}
const frame=(value:string)=>/^[0-9]{1,20}$/.test(value)&&BigInt(value)<=0xffffffffffffffffn
function inputRange(input:MediaInput):{start:bigint;end:bigint}{
 if(!input.sources.length||input.sources.length>10000||!input.sources.every(p=>typeof p==='string'&&p.length>0&&!p.includes('\0'))||!frame(input.frames)||
  !Number.isInteger(input.sampleRate)||input.sampleRate<8000||input.sampleRate>96000||![1,2].includes(input.channelCount))throw Error('INVALID_MEDIA_SOURCE')
 if(input.range&&(!frame(input.range.startFrame)||!frame(input.range.endFrame)))throw Error('INVALID_MEDIA_RANGE')
 const start=BigInt(input.range?.startFrame||'0'),end=BigInt(input.range?.endFrame||input.frames)
 if(end<=start||end>BigInt(input.frames))throw Error('INVALID_MEDIA_RANGE')
 const origin=BigInt(input.origin||'0');if(input.origin&&!frame(input.origin)||origin+end>0xffffffffffffffffn)throw Error('INVALID_MEDIA_ORIGIN')
 return {start:origin+start,end:origin+end}
}
async function concatFile(directory:string,sources:string[]):Promise<string>{
 const list=join(directory,'input.ffconcat')
 await writeFile(list,'ffconcat version 1.0\n'+sources.map(path=>"file '"+path.split(String.fromCharCode(92)).join('/').replaceAll("'","'"+String.fromCharCode(92)+"''")+"'").join('\n'),{flag:'wx'})
 return list
}
function progress(options:MediaOptions,phase:MediaProgress['phase'],duration:number){
 options.progress?.({phase,fraction:0})
 return (line:string)=>{
  if(!line.startsWith('out_time_us='))return
  const time=Number(line.slice(12));if(Number.isFinite(time))options.progress?.({phase,fraction:duration>0?Math.max(0,Math.min(1,time/1000000/duration)):0})
 }
}
async function probe(tools:MediaTools,path:string,signal?:AbortSignal):Promise<Probe>{
 const value=JSON.parse(await mediaProcess(tools.ffprobe,['-v','error','-select_streams','a','-show_entries','stream=codec_name,profile,sample_rate,channels,time_base,duration_ts,bit_rate,initial_padding','-of','json',path],{signal,capture:true}))
 if(!Array.isArray(value.streams)||value.streams.length!==1)throw Error('INVALID_MEDIA_STREAM_COUNT')
 return value.streams[0]
}
async function waves(tools:MediaTools,directory:string,rate:number,channels:number,options:MediaOptions):Promise<MediaFile[]>{
 const names=(await readdir(directory)).filter(n=>/^part-[0-9]+\.wav$/.test(n)).sort((a,b)=>Number(a.slice(5,-4))-Number(b.slice(5,-4)))
 if(!names.length)throw Error('MEDIA_DECODE_EMPTY')
 const result:MediaFile[]=[]
 for(const name of names){
  const path=join(directory,name),p=await probe(tools,path,options.signal)
  if(p.codec_name!=='pcm_f32le'||Number(p.sample_rate)!==rate||p.channels!==channels||p.time_base!=='1/'+rate||!frame(String(p.duration_ts)))throw Error('MEDIA_PCM_FORMAT_MISMATCH')
  result.push({path,frames:String(p.duration_ts),sha256:''})
 }
 const hashes=await hashFiles(result.map(f=>f.path),{signal:options.signal})
 return result.map((f,i)=>({...f,sha256:hashes[i]}))
}
export async function floatWave(tools:MediaTools,inputArgs:string[],filter:string|undefined,directory:string,rate:number,channels:number,duration:number,options:MediaOptions,phase:'normalizing'|'decoding'):Promise<MediaFile[]>{
 await mkdir(directory)
 const segmentBytes=options.segmentBytes??2146435072
 if(!Number.isSafeInteger(segmentBytes)||segmentBytes<8192||segmentBytes>2146435072)throw Error('INVALID_MEDIA_SEGMENT_LIMIT')
 const args=['-nostdin','-hide_banner','-loglevel','error','-n',...inputArgs,'-map','0:a:0','-map_metadata','-1','-vn']
 if(filter)args.push('-af',filter)
 args.push('-ar',String(rate),'-ac',String(channels),'-c:a','pcm_f32le','-threads','1','-f','segment','-segment_format','wav','-segment_time',String(segmentBytes/(rate*channels*4)),'-reset_timestamps','1','-progress','pipe:1','-nostats',join(directory,'part-%06d.wav'))
 await mediaProcess(tools.ffmpeg,args,{signal:options.signal,line:progress(options,phase,duration)})
 return waves(tools,directory,rate,channels,options)
}
const total=(files:MediaFile[])=>files.reduce((n,f)=>n+BigInt(f.frames),0n)
export async function verifyMediaTools(tools:MediaTools,signal?:AbortSignal):Promise<void>{
 const hashes=await hashFiles([tools.ffmpeg,tools.ffprobe],{signal})
 if(hashes[0]!==tools.ffmpegSha256||hashes[1]!==tools.ffprobeSha256)throw Error('ENCODER_BUILD_CHANGED')
}
export async function encodeMedia(tools:MediaTools,input:MediaInput,presetValue:ExportPreset,directory:string,options:MediaOptions={}):Promise<EncodedMedia>{
 const preset=validateExportPreset(presetValue),range=inputRange(input),duration=Number(range.end-range.start)/input.sampleRate
 if(options.signal?.aborted)throw Error('MEDIA_CANCELLED')
 await verifyMediaTools(tools,options.signal);options.progress?.({phase:'hashing',fraction:0})
 const sourceSha256=await hashFiles(input.sources,{signal:options.signal})
 await mkdir(directory);await options.created?.(directory)
 const list=await concatFile(directory,input.sources),normalized=await floatWave(tools,['-protocol_whitelist','file,pipe','-f','concat','-safe','0','-i',list],
  'atrim=start_sample='+range.start+':end_sample='+range.end+',asetpts=PTS-STARTPTS',join(directory,'normalized'),preset.sampleRate,input.channelCount,duration,options,'normalizing')
 const frames=total(normalized),expectedNumerator=(range.end-range.start)*BigInt(preset.sampleRate),difference=frames*BigInt(input.sampleRate)-expectedNumerator
 if((difference<0n?-difference:difference)>BigInt(input.sampleRate)||frames===0n)throw Error('MEDIA_NORMALIZED_FRAME_MISMATCH')
 let files:MediaFile[]=[],decoded:MediaFile[]=[],codec:string,container:string,actualBitrate:number|undefined
 let recipe:DecodeRecipe={version:1,startFrame:'0',frames:frames.toString(),physicalFrames:frames.toString(),encoderDelayFrames:'0',endPaddingFrames:'0',containerTrimmed:true}
 if(preset.format==='wav'){
  codec={pcm16:'pcm_s16le',pcm24:'pcm_s24le',float32:'pcm_f32le'}[preset.encoding];container='wav'
  if(preset.encoding==='float32')files=normalized.map(f=>({...f,clippedSamples:'0'}))
  else{
   const outputDir=join(directory,'integer');await mkdir(outputDir)
   const result=await quantizeFiles(tools.nativePath,normalized.map(f=>f.path),join(outputDir,'part'),preset.encoding,{signal:options.signal})
   if(result.frames!==frames.toString())throw Error('MEDIA_QUANTIZED_FRAME_MISMATCH')
   const paths=result.segments.map(s=>{if(basename(s.file)!==s.file||!/^part-[0-9]+\.wav$/.test(s.file))throw Error('INVALID_MEDIA_OUTPUT_PATH');return join(outputDir,s.file)})
   for(let i=0;i<paths.length;i++){const p=await probe(tools,paths[i],options.signal);if(p.codec_name!==codec||Number(p.sample_rate)!==preset.sampleRate||p.channels!==input.channelCount||String(p.duration_ts)!==result.segments[i].frames)throw Error('MEDIA_QUANTIZED_FORMAT_MISMATCH')}
   const hashes=await hashFiles(paths,{signal:options.signal})
   files=paths.map((path,i)=>({path,frames:result.segments[i].frames,clippedSamples:result.segments[i].clippedSamples,sha256:hashes[i]}))
  }
  decoded=files
 }else{
  container=preset.format==='mp3'?'mp3':preset.container;codec=preset.format==='mp3'?'mp3':'aac'
  const encodeList=await concatFile(join(directory,'normalized'),normalized.map(f=>f.path))
  const encoded=join(directory,preset.format==='mp3'?'encoded.mp3':'encoded.m4a')
  const args=['-nostdin','-hide_banner','-loglevel','error','-n','-protocol_whitelist','file,pipe','-f','concat','-safe','0','-i',encodeList,'-map','0:a:0','-map_metadata','-1','-vn','-ar',String(preset.sampleRate),'-ac',String(input.channelCount),'-threads','1','-c:a',preset.format==='mp3'?'libmp3lame':'aac','-b:a',preset.bitrate+'k']
  if(preset.format==='mp3')args.push('-write_xing','1','-id3v2_version','3')
  else args.push('-profile:a','aac_low','-movflags','+faststart','-f','ipod')
  args.push('-progress','pipe:1','-nostats',encoded)
  await mediaProcess(tools.ffmpeg,args,{signal:options.signal,line:progress(options,'encoding',duration)})
  const information=await probe(tools,encoded,options.signal)
  if(information.codec_name!==codec||Number(information.sample_rate)!==preset.sampleRate||information.channels!==input.channelCount||(codec==='aac'&&information.profile!=='LC'))throw Error('ENCODED_FORMAT_MISMATCH')
  actualBitrate=Number(information.bit_rate)||undefined
  if(preset.format==='mp3'&&actualBitrate!==preset.bitrate*1000)throw Error('MP3_BITRATE_MISMATCH')
  let deliverable=encoded
  if(preset.format==='aac'&&preset.container==='adts'){
   deliverable=join(directory,'encoded.aac')
   await mediaProcess(tools.ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-n','-i',encoded,'-map','0:a:0','-c:a','copy','-f','adts',deliverable],{signal:options.signal})
   const adts=await probe(tools,deliverable,options.signal)
   if(adts.codec_name!=='aac'||adts.profile!=='LC'||Number(adts.sample_rate)!==preset.sampleRate||adts.channels!==input.channelCount)throw Error('ADTS_FORMAT_MISMATCH')
   actualBitrate=Number(adts.bit_rate)||actualBitrate
   const delay=information.initial_padding
   if(!Number.isSafeInteger(delay)||!delay||delay<0||delay>8192)throw Error('AAC_PRIMING_UNAVAILABLE')
   recipe={...recipe,startFrame:String(delay),encoderDelayFrames:String(delay),containerTrimmed:false}
  }
  decoded=await floatWave(tools,['-i',deliverable],undefined,join(directory,'decoded'),preset.sampleRate,input.channelCount,duration,options,'decoding')
  const physical=total(decoded),endPadding=physical-BigInt(recipe.startFrame)-frames
  if(endPadding<0n||(recipe.containerTrimmed?endPadding!==0n:endPadding>=1024n))throw Error('ENCODED_DECODED_FRAME_MISMATCH')
  recipe={...recipe,physicalFrames:physical.toString(),endPaddingFrames:endPadding.toString()}
  const [sha256]=await hashFiles([deliverable],{signal:options.signal})
  files=[{path:deliverable,frames:frames.toString(),sha256}]
 }
 options.progress?.({phase:'verifying',fraction:0})
 const after=await hashFiles(input.sources,{signal:options.signal})
 if(after.some((hash,i)=>hash!==sourceSha256[i]))throw Error('MEDIA_SOURCE_CHANGED')
 for(const file of files)if(!(await lstat(file.path)).isFile())throw Error('MEDIA_OUTPUT_MISSING')
 if(options.signal?.aborted)throw Error('MEDIA_CANCELLED')
 return {files,decoded,preset,sampleRate:preset.sampleRate,channelCount:input.channelCount,frames:frames.toString(),sourceSha256,encoderSha256:tools.ffmpegSha256,codec,container,actualBitrate,decodeRecipe:recipe}
}

export async function decodeMedia(tools:MediaTools,source:string,recipe:DecodeRecipe,rate:number,channels:number,directory:string,options:MediaOptions={}):Promise<MediaFile[]>{
 await verifyMediaTools(tools,options.signal)
 const before=await hashFiles([source],{signal:options.signal})
 await mkdir(directory);await options.created?.(directory)
 const decoded=await floatWave(tools,['-i',source],undefined,join(directory,'pcm'),rate,channels,Number(recipe.frames)/rate,options,'decoding')
 if(total(decoded).toString()!==recipe.physicalFrames)throw Error('DECODED_CACHE_FRAME_MISMATCH')
 const after=await hashFiles([source],{signal:options.signal});if(before[0]!==after[0])throw Error('ENCODED_SOURCE_CHANGED')
 return decoded
}
