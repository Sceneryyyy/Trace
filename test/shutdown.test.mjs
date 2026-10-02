import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createRequire} from 'node:module'
await mkdir('artifacts/shutdown',{recursive:true})
const require=createRequire(import.meta.url),modules={}
for(const name of ['shutdown','supportJournal']){
 const file=resolve('artifacts/shutdown/'+name+'.cjs')
 await build({entryPoints:['src/trace/'+name+'.ts'],outfile:file,bundle:true,platform:'node',format:'cjs'})
 modules[name]=require(file)
}
const {finalizeShutdown,shutdownDeadline}=modules.shutdown
const never=()=>new Promise(()=>{})
test('normal completion and failure drain promptly without timeout records',async()=>{
 let records=0;const errors=[]
 const options={deadlineMs:1000,recordTimeout:async()=>{records++},reportError:e=>errors.push(e)}
 assert.equal(await finalizeShutdown(Promise.resolve(),options),'finished')
 const failure=Error('worker failed')
 assert.equal(await finalizeShutdown(Promise.reject(failure),options),'finished')
 assert.equal(records,0);assert.deepEqual(errors,[failure])
})
test('wedged shutdown persists its fault before exit and survives late finish/restart',async()=>{
 const directory=await mkdtemp(resolve('artifacts/shutdown/journal-'))
 const journal=await modules.supportJournal.SupportJournal.open(directory)
 let complete;const finish=new Promise(r=>complete=r)
 const errors=[]
 assert.equal(await finalizeShutdown(finish,{deadlineMs:15,recordTimeout:async()=>{journal.record('shutdown-timeout');await journal.flush()},reportError:e=>errors.push(e),diagnosticMs:1000}),'timed-out')
 const disk=JSON.parse(await readFile(join(directory,'events.json'),'utf8'))
 assert.equal(disk.clean,false);assert.equal(disk.events.at(-1).kind,'shutdown-timeout')
 complete();await journal.finish()
 const restarted=await modules.supportJournal.SupportJournal.open(directory)
 assert.equal(restarted.status.previousInterrupted,true)
 assert.equal(restarted.status.lastFault.kind,'shutdown-timeout')
 await restarted.finish();assert.deepEqual(errors,[])
})
test('hung or rejected diagnostic writes do not hang the watchdog; late drain rejection is handled',async()=>{
 let fail;const pending=new Promise((_,r)=>fail=r),errors=[]
 const begin=Date.now()
 assert.equal(await finalizeShutdown(pending,{deadlineMs:10,diagnosticMs:10,recordTimeout:never,reportError:e=>errors.push(e)}),'timed-out')
 assert(Date.now()-begin<2000)
 const failure=Error('late failure');fail(failure);await new Promise(r=>setImmediate(r));assert.deepEqual(errors,[failure])
 assert.equal(await finalizeShutdown(never(),{deadlineMs:10,recordTimeout:async()=>{throw failure},reportError:e=>errors.push(e)}),'timed-out')
 assert.equal(errors.length,2)
})
test('invalid environment deadlines cannot disable shutdown protection',()=>{
 for(const value of [undefined,'','0','-1','NaN','Infinity','1.5','300001'])assert.equal(shutdownDeadline(value),60000)
 assert.equal(shutdownDeadline('100'),100);assert.equal(shutdownDeadline('300000'),300000)
})
test('actual before-quit handler drains before native shutdown and logs a wedged drain before one exit',async()=>{
 const directory=await mkdtemp(resolve('artifacts/shutdown/main-')),electron=join(directory,'electron.cjs'),file=join(directory,'main.cjs')
 await writeFile(electron,`exports.app={handlers:{},getPath:()=>${JSON.stringify(directory)},setPath(){},setName(){},requestSingleInstanceLock:()=>true,on(name,fn){this.handlers[name]=fn},whenReady:()=>new Promise(()=>{}),exit(){},quit(){this.quits=(this.quits||0)+1}};exports.ipcMain={};`)
 const injection='\nexport const shutdownBoundary=app;export function setupShutdown(v:any){engine=v.engine;imports=v.imports;recordings=v.recordings;supportRuntime=v.supportRuntime;exiting=false;readyToQuit=false;}'
 await build({entryPoints:['src/trace/main.ts'],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'electron-only-boundary',setup(b){
  b.onResolve({filter:/^electron$/},()=>({path:electron}))
  b.onLoad({filter:/[\\/]src[\\/]trace[\\/]main\.ts$/},async()=>({contents:await readFile('src/trace/main.ts','utf8')+injection,loader:'ts'}))
 }}]})
 const original=process.env.TRACE_SHUTDOWN_TIMEOUT_MS
 try{
  process.env.TRACE_SHUTDOWN_TIMEOUT_MS='100'
  const main=require(file),boundary=main.shutdownBoundary,order=[]
  let drain;const pending=new Promise(r=>drain=r)
  main.setupShutdown({imports:{shutdown:()=>pending},engine:{shutdown:()=>{order.push('engine');return {id:'record'}}},recordings:{prepareShutdown:()=>order.push('prepare'),finish:async()=>order.push('record-finish')},supportRuntime:{stopDialogs(){},finish:async()=>order.push('journal-finish'),recordShutdownTimeout:async()=>assert.fail('unexpected timeout')}})
  boundary.handlers['before-quit']({preventDefault(){}})
  await new Promise(r=>setImmediate(r));assert.deepEqual(order,['prepare']);assert.equal(boundary.quits,undefined)
  drain();await new Promise(r=>setTimeout(r,20));assert.deepEqual(order,['prepare','engine','record-finish','journal-finish']);assert.equal(boundary.quits,1)
  const journal=await modules.supportJournal.SupportJournal.open(join(directory,'journal'))
  main.setupShutdown({imports:{shutdown:never},engine:{shutdown:()=>assert.fail('native engine torn down during blocked drain')},recordings:{prepareShutdown(){}},supportRuntime:{stopDialogs(){},recordShutdownTimeout:async()=>{journal.record('shutdown-timeout');await journal.flush()}}})
  boundary.handlers['before-quit']({preventDefault(){}});boundary.handlers['before-quit']({preventDefault(){}})
  for(let i=0;i<100&&boundary.quits<2;i++)await new Promise(r=>setTimeout(r,10))
  assert.equal(boundary.quits,2)
  const persisted=JSON.parse(await readFile(join(directory,'journal/events.json'),'utf8'))
  assert.equal(persisted.clean,false);assert.equal(persisted.events.at(-1).kind,'shutdown-timeout')
 }finally{if(original===undefined)delete process.env.TRACE_SHUTDOWN_TIMEOUT_MS;else process.env.TRACE_SHUTDOWN_TIMEOUT_MS=original}
})
