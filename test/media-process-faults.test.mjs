import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,rm,stat,readFile} from 'node:fs/promises'
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

test('supervisor hard kill stops descendants before failure/retry',options,async()=>{
 if(process.platform==='win32')return // Native Job Object acceptance is in the Windows tier.
 const root=await mkdtemp(join(tmpdir(),'trace-tree-')),file=join(root,'writes');let supervisor
 const grandchild="require('fs').appendFileSync(process.argv[1],'x');setInterval(()=>require('fs').appendFileSync(process.argv[1],'x'),15)"
 const encoder="require('child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});setTimeout(()=>process.stdout.write(String(process.ppid)+'\\n'),100);setInterval(()=>{},1000)"
 try{
  await assert.rejects(mediaProcess(process.execPath,['-e',encoder,grandchild,file],{line:line=>{supervisor=Number(line);process.kill(supervisor,'SIGKILL')}}),/MEDIA_PROCESS_FAILED/)
  assert(supervisor>0);const before=(await stat(file)).size
  await new Promise(r=>setTimeout(r,120));assert.equal((await stat(file)).size,before,'orphan writer must have stopped')
  assert.equal(await mediaProcess(process.execPath,['-e',"process.stdout.write('retry after kill')"],{capture:true}),'retry after kill')
 }finally{await rm(root,{recursive:true,force:true})}
})

test('hard exit of the owning main process stops the detached supervisor tree',options,async()=>{
 if(process.platform==='win32')return // Real Job Object counterpart is native-tier.
 const root=await mkdtemp(join(tmpdir(),'trace-main-exit-')),file=join(root,'writes');let host,pids=[]
 const grandchild="require('fs').appendFileSync(process.argv[1],'x');setInterval(()=>require('fs').appendFileSync(process.argv[1],'x'),15)"
 const encoder="const child=require('child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});setTimeout(()=>process.stdout.write(JSON.stringify([process.pid,child.pid])+'\\n'),200);setInterval(()=>{},1000)"
 const owner="const {mediaProcess}=require(process.argv[1]);mediaProcess(process.execPath,['-e',process.argv[2],process.argv[3],process.argv[4]],{line:line=>process.stdout.write(line+'\\n')}).catch(()=>{})"
 try{
  host=spawn(process.execPath,['-e',owner,join(compiled,'mediaProcess.js'),encoder,grandchild,file],{stdio:['ignore','pipe','pipe']});host.stderr.resume();const ready=new Promise((resolve,reject)=>{host.on('error',reject);host.stdout.once('data',data=>{pids=JSON.parse(String(data));resolve()})});await ready;const exit=once(host,'exit');host.kill('SIGKILL');await exit
  await new Promise(r=>setTimeout(r,2500));const before=(await stat(file)).size;await new Promise(r=>setTimeout(r,120));assert.equal((await stat(file)).size,before)
  for(const pid of pids){try{const text=await readFile('/proc/'+pid+'/stat','utf8');assert.equal(text.match(/\)\s([A-Z])/)[1],'Z','descendant must have exited')}catch(error){if(error.code!=='ENOENT')throw error}}
 }finally{host?.kill('SIGKILL');for(const pid of pids)try{process.kill(pid,'SIGKILL')}catch{}await rm(root,{recursive:true,force:true})}
})

test('legacy WAV postprocessing stops its real encoder when the owning process exits',{timeout:15000},async()=>{
 const file=join(compiled,'wavPostprocess.cjs');await build({entryPoints:['src/trace/wavPostprocess.ts'],outfile:file,bundle:true,platform:'node',format:'cjs',footer:{js:'module.exports.reviewExecute=execute;'}})
 const root=await mkdtemp(join(tmpdir(),'trace-wav-owner-')),writes=join(root,'writes'),pidFile=join(root,'pid');let host,pid
 const encoder="const fs=require('fs');fs.writeFileSync(process.argv[1],String(process.pid));fs.appendFileSync(process.argv[2],'x');setInterval(()=>fs.appendFileSync(process.argv[2],'x'),15)"
 const owner="require(process.argv[1]).reviewExecute(process.execPath,['-e',process.argv[2],process.argv[3],process.argv[4]]).catch(()=>{})"
 try{
  host=spawn(process.execPath,['-e',owner,file,encoder,pidFile,writes],{stdio:'ignore'})
  for(let n=0;n<200&&!pid;n++){try{pid=Number(await readFile(pidFile,'utf8'));if(!(await stat(writes)).size)pid=undefined}catch{pid=undefined}if(!pid)await new Promise(r=>setTimeout(r,10))}assert(pid>0)
  const exited=once(host,'exit');host.kill('SIGKILL');await exited;await new Promise(r=>setTimeout(r,2500));const before=(await stat(writes)).size;await new Promise(r=>setTimeout(r,120));assert.equal((await stat(writes)).size,before,'postprocess encoder must stop after owner termination')
 }finally{host?.kill('SIGKILL');if(pid)try{process.kill(pid,'SIGKILL')}catch{}await new Promise(r=>setTimeout(r,50));await rm(root,{recursive:true,force:true})}
})
