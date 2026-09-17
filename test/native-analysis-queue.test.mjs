import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m12',{recursive:true});await build({entryPoints:['src/trace/nativeAnalysisQueue.ts'],outfile:'artifacts/m12/native-queue.cjs',bundle:true,platform:'node',format:'cjs'})
const {NativeAnalysisQueue}=(await import(pathToFileURL(resolve('artifacts/m12/native-queue.cjs')))).default
const tick=()=>new Promise(r=>setImmediate(r))
test('all FFT consumers share two slots, retain FIFO within priority and cannot accumulate an unbounded queue',async()=>{
 const q=new NativeAnalysisQueue(),started=[],finish=[];let active=0,peak=0;const work=i=>q.run(async()=>{started.push(i);active++;peak=Math.max(peak,active);await new Promise(r=>finish[i]=r);active--;return i},i===2?1:0)
 const jobs=[0,1,2,3,4,5].map(work);await tick();assert.deepEqual(started,[0,1]);await assert.rejects(work(6),/QUEUE_FULL/);finish[0]();await tick();assert.deepEqual(started,[0,1,3]);finish[1]();await tick();assert.deepEqual(started,[0,1,3,4]);finish[3]();await tick();finish[4]();await tick();assert.deepEqual(started,[0,1,3,4,5,2]);finish[5]();finish[2]();assert.deepEqual(await Promise.all(jobs),[0,1,2,3,4,5]);assert.equal(peak,2);await q.close()
})
test('closing rejects queued work and waits for active native callbacks before releasing the queue',async()=>{
 const q=new NativeAnalysisQueue();let a,b;const running=[q.run(()=>new Promise(r=>a=r)),q.run(()=>new Promise(r=>b=r))];await tick();const queued=q.run(async()=>3),rejected=assert.rejects(queued,/CLOSED/);let done=false;const closing=q.close().then(()=>done=true);await tick();assert(!done);a(1);b(2);await Promise.all([...running,closing,rejected]);assert.equal(q.usage.active,0);await assert.rejects(q.run(async()=>4),/CLOSED/)
})
