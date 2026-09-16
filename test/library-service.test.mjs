import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),build=path.join(root,'.tools/feedback-tests')
await fs.mkdir(build,{recursive:true})
require('esbuild').buildSync({entryPoints:[path.join(root,'src/trace/libraryService.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(build,'library.cjs')})
const {LibraryService}=require(path.join(build,'library.cjs'))
async function setup(){
 const base=await fs.mkdtemp(path.join(root,'artifacts/library-')),directory=path.join(base,'takes'),folder=path.join(directory,'take')
 await fs.mkdir(path.join(folder,'audio'),{recursive:true});await fs.writeFile(path.join(folder,'audio/source.wav'),'source')
 const document={product:'Trace',sessionId:'take-id',name:'fixture',status:'ready',assets:[{role:'source',relativePath:'audio/source.wav'}],exports:[]}
 const take={directory:folder,document,settled:async()=>{},save:async()=>{await fs.writeFile(path.join(folder,'session.json'),JSON.stringify(document))}}
 await take.save();const map=new Map([['take-id',take]]);let busy=false
 const repository={directory,settled:async()=>{},busy:()=>busy,sessions:()=>[...map.values()],session:id=>{if(!map.has(id))throw Error('UNKNOWN_TAKE');return map.get(id)},forget:id=>map.delete(id),summaries:()=>[...map.values()].map(t=>({id:t.document.sessionId,status:t.document.status,name:t.document.name,exports:t.document.exports.map(r=>({id:r.id,phase:r.phase}))}))}
 const moved=[];const library=new LibraryService(repository,async target=>{const to=path.join(base,'trash-'+moved.length);await fs.rename(target,to);moved.push({from:target,to})},()=>{})
 return {base,folder,directory,document,take,map,repository,library,moved,setBusy:v=>busy=v}
}
test('refresh detects external deletion and restoration without changing session or splitting source role',async()=>{
 const t=await setup();await t.library.refresh();assert.equal(t.library.summaries()[0].availability,'present')
 await fs.unlink(path.join(t.folder,'audio/source.wav'));await t.library.refresh()
 const v=t.library.summaries()[0];assert.equal(v.status,'ready');assert.equal(v.availability,'missing');assert.deepEqual(v.missingRoles,['source'])
 await fs.writeFile(path.join(t.folder,'audio/source.wav'),'restored');await t.library.refresh();assert.equal(t.library.summaries()[0].availability,'present')
})
test('export presence tracks canonical media, independent of an extra saved copy',async()=>{
 const t=await setup(),id='12345678-1234-1234-1234-123456789abc',dir=path.join(t.folder,'exports',id)
 await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'media-000001.mp3'),'encoded');await fs.writeFile(path.join(t.base,'copy.mp3'),'copy')
 await fs.writeFile(path.join(dir,'export.json'),JSON.stringify({id,source:{takeId:'take-id'}}))
 t.document.exports.push({id,phase:'ready',result:{directory:'exports/'+id,files:[{file:'media-000001.mp3'}]}})
 await fs.unlink(path.join(t.base,'copy.mp3'));await t.library.refresh();assert.equal(t.library.summaries()[0].exports[0].availability,'present')
 await fs.unlink(path.join(dir,'media-000001.mp3'));await t.library.refresh();assert.equal(t.library.summaries()[0].exports[0].availability,'missing')
 await t.library.remove('take-id',id);assert.equal(t.document.exports.length,0);assert.equal(t.moved.length,1);assert.equal(await fs.readFile(path.join(t.folder,'audio/source.wav'),'utf8'),'source')
})
test('whole take moves to recoverable trash adapter and leaves list only after success',async()=>{
 const t=await setup();await t.library.remove('take-id');assert.equal(t.map.size,0);assert.equal(t.moved.length,1);assert.equal(await fs.readFile(path.join(t.moved[0].to,'audio/source.wav'),'utf8'),'source')
})
test('externally missing take is forgotten without recreating its directory',async()=>{
 const t=await setup();await fs.rename(t.folder,path.join(t.base,'externally-moved'));await t.library.remove('take-id');assert.equal(t.map.size,0);assert.equal(t.moved.length,0);await assert.rejects(fs.stat(t.folder),{code:'ENOENT'})
})
test('recording blocks management; junctions cannot redirect a deletion',async()=>{
 const t=await setup();t.setBusy(true);await assert.rejects(t.library.remove('take-id'),/LIBRARY_BUSY/);t.setBusy(false)
 const outside=path.join(t.base,'outside');await fs.mkdir(outside);await fs.rename(t.folder,path.join(t.base,'held'))
 await fs.symlink(outside,t.folder,'junction');await assert.rejects(t.library.remove('take-id'),/INVALID_LIBRARY_PATH/);assert.equal(t.moved.length,0)
})

test('replaced session identity and missing export ownership preserve files and records',async()=>{
 const t=await setup();await fs.writeFile(path.join(t.folder,'session.json'),JSON.stringify({product:'Trace',sessionId:'different-take'}))
 await assert.rejects(t.library.remove('take-id'),/LIBRARY_IDENTITY_CHANGED/);assert.equal(t.moved.length,0);assert.equal(t.map.size,1)
 await t.take.save();const id='12345678-1234-1234-1234-123456789abc',dir=path.join(t.folder,'exports',id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'media-000001.mp3'),'encoded')
 t.document.exports.push({id,phase:'ready',result:{directory:'exports/'+id,files:[{file:'media-000001.mp3'}]}})
 await assert.rejects(t.library.remove('take-id',id),/LIBRARY_IDENTITY_CHANGED/);assert.equal(t.document.exports.length,1);assert.equal(t.moved.length,0)
})

test('a queued finalization that starts encoding before removal preserves the take',async()=>{
 const t=await setup();let encoding=false
 t.repository.settled=async()=>{await new Promise(r=>setTimeout(r,1));encoding=true}
 const guarded=new LibraryService(t.repository,async()=>{throw Error('trash must not run')},()=>{},()=>encoding)
 await assert.rejects(guarded.remove('take-id'),/LIBRARY_BUSY/);assert.equal(t.map.size,1);assert.equal(await fs.readFile(path.join(t.folder,'audio/source.wav'),'utf8'),'source')
})

test('rename changes only metadata and validates Windows-safe names',async()=>{
 const t=await setup(),source=await fs.readFile(path.join(t.folder,'audio/source.wav'))
 const result=await t.library.rename('take-id','声音片段 A')
 assert.equal(result.oldName,'fixture');assert.equal(t.document.name,'声音片段 A');assert.deepEqual(await fs.readFile(path.join(t.folder,'audio/source.wav')),source)
 assert.equal(JSON.parse(await fs.readFile(path.join(t.folder,'session.json'),'utf8')).name,'声音片段 A')
 for(const name of ['../outside','CON','bad:name','trailing.',''])await assert.rejects(t.library.rename('take-id',name),/INVALID_TAKE_NAME/)
 const save=t.take.save;t.take.save=async()=>{throw Error('DISK_WRITE')};await assert.rejects(t.library.rename('take-id','next'),/DISK_WRITE/);assert.equal(t.document.name,'声音片段 A');t.take.save=save
})
async function cacheFixture(){
 const t=await setup(),id='12345678-1234-1234-1234-123456789abc',folder=path.join(t.folder,'exports',id),cache=path.join(t.folder,'cache','key')
 await fs.mkdir(folder,{recursive:true});await fs.mkdir(cache,{recursive:true})
 await fs.writeFile(path.join(cache,'meter.bin'),'analysis')
 await fs.writeFile(path.join(folder,'media-000001.mp3'),'encoded');await fs.writeFile(path.join(folder,'decoded-000001.wav'),'decoded')
 const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex')
 t.document.exports.push({id,phase:'ready',result:{directory:'exports/'+id,files:[{file:'media-000001.mp3',sha256:hash('encoded')}],decoded:[{file:'decoded-000001.wav',sha256:hash('decoded')}]}})
 await t.take.save();await fs.writeFile(path.join(folder,'export.json'),JSON.stringify({id,source:{takeId:'take-id'}}))
 return {...t,exportFolder:folder,cache}
}
test('cache cleanup preserves both original and verified deliverable media',async()=>{
 const t=await cacheFixture(),usage=await t.library.usage()
 assert.equal(usage.audioBytes,'13');assert.equal(usage.cacheBytes,'15')
 const cleaned=await t.library.clearCache('take-id');assert.equal(cleaned.freedBytes,'15');assert.equal(cleaned.protectedExports,0)
 assert.equal(await fs.readFile(path.join(t.folder,'audio/source.wav'),'utf8'),'source')
 assert.equal(await fs.readFile(path.join(t.exportFolder,'media-000001.mp3'),'utf8'),'encoded')
 await assert.rejects(fs.stat(path.join(t.exportFolder,'decoded-000001.wav')),{code:'ENOENT'})
 assert.equal((await t.library.usage()).cacheBytes,'0')
})
test('cache cleanup preserves decoded audio when the canonical media is missing or changed',async()=>{
 for(const mode of ['missing','changed']){
  const t=await cacheFixture(),media=path.join(t.exportFolder,'media-000001.mp3')
  if(mode==='missing')await fs.unlink(media);else await fs.writeFile(media,'different')
  const cleaned=await t.library.clearCache('take-id');assert.equal(cleaned.protectedExports,1);assert.equal(cleaned.freedBytes,'8')
  assert.equal(await fs.readFile(path.join(t.exportFolder,'decoded-000001.wav'),'utf8'),'decoded')
 }
})
test('cache cleanup rejects junctions without touching the linked location',async()=>{
 const t=await setup(),outside=path.join(t.base,'outside-cache');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.bin'),'keep')
 await fs.symlink(outside,path.join(t.folder,'cache'),'junction')
 await assert.rejects(t.library.clearCache('take-id'),/INVALID_CACHE_DIRECTORY/)
 assert.equal(await fs.readFile(path.join(outside,'keep.bin'),'utf8'),'keep')
})
test('missing inventory keeps partial exports and distinguishes an absent whole take',async()=>{
 const t=await cacheFixture();assert.equal((await t.library.missingEntries()).length,0)
 t.document.exports[0].result.files.push({file:'media-000002.mp3'});await fs.writeFile(path.join(t.exportFolder,'media-000002.mp3'),'part two')
 await fs.unlink(path.join(t.exportFolder,'media-000001.mp3'));assert.equal((await t.library.missingEntries()).length,0)
 await fs.unlink(path.join(t.exportFolder,'media-000002.mp3'));const missing=await t.library.missingEntries()
 assert.equal(missing.length,1);assert.equal(missing[0].exportId,'12345678-1234-1234-1234-123456789abc')
 await fs.rename(t.folder,path.join(t.base,'moved'));const absent=await t.library.missingEntries();assert.equal(absent.length,1);assert.equal(absent[0].exportId,undefined)
})
