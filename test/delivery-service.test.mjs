import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {assertSamePath} from './path-equal.mjs'
await fs.mkdir('artifacts/iteration',{recursive:true})
await build({entryPoints:['src/trace/deliveryService.ts'],outfile:'artifacts/iteration/delivery.cjs',bundle:true,platform:'node',format:'cjs'})
const {DeliveryService}=(await import(pathToFileURL(path.resolve('artifacts/iteration/delivery.cjs')))).default
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(fn){for(let i=0;i<500;i++){if(fn())return;await delay(5)}throw Error('Delivery timeout')}
async function setup(){
 const root=await fs.mkdtemp(path.resolve('artifacts/iteration/delivery-')),directory=path.join(root,'destination');await fs.mkdir(directory)
 const record={id:'export-id',phase:'ready',source:{takeId:'take'},result:{},preset:{format:'mp3'}}
 const document={name:'Saved Sound',sessionId:'take',exports:[record]},take={document,save:async()=>fs.writeFile(path.join(root,'session.json'),JSON.stringify(document))}
 const calls=[];let copy=async(_id,target)=>fs.writeFile(target,'verified audio',{flag:'wx'}),allowed=true
 const exporter={saveInfo:()=>({name:'Saved Sound.mp3',extension:'mp3',multiple:false}),saveCopy:(id,target,options)=>{calls.push({id,target,options});return copy(id,target,options)}}
 const service=new DeliveryService({sessions:()=>[take]},exporter,()=>{},()=>allowed)
 return {root,directory,record,take,calls,service,setCopy:f=>copy=f,setAllowed:v=>allowed=v}
}
test('automatic delivery allocates a new name and never overwrites existing user output',async()=>{
 const t=await setup();await fs.writeFile(path.join(t.directory,'Saved Sound.mp3'),'existing')
 await t.service.plan('export-id',t.directory);await wait(()=>t.record.delivery.phase==='ready');await t.service.pause()
 assert.equal(await fs.readFile(path.join(t.directory,'Saved Sound.mp3'),'utf8'),'existing')
 assert.equal(await fs.readFile(path.join(t.directory,'Saved Sound (2).mp3'),'utf8'),'verified audio')
 assertSamePath(await t.service.folder('export-id'),t.directory);await t.service.shutdown()
})
test('recording can pause delivery and resume the same owned target',async()=>{
 const t=await setup();let entered
 const started=new Promise(r=>entered=r)
 t.setCopy((_id,_target,{signal})=>new Promise((_r,reject)=>{entered();signal.addEventListener('abort',()=>reject(Error('ABORTED')),{once:true})}))
 await t.service.plan('export-id',t.directory);await started;await t.service.pause()
 assert.equal(t.record.delivery.phase,'pending');const target=t.record.delivery.targetPath
 t.setAllowed(false);t.service.resume();await delay(20);assert.equal(t.calls.length,1)
 t.setCopy(async(_id,target)=>fs.writeFile(target,'verified audio',{flag:'wx'}));t.setAllowed(true);t.service.observe()
 await wait(()=>t.record.delivery.phase==='ready');await t.service.pause()
 assert.equal(t.calls[1].target,target);assert.equal(await fs.readFile(target,'utf8'),'verified audio');await t.service.shutdown()
})
test('a stored delivery record alone never authorizes a new write after restart',async()=>{
 const t=await setup();t.record.delivery={phase:'pending',directory:t.directory,name:'Stored',error:null}
 t.service.observe();await delay(30);assert.equal(t.calls.length,0);await t.service.shutdown()
})
test('a changed destination junction fails safely and leaves the canonical export intact',async()=>{
 const t=await setup();t.setAllowed(false);await t.service.plan('export-id',t.directory)
 const moved=path.join(t.root,'held'),outside=path.join(t.root,'outside');await fs.mkdir(outside);await fs.rename(t.directory,moved);await fs.symlink(outside,t.directory,'junction')
 t.setAllowed(true);t.service.observe();await wait(()=>t.record.delivery.phase==='failed')
 assert.equal(t.calls.length,0);assert.deepEqual(await fs.readdir(outside),[]);assert.equal(t.record.phase,'ready');await t.service.shutdown()
})
test('metadata write failure is contained rather than becoming an unhandled background rejection',async()=>{
 const t=await setup();t.setAllowed(false);await t.service.plan('export-id',t.directory);t.take.save=async()=>{throw Error('DISK_FAILURE')}
 t.setAllowed(true);t.service.observe();await wait(()=>!t.service.busy())
 assert.equal(t.record.delivery.phase,'failed');assert.equal(t.calls.length,0);await t.service.shutdown()
})
