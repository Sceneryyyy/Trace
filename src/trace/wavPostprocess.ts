import {sessionWavePreset} from './recordSettings'
import {mediaProcess} from './mediaProcess'
import {createReadStream} from 'node:fs'
import {mkdir,readdir,writeFile,rename,realpath,lstat,rm} from 'node:fs/promises'
import {join,sep,basename} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {quantizeFiles} from './fileJobs'
import type {StoredSession,SessionAsset} from './sessionStore'
type PcmEncoding=SessionAsset['encoding']
async function hash(path:string){const value=createHash('sha256');for await(const bytes of createReadStream(path))value.update(bytes);return value.digest('hex')}
function execute(program:string,args:string[]):Promise<string>{return mediaProcess(program,args,{capture:true})}

type Input={paths:string[];rate:number;channels:number;frames:bigint}
type Output={path:string;frames:bigint;hash:string;clippedSamples:string}
async function render(input:Input,directory:string,rate:number,channels:number,encoding:PcmEncoding,ffmpeg:string,ffprobe:string,nativePath:string):Promise<Output[]>{
 await mkdir(directory,{recursive:true})
 const codec={pcm16:'pcm_s16le',pcm24:'pcm_s24le',float32:'pcm_f32le'}[encoding]
 const clips=new Map<string,string>()
 if(encoding!=='float32'){
  let paths=input.paths
  if(input.rate!==rate||input.channels!==channels){
   const normalized=await render(input,join(directory,'normalized'),rate,channels,'float32',ffmpeg,ffprobe,nativePath)
   paths=normalized.map(part=>part.path)
  }
  const converted=await quantizeFiles(nativePath,paths,join(directory,'part'),encoding)
  if(converted.sampleRate!==rate||converted.channelCount!==channels)throw Error('WAV_PRECISION_FORMAT_MISMATCH')
  if(converted.segments.reduce((n,part)=>n+BigInt(part.clippedSamples),0n)!==BigInt(converted.clippedSamples))throw Error('WAV_CLIP_COUNT_MISMATCH')
  for(const part of converted.segments){
   if(basename(part.file)!==part.file||!/^part-[0-9]+\.wav$/.test(part.file)||!/^[0-9]+$/.test(part.clippedSamples))throw Error('INVALID_PRECISION_RESULT')
   clips.set(part.file,part.clippedSamples)
  }
 }else{
  const list=join(directory,'input.ffconcat')
  await writeFile(list,'ffconcat version 1.0\n'+input.paths.map(path=>"file '"+path.split(String.fromCharCode(92)).join('/').replaceAll("'","'"+String.fromCharCode(92)+"''")+"'").join('\n'))
  const args=['-nostdin','-hide_banner','-loglevel','error','-n','-protocol_whitelist','file,pipe','-f','concat','-safe','0','-i',list,'-map','0:a:0','-vn']
  if(input.channels===1&&channels===2)args.push('-af','pan=stereo|c0=0.7071067811865476*c0|c1=0.7071067811865476*c0')
  args.push('-ar',String(rate),'-ac',String(channels),'-c:a',codec,'-threads','1','-f','segment','-segment_format','wav','-segment_time',String((2147483648-1048576)/(rate*channels*4)),'-reset_timestamps','1',join(directory,'part-%05d.wav'))
  await execute(ffmpeg,args)
 }
 const outputs:Output[]=[]
 const names=(await readdir(directory)).filter(name=>/^part-[0-9]+\.wav$/.test(name)).sort((a,b)=>Number(a.slice(5,-4))-Number(b.slice(5,-4)))
 for(const name of names){
  const path=join(directory,name),probe=JSON.parse(await execute(ffprobe,['-v','error','-f','wav','-show_entries','stream=codec_name,sample_rate,channels,duration_ts','-of','json',path])).streams?.[0]
  if(!probe||probe.codec_name!==codec||Number(probe.sample_rate)!==rate||probe.channels!==channels||!/^[0-9]+$/.test(String(probe.duration_ts)))throw Error('WAV_POSTPROCESS_FORMAT_MISMATCH')
  const clippedSamples=encoding==='float32'?'0':clips.get(name)
  if(clippedSamples===undefined||BigInt(clippedSamples)>BigInt(probe.duration_ts)*BigInt(channels))throw Error('WAV_CLIP_COUNT_MISMATCH')
  outputs.push({path,frames:BigInt(probe.duration_ts),hash:await hash(path),clippedSamples})
 }
 if(!outputs.length)throw Error('WAV_POSTPROCESS_EMPTY')
 const count=outputs.reduce((n,o)=>n+o.frames,0n),difference=count*BigInt(input.rate)-input.frames*BigInt(rate)
 if((difference<0n?-difference:difference)>BigInt(input.rate))throw Error('WAV_POSTPROCESS_DURATION_MISMATCH')
 return outputs
}
async function publish(take:StoredSession,outputs:Output[],role:SessionAsset['role'],rate:number,channels:number,encoding:PcmEncoding,token:string):Promise<SessionAsset[]>{
 const assets:SessionAsset[]=[]
 for(let i=0;i<outputs.length;i++){
  const name=take.document.name+'-'+role+'-'+token+'-'+(i+1)+'.wav'
  await rename(outputs[i].path,join(take.directory,'audio',name))
  assets.push({assetId:take.document.sessionId+'-'+role+'-'+token+'-'+i,role,relativePath:'audio/'+name,sampleRate:rate,channelCount:channels,encoding,frameCount:outputs[i].frames.toString(),hash:outputs[i].hash,clippedSamples:outputs[i].clippedSamples})
 }
 take.document.assets.push(...assets)
 const clippedSamples=outputs.reduce((n,a)=>n+BigInt(a.clippedSamples),0n).toString()
 if(clippedSamples!=='0')await take.event('asset.clipped',{role,assetIds:assets.map(a=>a.assetId),clippedSamples,encoding,sourcePreserved:true})
 return assets
}
async function cleanConversion(directory:string,temporary:string,token:string):Promise<void>{
 try{
  const base=await realpath(directory),details=await lstat(temporary),target=await realpath(temporary)
  if(!details.isDirectory()||details.isSymbolicLink()||basename(target)!=='conversion-'+token||!target.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_CONVERSION_CLEANUP_PATH')
  await rm(target,{recursive:true})
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
}
export async function postprocessWav(take:StoredSession,ffmpeg:string,ffprobe:string,nativePath:string,inputRole:'source'|'recovered'='source'):Promise<void>{
 const d=take.document,compressed=Boolean(d.preset.format),preset=sessionWavePreset(d.preset)
 const sources=d.assets.filter(a=>a.role===inputRole&&!['superseded','removed','removing'].includes(a.state||'')),usable=d.regions.filter(r=>BigInt(r.frames)>0n)
 if(!sources.length||!usable.length)return
 const target=preset.sampleRate==='source'?d.sourceFormat.sampleRate:preset.sampleRate,channels=Math.max(...usable.map(r=>r.format.channelCount))
 const token=randomUUID(),temp=join(take.directory,'conversion-'+token);let owned=false
 try{
 await mkdir(temp);owned=true
 if(d.regions.length===1){
  if(compressed)return
  const r=usable[0],assets=sources.filter(a=>a.regionId===r.id),input={paths:assets.map(a=>join(take.directory,a.relativePath)),rate:r.format.sampleRate,channels:r.format.channelCount,frames:BigInt(r.frames)}
  if(preset.sampleRate==='source'||(target===input.rate&&assets.every(a=>a.encoding===preset.encoding)))return
  await publish(take,await render(input,temp,target,input.channels,preset.encoding,ffmpeg,ffprobe,nativePath),'deliverable',target,input.channels,preset.encoding,token)
  return
 }
 let prefix=0n;const normalized:Output[]=[];d.viewParts=[]
 for(const r of usable){
  const assets=sources.filter(a=>a.regionId===r.id)
  const input={paths:assets.map(a=>join(take.directory,a.relativePath)),rate:r.format.sampleRate,channels:r.format.channelCount,frames:BigInt(r.frames)}
  const output=await render(input,join(temp,'region-'+r.ordinal),target,channels,'float32',ffmpeg,ffprobe,nativePath)
  const count=output.reduce((n,a)=>n+a.frames,0n);d.viewParts.push({regionId:r.id,startFrame:prefix.toString(),frameCount:count.toString(),sampleRate:target});prefix+=count;normalized.push(...output)
 }
 const merged=await render({paths:normalized.map(a=>a.path),rate:target,channels,frames:prefix},join(temp,'view'),target,channels,'float32',ffmpeg,ffprobe,nativePath)
 const view=await publish(take,merged,'session',target,channels,'float32',token)
 if(!compressed&&preset.sampleRate!=='source'){
  if(preset.encoding==='float32')d.assets.push(...view.map((a,i)=>({...a,assetId:d.sessionId+'-deliverable-'+token+'-'+i,role:'deliverable' as const})))
  else{
   const output=await render({paths:view.map(a=>join(take.directory,a.relativePath)),rate:target,channels,frames:prefix},join(temp,'deliverable'),target,channels,preset.encoding,ffmpeg,ffprobe,nativePath)
   await publish(take,output,'deliverable',target,channels,preset.encoding,token)
  }
 }
 await take.event('session.view.ready',{sampleRate:target,channelCount:channels,frames:prefix.toString(),gapsOmitted:true,monoMapping:channels===2?'equal-power-center':'mono'})
 }finally{if(owned)await cleanConversion(take.directory,temp,token)}
}
