import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {mkdir,mkdtemp,stat,rm,writeFile,readFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {pathToFileURL} from 'node:url'
const root=resolve('artifacts/p0-p1/windows-process');await mkdir(root,{recursive:true})
await build({entryPoints:['src/trace/mediaProcess.ts','src/trace/media-runner.ts'],outdir:root,bundle:true,platform:'node',format:'cjs'})
const native=createRequire(import.meta.url)(resolve('build/trace-engine/Release/trace_engine.node'))
const {mediaProcess,configureMediaProcessJobs}=(await import(pathToFileURL(join(root,'mediaProcess.js')))).default
configureMediaProcessJobs(pid=>native.processJob(pid))
test('Windows Job Object cleans descendants after supervisor hard termination and allows retry',{timeout:15000},async()=>{
 const dir=await mkdtemp(join(root,'fault-')),file=join(dir,'writes');let runner
 const grandchild="require('fs').appendFileSync(process.argv[1],'x');setInterval(()=>require('fs').appendFileSync(process.argv[1],'x'),15)"
 const encoder="require('child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});setTimeout(()=>process.stdout.write(String(process.ppid)+'\\n'),200);setInterval(()=>{},1000)"
 try{await assert.rejects(mediaProcess(process.execPath,['-e',encoder,grandchild,file],{line:line=>{runner=Number(line);process.kill(runner,'SIGKILL')}}),/MEDIA_PROCESS_FAILED/);assert(runner>0);const before=(await stat(file)).size;await new Promise(r=>setTimeout(r,120));assert.equal((await stat(file)).size,before);assert.equal(await mediaProcess(process.execPath,['-e',"process.stdout.write('healthy')"],{capture:true}),'healthy')}finally{await rm(dir,{recursive:true,force:true})}
})
test('Job Object rejects invalid PIDs without leaking a handle',()=>{for(const pid of [0,-1,NaN,Infinity,1.5,2**32])assert.throws(()=>native.processJob(pid),/INVALID_PROCESS_JOB/)})

test('Windows main-process hard termination closes its Job Object and stops every descendant',{timeout:15000},async()=>{
 const dir=await mkdtemp(join(root,'main-exit-')),file=join(dir,'writes');let host,pids=[]
 const grandchild="require('fs').appendFileSync(process.argv[1],'x');setInterval(()=>require('fs').appendFileSync(process.argv[1],'x'),15)"
 const encoder="const child=require('child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});setTimeout(()=>process.stdout.write(JSON.stringify([process.pid,child.pid])+'\\n'),200);setInterval(()=>{},1000)"
 const owner="const {mediaProcess,configureMediaProcessJobs}=require(process.argv[1]);const native=require(process.argv[2]);configureMediaProcessJobs(pid=>native.processJob(pid));mediaProcess(process.execPath,['-e',process.argv[3],process.argv[4],process.argv[5]],{line:line=>process.stdout.write(line+'\\n')}).catch(()=>{})"
 try{host=spawn(process.execPath,['-e',owner,join(root,'mediaProcess.js'),resolve('build/trace-engine/Release/trace_engine.node'),encoder,grandchild,file],{stdio:['ignore','pipe','pipe']});host.stderr.resume();await new Promise((resolve,reject)=>{host.on('error',reject);host.stdout.once('data',data=>{pids=JSON.parse(String(data));resolve()})});const exit=once(host,'exit');host.kill('SIGKILL');await exit;await new Promise(r=>setTimeout(r,200));const before=(await stat(file)).size;await new Promise(r=>setTimeout(r,120));assert.equal((await stat(file)).size,before);for(const pid of pids)assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH')}finally{host?.kill('SIGKILL');for(const pid of pids)try{process.kill(pid,'SIGKILL')}catch{}await rm(dir,{recursive:true,force:true})}
})

test('Windows file-worker ownership stops a blocked writer after its main process is killed',{timeout:15000},async()=>{
 const dir=await mkdtemp(join(root,'file-owner-')),file=join(dir,'writes'),pidFile=join(dir,'pid'),module=join(dir,'fileJobs.cjs');let host,pid
 await build({stdin:{contents:"export * from './src/trace/fileJobs';export {configureMediaProcessJobs} from './src/trace/mediaProcess'",resolveDir:resolve('.')},outfile:module,bundle:true,platform:'node',format:'cjs'})
 await writeFile(join(dir,'file-worker.js'),"process.once('message',()=>{const fs=require('fs');fs.writeFileSync(process.env.TRACE_TEST_PID,String(process.pid));for(;;){fs.appendFileSync(process.env.TRACE_TEST_WRITES,'x');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15)}})")
 const owner="const api=require(process.argv[1]),native=require(process.argv[2]);api.configureMediaProcessJobs(pid=>native.processJob(pid));api.hashFiles([process.argv[3]]).catch(()=>{})"
 try{
  host=spawn(process.execPath,['-e',owner,module,resolve('build/trace-engine/Release/trace_engine.node'),file],{env:{...process.env,TRACE_TEST_PID:pidFile,TRACE_TEST_WRITES:file},stdio:'ignore'})
  for(let n=0;n<200&&!pid;n++){try{pid=Number(await readFile(pidFile,'utf8'));if(!(await stat(file)).size)pid=undefined}catch{pid=undefined}if(!pid)await new Promise(r=>setTimeout(r,10))}assert(pid>0)
  const exited=once(host,'exit');host.kill('SIGKILL');await exited;await new Promise(r=>setTimeout(r,200));const before=(await stat(file)).size;await new Promise(r=>setTimeout(r,120));assert.equal((await stat(file)).size,before);assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH')
 }finally{host?.kill('SIGKILL');if(pid)try{process.kill(pid,'SIGKILL')}catch{}await new Promise(r=>setTimeout(r,50));await rm(dir,{recursive:true,force:true})}
})
