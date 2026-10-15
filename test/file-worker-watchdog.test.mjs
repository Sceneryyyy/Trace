import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'

const folder=resolve('artifacts/audit/file-worker-watchdog')
await mkdir(folder,{recursive:true})
await Promise.all([
 build({stdin:{contents:"export * from './src/trace/fileJobs';export {configureMediaProcessJobs} from './src/trace/mediaProcess'",resolveDir:resolve('.')},outfile:join(folder,'fileJobs.cjs'),bundle:true,platform:'node',format:'cjs'}),
 build({entryPoints:['src/trace/file-worker.ts'],outfile:join(folder,'file-worker.js'),bundle:true,platform:'node',format:'cjs'}),
])
const fixture=join(folder,'owned-fixture.bin'),bytes=Buffer.alloc(64*1024,0x5a)
await writeFile(fixture,bytes)
const expected=createHash('sha256').update(bytes).digest('hex')
// Both probes use the actual child-process protocol and a real file. The test
// hook delays only the worker; it neither invents nor replaces the hash result.
process.env.TRACE_FILE_WORKER_TIMEOUT_MS='1500'
process.env.TRACE_TEST_ROOT=folder
const {hashFiles,configureMediaProcessJobs}=(await import(pathToFileURL(join(folder,'fileJobs.cjs')))).default

test('a healthy worker may spend longer than the old fixed timeout in async I/O',async()=>{
 process.env.TRACE_TEST_FILE_WORKER_DELAY_MS='3500'
 delete process.env.TRACE_TEST_FILE_WORKER_BLOCK_MS
 const began=Date.now(),result=await hashFiles([fixture])
 assert(Date.now()-began>3000)
 assert.deepEqual(result,[expected])
 assert((await readFile(fixture)).equals(bytes))
})

test('a child whose event loop stops responding still reaches the watchdog',async()=>{
 delete process.env.TRACE_TEST_FILE_WORKER_DELAY_MS
 process.env.TRACE_TEST_FILE_WORKER_BLOCK_MS='3500'
 await assert.rejects(hashFiles([fixture]),/FILE_WORKER_TIMEOUT/)
 assert((await readFile(fixture)).equals(bytes))
})

test('cancelling an active hash worker rejects promptly and permits a fresh read',async()=>{
 delete process.env.TRACE_TEST_FILE_WORKER_BLOCK_MS
 process.env.TRACE_TEST_FILE_WORKER_DELAY_MS='3500'
 const controller=new AbortController(),job=hashFiles([fixture],{signal:controller.signal}),timer=setTimeout(()=>controller.abort(),100)
 try{await assert.rejects(job,/ANALYSIS_CANCELLED/)}finally{clearTimeout(timer);delete process.env.TRACE_TEST_FILE_WORKER_DELAY_MS}
 assert.deepEqual(await hashFiles([fixture]),[expected]);assert((await readFile(fixture)).equals(bytes))
})

test('an abrupt worker exit cannot return a successful hash and recovery uses a new real worker',async()=>{
 const isolated=join(folder,'abrupt');await mkdir(isolated,{recursive:true})
 await build({entryPoints:['src/trace/fileJobs.ts'],outfile:join(isolated,'fileJobs.cjs'),bundle:true,platform:'node',format:'cjs'})
 const worker=join(isolated,'file-worker.js');await writeFile(worker,'process.once("message",()=>process.exit(137))')
 const {hashFiles:isolatedHash}=(await import(pathToFileURL(join(isolated,'fileJobs.cjs')))).default
 await assert.rejects(isolatedHash([fixture]),/FILE_WORKER_EXIT 137/);assert((await readFile(fixture)).equals(bytes))
 await copyFile(join(folder,'file-worker.js'),worker);assert.deepEqual(await isolatedHash([fixture]),[expected])
})

test('file worker ownership is attached before work and released before returning the hash',async()=>{
 const attached=[],closed=[];configureMediaProcessJobs(pid=>{attached.push(pid);return {close:async()=>{closed.push(pid)}}})
 try{assert.deepEqual(await hashFiles([fixture]),[expected]);assert.equal(attached.length,1);assert(attached[0]>0);assert.deepEqual(closed,attached)}finally{configureMediaProcessJobs(undefined)}
})
test('an async file worker stops promptly when its parent IPC disconnects',async()=>{
 const child=spawn(process.execPath,[join(folder,'file-worker.js')],{env:{...process.env,TRACE_TEST_ROOT:folder,TRACE_TEST_FILE_WORKER_DELAY_MS:'3500',TRACE_FILE_WORKER_TIMEOUT_MS:'60000'},stdio:['ignore','ignore','ignore','ipc']})
 const exited=once(child,'exit');try{
  child.send({kind:'hash',sources:[fixture]});await new Promise(r=>setTimeout(r,150));const began=Date.now();child.disconnect();await exited;assert(Date.now()-began<1500,'worker must not finish the delayed hash after losing its owner')
 }finally{if(child.exitCode===null)child.kill('SIGKILL')}
})
