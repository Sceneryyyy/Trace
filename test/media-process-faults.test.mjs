import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const compiled=resolve('artifacts/file-faults/process')
await mkdir(compiled,{recursive:true})
await build({entryPoints:['src/trace/mediaProcess.ts','src/trace/media-runner.ts'],outdir:compiled,bundle:true,platform:'node',format:'cjs'})
const {mediaProcess}=(await import(pathToFileURL(join(compiled,'mediaProcess.js')))).default
const options={timeout:15000}
test('real media supervision rejects spawn failures, nonzero exits and bounded output overflow',options,async()=>{
 await assert.rejects(mediaProcess(join(compiled,'missing.exe'),[]),/MEDIA_PROCESS_FAILED.*ENOENT/s)
 await assert.rejects(mediaProcess(process.execPath,['-e',"process.stderr.write('owned failure');process.exit(7)"]),/MEDIA_PROCESS_FAILED: owned failure/)
 await assert.rejects(mediaProcess(process.execPath,['-e',"process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)"],{capture:true,maximumOutput:1024}),/MEDIA_PROCESS_OUTPUT_LIMIT/)
 assert.equal(await mediaProcess(process.execPath,['-e',"process.stdout.write('healthy retry')"],{capture:true}),'healthy retry')
})
test('pre-aborted media jobs never spawn a writer',options,async()=>{
 const root=await mkdtemp(join(tmpdir(),'trace-media-abort-')),target=join(root,'must-not-exist'),controller=new AbortController();controller.abort()
 try{await assert.rejects(mediaProcess(process.execPath,['-e',"require('fs').writeFileSync(process.argv[1],'bad')",target],{signal:controller.signal}),/MEDIA_CANCELLED/);const {readdir}=await import('node:fs/promises');assert.deepEqual(await readdir(root),[])}finally{await rm(root,{recursive:true,force:true})}
})
// Both paths supervise a real process that installs a SIGTERM handler. POSIX
// exercises the grace-period escalation; Windows kill is already forceful.
const stubborn="process.on('SIGTERM',()=>{});process.stdout.write('ready\\n');setInterval(()=>{},1000)"
test('cancelling an encoder that ignores SIGTERM still drains its supervisor',options,async()=>{
 const controller=new AbortController();let announced=false
 const began=Date.now(),job=mediaProcess(process.execPath,['-e',stubborn],{signal:controller.signal,line:line=>{if(line==='ready'){announced=true;controller.abort()}}})
 await assert.rejects(job,/MEDIA_CANCELLED/);assert(announced);assert(Date.now()-began<10000)
 assert.equal(await mediaProcess(process.execPath,['-e',"process.stdout.write('retry')"],{capture:true}),'retry')
})
test('loss of parent IPC cancels and reaps the real encoder',options,async()=>{
 const runner=spawn(process.execPath,[join(compiled,'media-runner.js')],{stdio:['ignore','ignore','pipe','ipc']})
 const exited=once(runner,'exit');let pid
 try{
  const ready=new Promise((resolve,reject)=>{runner.on('error',reject);runner.on('message',message=>{if(message.type==='spawn')pid=message.pid;if(message.type==='stdout'&&message.text.includes('ready'))resolve()})})
  runner.send({program:process.execPath,args:['-e',stubborn]});await ready;assert(pid>0);runner.disconnect();await exited
  assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH')
 }finally{if(runner.connected)runner.disconnect();if(runner.exitCode===null)runner.kill('SIGKILL');if(pid)try{process.kill(pid,'SIGKILL')}catch{}}
})
