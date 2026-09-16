import { spawn } from 'node:child_process'
import {retryHashWorker} from './readOnlyWorkerRetry'
import { join, sep,dirname,basename,isAbsolute } from 'node:path'
import { readdir, realpath, rm,writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { AnalyzeJob, AnalyzeJobResult } from './analysisWorker'
import type { AnalysisProgress } from './analysisTypes'
type RecoveredWave={sampleRate:number;channelCount:number;containerBits:number;encoding:string;frames:string}
type JobOptions={signal?:AbortSignal;progress?:(value:AnalysisProgress)=>void}
async function cleanupPending(root:string,id:string):Promise<void>{
  let base:string
  try{base=await realpath(root)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
  for(const entry of await readdir(base,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!entry.name.endsWith('.pending-'+id))continue
    const target=await realpath(join(base,entry.name))
    if(!target.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('INVALID_CACHE_CLEANUP_PATH')
    await rm(target,{recursive:true})
  }
}
async function runJob<T>(job:Record<string,unknown>,options:JobOptions={}):Promise<T>{
  if(options.signal?.aborted)throw Error('ANALYSIS_CANCELLED')
  try{
    return await new Promise<T>((resolve,reject)=>{
      const child=spawn(process.execPath,[join(__dirname,'file-worker.js')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true})
      let settled=false,stderr='',cancelled=false
      let result:{ok:boolean;results:T;error:string}|undefined
      const abort=()=>{cancelled=true;child.kill()}
      options.signal?.addEventListener('abort',abort,{once:true})
      child.stderr?.on('data',data=>{stderr=(stderr+data).slice(-8000)})
      child.on('error',error=>{if(!settled){settled=true;options.signal?.removeEventListener('abort',abort);reject(error)}})
      child.on('message',(value:unknown)=>{
        if(settled)return
        const message=value as {type?:string;progress:AnalysisProgress;ok:boolean;results:T;error:string}
        if(message.type==='progress'){try{options.progress?.(message.progress)}catch{}}
        else result=message
      })
      child.on('close',code=>{
        if(settled)return;settled=true;options.signal?.removeEventListener('abort',abort)
        if(cancelled)reject(Error('ANALYSIS_CANCELLED'))
        else if(code===0&&result?.ok)resolve(result.results)
        else reject(Error(result?.error||'FILE_WORKER_EXIT '+code+': '+stderr))
      })
      child.send(job,error=>{if(error&&!settled){result={ok:false,results:undefined as T,error:String(error)};child.kill()}})
      if(options.signal?.aborted)abort()
    })
  }finally{if(job.kind==='analyze')await cleanupPending(job.cacheRoot as string,job.id as string)}
}
export function recoverFiles(nativePath:string,files:Array<{source:string;target:string}>):Promise<RecoveredWave[]>{
  return runJob({kind:'recover',nativePath,files})
}
export function analyzeFiles(nativePath:string,sources:string[],cacheRoot:string,options:JobOptions&{readFrames?:number;mediaIdentity?:string;range?:AnalyzeJob['range']}={}):Promise<AnalyzeJobResult>{
  const job:AnalyzeJob={kind:'analyze',id:randomUUID(),nativePath,sources,cacheRoot,readFrames:options.readFrames,mediaIdentity:options.mediaIdentity,range:options.range}
  return runJob(job,options)
}

export type QuantizedWave={sampleRate:number;channelCount:number;frames:string;clippedSamples:string;segments:Array<{file:string;frames:string;clippedSamples:string}>}
export function quantizeFiles(nativePath:string,sources:string[],base:string,encoding:string,options:JobOptions={}):Promise<QuantizedWave>{
  return runJob({kind:"quantize",nativePath,sources,base,encoding},options)
}

export function hashFiles(sources:string[],options:JobOptions={}):Promise<string[]>{return retryHashWorker(()=>runJob({kind:"hash",sources},options),options.signal)}

export async function copyExportFile(nativePath:string,source:string,target:string,expectedSha256:string,options:JobOptions={}):Promise<{target:string}>{
 if(!isAbsolute(target)||target.includes('\0')||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('INVALID_EXPORT_COPY')
 const parent=await realpath(dirname(target)),destination=join(parent,basename(target)),temporary=join(parent,'.trace-export-'+randomUUID()+'.tmp')
 if(!destination.startsWith(parent+sep)||!temporary.startsWith(parent+sep))throw Error('INVALID_EXPORT_COPY')
 await writeFile(temporary,new Uint8Array(0),{flag:'wx'})
 try{return await runJob({kind:'copy-export',nativePath,source,temporary,target:destination,expectedSha256},options)}
 finally{await rm(temporary,{force:true})}
}
