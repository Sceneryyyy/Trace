import { createReadStream } from 'node:fs'
import { mkdir, writeFile, rename, lstat, realpath, stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { join, sep } from 'node:path'
import { AnalysisCache, validateManifest } from './analysisCache'
import { analysisCacheKeyVersion, analysisSchemaVersion, measurementConfigId } from './analysisTypes'
import type { AnalysisManifest, FileAnalysisResult, AnalysisProgress } from './analysisTypes'

const requireNative=createRequire(__filename)
type AnalyzeNative={analyzeWaves(sources:string[],directory:string,readFrames:number,progress:(current:string,total:string)=>void,range?:{startFrame:string;endFrame:string}):FileAnalysisResult}
export type AnalyzeJob={kind:'analyze';id:string;nativePath:string;sources:string[];cacheRoot:string;readFrames?:number;mediaIdentity?:string;range?:{startFrame:string;endFrame:string}}
export type AnalyzeJobResult={directory:string;cacheHit:boolean;manifest:AnalysisManifest}
export async function sha256(file:string):Promise<string>{
  const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')
}
function keyFor(sourceSha256:string[],engineSha256:string,range?:AnalyzeJob['range'],mediaIdentity?:string):string {
  return createHash('sha256').update(JSON.stringify({cacheKeyVersion:analysisCacheKeyVersion,schemaVersion:analysisSchemaVersion,measurementConfigId,sourceSha256,engineSha256,range,mediaIdentity})).digest('hex')
}
async function quarantine(cacheRoot:string,directory:string):Promise<void>{
  const root=await realpath(cacheRoot),details=await lstat(directory)
  if(!details.isDirectory()||details.isSymbolicLink())throw Error('INVALID_CACHE_DIRECTORY')
  const resolved=await realpath(directory)
  if(!resolved.toLowerCase().startsWith((root+sep).toLowerCase()))throw Error('INVALID_CACHE_DIRECTORY')
  await rename(resolved,resolved+'.corrupt-'+randomUUID())
}
export async function analyzeAsset(job:AnalyzeJob,progress:(value:AnalysisProgress)=>void):Promise<AnalyzeJobResult>{
  if(!/^[a-f0-9-]{36}$/.test(job.id)||!Array.isArray(job.sources)||!job.sources.length||job.sources.length>10000||
    !job.sources.every(p=>typeof p==='string'&&p.length>0&&!p.includes('\0'))||typeof job.cacheRoot!=='string')throw Error('INVALID_ANALYSIS_JOB')
  if(job.mediaIdentity!==undefined&&!/^[a-f0-9]{64}$/.test(job.mediaIdentity))throw Error('INVALID_MEDIA_IDENTITY')
  if(job.range&&(!/^[0-9]{1,20}$/.test(job.range.startFrame)||!/^[0-9]{1,20}$/.test(job.range.endFrame)||BigInt(job.range.endFrame)>0xffffffffffffffffn||BigInt(job.range.startFrame)>=BigInt(job.range.endFrame)))throw Error('INVALID_ANALYSIS_RANGE')
  const frames=String(0)
  progress({phase:'hashing',frames,totalFrames:frames})
  const before=await Promise.all(job.sources.map(async file=>{const details=await stat(file);return {size:details.size,mtime:details.mtimeMs}}))
  const sourceSha256:string[]=[]
  for(const file of job.sources)sourceSha256.push(await sha256(file))
  const engineSha256=await sha256(job.nativePath),cacheKey=keyFor(sourceSha256,engineSha256,job.range,job.mediaIdentity)
  await mkdir(job.cacheRoot,{recursive:true})
  const directory=join(job.cacheRoot,cacheKey)
  try{
    const details=await lstat(directory)
    if(!details.isDirectory()||details.isSymbolicLink())throw Error('INVALID_CACHE_DIRECTORY')
    try{
      progress({phase:'verifying',frames,totalFrames:frames})
      const cache=await AnalysisCache.open(directory,cacheKey)
      if(cache.manifest.engineSha256!==engineSha256||JSON.stringify(cache.manifest.sourceSha256)!==JSON.stringify(sourceSha256)||JSON.stringify(cache.manifest.sourceRange)!==JSON.stringify(job.range)||cache.manifest.mediaIdentity!==job.mediaIdentity)throw Error('CORRUPT_CACHE: binding')
      await cache.validateAll()
      progress({phase:'ready',frames:cache.manifest.frames,totalFrames:cache.manifest.frames})
      return {directory,cacheHit:true,manifest:cache.manifest}
    }catch(error){
      const e=error as NodeJS.ErrnoException
      if(!String(error).includes('CORRUPT_CACHE')&&!['ENOENT','EISDIR'].includes(e.code||''))throw error
      await quarantine(job.cacheRoot,directory)
    }
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  const working=directory+'.pending-'+job.id
  const native=requireNative(job.nativePath) as AnalyzeNative
  const result=native.analyzeWaves(job.sources,working,job.readFrames??2048,(current,total)=>progress({phase:'analyzing',frames:current,totalFrames:total}),job.range)
  progress({phase:'verifying',frames:result.frames,totalFrames:result.frames})
  for(let i=0;i<job.sources.length;i++){
    const after=await stat(job.sources[i])
    if(after.size!==before[i].size||after.mtimeMs!==before[i].mtime||await sha256(job.sources[i])!==sourceSha256[i])throw Error('ANALYSIS_SOURCE_CHANGED')
  }
  if(await sha256(job.nativePath)!==engineSha256)throw Error('ANALYSIS_ENGINE_CHANGED')
  const manifest:AnalysisManifest={...result,cacheKeyVersion:analysisCacheKeyVersion,mediaIdentity:job.mediaIdentity,sourceRange:job.range,status:'ready',cacheKey,engineSha256,sourceSha256,createdAt:new Date().toISOString()}
  validateManifest(manifest,cacheKey)
  await writeFile(join(working,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
  const verified=await AnalysisCache.open(working,cacheKey);await verified.validateAll()
  await rename(working,directory)
  progress({phase:'ready',frames:result.frames,totalFrames:result.frames})
  return {directory,cacheHit:false,manifest}
}
