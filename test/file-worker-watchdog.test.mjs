import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'

const folder=resolve('artifacts/audit/file-worker-watchdog')
await mkdir(folder,{recursive:true})
await Promise.all([
 build({entryPoints:['src/trace/fileJobs.ts'],outfile:join(folder,'fileJobs.cjs'),bundle:true,platform:'node',format:'cjs'}),
 build({entryPoints:['src/trace/file-worker.ts'],outfile:join(folder,'file-worker.js'),bundle:true,platform:'node',format:'cjs'}),
])
const fixture=join(folder,'owned-fixture.bin'),bytes=Buffer.alloc(64*1024,0x5a)
await writeFile(fixture,bytes)
const expected=createHash('sha256').update(bytes).digest('hex')
// Both probes use the actual child-process protocol and a real file. The test
// hook delays only the worker; it neither invents nor replaces the hash result.
process.env.TRACE_FILE_WORKER_TIMEOUT_MS='1500'
process.env.TRACE_TEST_ROOT=folder
const {hashFiles}=(await import(pathToFileURL(join(folder,'fileJobs.cjs')))).default

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
