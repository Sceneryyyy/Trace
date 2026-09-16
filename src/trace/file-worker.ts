import { createRequire } from 'node:module'
import { analyzeAsset,sha256 } from './analysisWorker'
import {stat,copyFile} from 'node:fs/promises'
import type { AnalyzeJob } from './analysisWorker'
const nativeRequire=createRequire(__filename)
process.once('message',async(message:unknown)=>{
  try{
    const job=message as {kind:string;nativePath:string;files:Array<{source:string;target:string}>}
    let results:unknown
    if(job.kind==='analyze'){
      results=await analyzeAsset(message as AnalyzeJob,progress=>{const memory=process.memoryUsage();process.send?.({type:'progress',progress:{...progress,rssBytes:memory.rss,heapUsedBytes:memory.heapUsed}})})
    }else if(job.kind==='copy-export'){
      const input=message as {nativePath:string;source:string;temporary:string;target:string;expectedSha256:string}
      await copyFile(input.source,input.temporary)
      if(await sha256(input.temporary)!==input.expectedSha256)throw Error('EXPORTED_COPY_CHANGED')
      const native=nativeRequire(input.nativePath) as {publishNewFile(source:string,target:string):void}
      native.publishNewFile(input.temporary,input.target);results={target:input.target}
    }else if(job.kind==='hash'){
      const input=message as {sources:string[]}
      if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>10000||!input.sources.every(p=>typeof p==='string'&&p.length>0&&!p.includes('\0')))throw Error('INVALID_HASH_JOB')
      const hashes:string[]=[]
      for(const source of input.sources){const before=await stat(source),hash=await sha256(source),after=await stat(source);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('HASH_SOURCE_CHANGED');hashes.push(hash)}
      results=hashes
    }else if(job.kind==='quantize'){
      const input=message as {nativePath:string;sources:string[];base:string;encoding:string}
      const native=nativeRequire(input.nativePath) as {convertWaves(sources:string[],base:string,encoding:string):unknown}
      results=native.convertWaves(input.sources,input.base,input.encoding)
    }else if(job.kind==='recover'&&Array.isArray(job.files)&&job.files.length<=10000){
      const native=nativeRequire(job.nativePath) as {recoverWave(source:string,target:string):unknown}
      results=job.files.map(file=>native.recoverWave(file.source,file.target))
    }else throw Error('INVALID_FILE_JOB')
    process.send?.({ok:true,results},()=>process.exit(0))
  }catch(error){process.send?.({ok:false,error:String(error)},()=>process.exit(1))}
})
