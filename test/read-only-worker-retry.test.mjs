import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m11',{recursive:true})
await build({entryPoints:['src/trace/readOnlyWorkerRetry.ts'],outfile:'artifacts/m11/hash-retry.cjs',bundle:true,platform:'node',format:'cjs'})
const {retryHashWorker}=(await import(pathToFileURL(resolve('artifacts/m11/hash-retry.cjs')))).default
test('a crashed read-only hash process gets exactly one fresh attempt with an observable diagnostic',async()=>{
 let count=0;const logs=[];const expected=['a'.repeat(64)]
 const result=await retryHashWorker(async()=>{if(++count===1)throw Error('FILE_WORKER_EXIT 3221225477: ');return expected},undefined,m=>logs.push(m))
 assert.deepEqual(result,expected);assert.equal(count,2);assert.equal(logs.length,1)
})
test('persistent crashes, cancellations, changed files and ordinary IO errors remain failures',async()=>{
 for(const [message,aborted,expected] of [['FILE_WORKER_EXIT 3221225477: ',false,2],['FILE_WORKER_EXIT 3221225477: ',true,1],['HASH_SOURCE_CHANGED',false,1],['ENOENT',false,1],['FILE_WORKER_EXIT 1: bad input',false,1]]){
  let count=0;const signal=new AbortController();if(aborted)signal.abort();await assert.rejects(retryHashWorker(async()=>{count++;throw Error(message)},signal.signal,()=>{}),e=>e.message===message);assert.equal(count,expected)
 }
})
