// Async work must not outlive its owner; Windows Job Objects also stop blocked native work.
process.once('disconnect',()=>process.exit(1))
import {nativeFilePath} from './nativeFilePath'
import { createRequire } from 'node:module'
import { analyzeAsset,sha256 } from './analysisWorker'
import {stat,copyFile} from 'node:fs/promises'
import type { AnalyzeJob } from './analysisWorker'
const nativeRequire=createRequire(__filename)
process.once('message',async(message:unknown)=>{
 const idleLimit=Number(process.env.TRACE_FILE_WORKER_TIMEOUT_MS??180000)
 const beatMs=Math.max(10,Math.min(5000,Math.floor(idleLimit/3)))
 const heartbeat=Number.isFinite(beatMs)?setInterval(()=>process.send?.({type:'heartbeat'}),beatMs):undefined
 heartbeat?.unref()
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
      native.publishNewFile(nativeFilePath(input.temporary),nativeFilePath(input.target));results={target:input.target}
    }else if(job.kind==='hash'){
      if(process.env.TRACE_TEST_ROOT&&process.env.TRACE_TEST_FILE_WORKER_DELAY_MS){
        const delay=Number(process.env.TRACE_TEST_FILE_WORKER_DELAY_MS)
        if(Number.isInteger(delay)&&delay>0&&delay<=10000)await new Promise(resolve=>setTimeout(resolve,delay))
      }
      if(process.env.TRACE_TEST_ROOT&&process.env.TRACE_TEST_FILE_WORKER_BLOCK_MS){
        const delay=Number(process.env.TRACE_TEST_FILE_WORKER_BLOCK_MS)
        if(Number.isInteger(delay)&&delay>0&&delay<=10000)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,delay)
      }
      const input=message as {sources:string[]}
      if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>10000||!input.sources.every(p=>typeof p==='string'&&p.length>0&&!p.includes('\0')))throw Error('INVALID_HASH_JOB')
      const hashes:string[]=[]
      for(const source of input.sources){const before=await stat(source),hash=await sha256(source),after=await stat(source);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('HASH_SOURCE_CHANGED');hashes.push(hash)}
      results=hashes
    }else if(job.kind==='quantize'){
      const input=message as {nativePath:string;sources:string[];base:string;encoding:string}
      const native=nativeRequire(input.nativePath) as {convertWaves(sources:string[],base:string,encoding:string):unknown}
      results=native.convertWaves(input.sources.map(nativeFilePath),nativeFilePath(input.base),input.encoding)
    }else if(job.kind==='recover'&&Array.isArray(job.files)&&job.files.length<=10000){
      const native=nativeRequire(job.nativePath) as {recoverWave(source:string,target:string):unknown}
      results=job.files.map(file=>native.recoverWave(nativeFilePath(file.source),nativeFilePath(file.target)))
    }else throw Error('INVALID_FILE_JOB')
    if(heartbeat)clearInterval(heartbeat)
    process.send?.({ok:true,results},()=>process.exit(0))
  }catch(error){if(heartbeat)clearInterval(heartbeat);process.send?.({ok:false,error:String(error)},()=>process.exit(1))}
})
