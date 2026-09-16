import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import * as io from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
await io.mkdir('artifacts/preferences',{recursive:true});await build({entryPoints:['src/trace/preferencesWriter.ts'],outfile:'artifacts/preferences/writer.cjs',platform:'node',format:'cjs',bundle:true})
const {PreferencesWriter}=(await import(pathToFileURL(resolve('artifacts/preferences/writer.cjs')))).default
test('transient Windows rename failures retry while preserving the last complete settings',async()=>{
 const dir=await io.mkdtemp(resolve('artifacts/preferences/retry-')),target=join(dir,'settings.json');await io.writeFile(target,'{"old":true}');let attempts=0;const events=[]
 const writer=new PreferencesWriter(target,e=>events.push(e),{...io,rename:async(a,b)=>{if(++attempts<3){assert.equal(await io.readFile(target,'utf8'),'{"old":true}');throw Object.assign(Error('temporary lock'),{code:'EPERM'})}return io.rename(a,b)}},async()=>{})
 writer.save('{"new":true}');await writer.flush();assert.equal(attempts,3);assert.equal(await io.readFile(target,'utf8'),'{"new":true}');assert.deepEqual(events,[null]);assert.deepEqual(await io.readdir(dir),['settings.json'])
})
test('queued edits coalesce to the latest snapshot and shutdown flush waits for it',async()=>{
 const dir=await io.mkdtemp(resolve('artifacts/preferences/latest-')),target=join(dir,'settings.json');let finish,entered;const entry=new Promise(r=>entered=r);let calls=0
 const writer=new PreferencesWriter(target,()=>{},{...io,rename:async(a,b)=>{if(++calls===1){entered();await new Promise(r=>finish=r)}return io.rename(a,b)}})
 writer.save('1');await entry;writer.save('2');writer.save('3');let done=false;const flush=writer.flush().then(()=>done=true);await Promise.resolve();assert(!done);finish();await flush;assert.equal(calls,2);assert.equal(await io.readFile(target,'utf8'),'3')
})
test('permanent failure is visible, bounded and never deletes the existing target',async()=>{
 const dir=await io.mkdtemp(resolve('artifacts/preferences/failure-')),target=join(dir,'settings.json');await io.writeFile(target,'old');let calls=0;const events=[]
 const writer=new PreferencesWriter(target,e=>events.push(e),{...io,rename:async()=>{calls++;throw Object.assign(Error('locked'),{code:'EACCES'})}},async()=>{})
 writer.save('new');await assert.rejects(writer.flush(),/locked/);assert.equal(calls,6);assert.equal(await io.readFile(target,'utf8'),'old');assert.equal(events.length,1);assert.deepEqual(await io.readdir(dir),['settings.json'])
})
