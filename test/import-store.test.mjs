import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,writeFile,readFile,readdir,symlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
await mkdir('artifacts/m12',{recursive:true});await build({entryPoints:['src/trace/importStore.ts'],outfile:'artifacts/m12/import-store.cjs',platform:'node',format:'cjs',bundle:true})
const {ImportStore,validateImportedDocument}=(await import(pathToFileURL(resolve('artifacts/m12/import-store.cjs')))).default
async function setup(){const root=await mkdtemp(resolve('artifacts/m12/store-')),source=join(root,'external.wav');await writeFile(source,'test-only external contents');const store=new ImportStore(join(root,'owned'));await store.initialize();return {root,source,store}}
test('import persistence keeps source references separate and serial saves retain the final owned metadata',async()=>{
 const {source,store}=await setup(),asset=await store.create(source),saves=[];assert.equal(asset.document.kind,'imported');assert.equal(asset.document.status,'unprepared');assert(!('regions' in asset.document));assert(!('captureEpochId' in asset.document))
 for(let i=0;i<20;i++){asset.document.name='素材 '+i;saves.push(asset.save())}await Promise.all(saves);await asset.event('label.changed',{name:asset.document.name});await asset.save()
 const loaded=await store.initialize();assert.equal(loaded.issues.length,0);assert.equal(loaded.assets[0].document.name,'素材 19');assert.equal(loaded.assets[0].document.sourcePath,source);assert.equal(loaded.assets[0].document.eventSequence,1);assert.equal(await readFile(source,'utf8'),'test-only external contents');assert(!(await readdir(asset.directory)).some(n=>n.endsWith('.tmp')))
})
test('interrupted import/export preparation becomes an explicit retryable failure after restart',async()=>{
 const {source,store}=await setup(),asset=await store.create(source);asset.document.status='preparing';asset.document.exports.push({version:1,id:randomUUID(),createdAt:new Date().toISOString(),source:{takeId:asset.document.sessionId,role:'source'},preset:{format:'mp3',sampleRate:48000,bitrate:192},automatic:false,phase:'encoding',fraction:.5,error:null,delivery:{phase:'copying',directory:resolve('artifacts/m12/destination'),name:'copy',error:null}});await asset.save()
 const restored=(await store.initialize()).assets[0].document;assert.equal(restored.status,'failed');assert.equal(restored.exports[0].phase,'failed');assert.equal(restored.exports[0].delivery.phase,'failed');assert(restored.error.includes('重试'))
})
test('foreign or changed directory identities are preserved and cannot be overwritten',async()=>{
 const {source,store}=await setup(),asset=await store.create(source),before=await readFile(join(asset.directory,'import.json'));await writeFile(join(asset.directory,'owner.json'),JSON.stringify({product:'Other',version:1,id:asset.document.sessionId}));asset.document.name='changed';await assert.rejects(asset.save(),/OWNER/);assert.deepEqual(await readFile(join(asset.directory,'import.json')),before)
 const result=await store.initialize();assert.equal(result.assets.length,0);assert.equal(result.issues.length,1);assert.equal(await readFile(source,'utf8'),'test-only external contents')
})
test('linked metadata directories are rejected without traversing or modifying their target',async()=>{
 const {root,source,store}=await setup(),outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'keep'),'safe');await symlink(outside,join(store.root,randomUUID()),'junction');const result=await store.initialize();assert.equal(result.issues.length,1);assert.equal(await readFile(join(outside,'keep'),'utf8'),'safe');assert.equal(await readFile(source,'utf8'),'test-only external contents')
})
test('ready assets require validated source and cache identities rather than invented capture metadata',async()=>{
 const {source,store}=await setup(),asset=await store.create(source),base=structuredClone(asset.document)
 for(const patch of [{status:'ready'},{deviceId:'fake-capture'},{revision:0},{createdAt:123},{sourcePath:'relative.wav'},{cache:{id:'../../outside'}}])assert.throws(()=>validateImportedDocument({...base,...patch}))
 const ready={...base,status:'ready',source:{path:source,name:'external.wav',bytes:'100',mtimeMs:1,sha256:'a'.repeat(64)},cache:{id:randomUUID(),frames:'10',format:{format:'wav',encoding:'float32',sampleRate:48000,channelCount:2},mediaIdentity:'b'.repeat(64),decoderSha256:'c'.repeat(64)}};assert.equal(validateImportedDocument(ready).cache.frames,'10');assert.throws(()=>validateImportedDocument({...ready,source:{...ready.source,path:resolve('artifacts/other.wav')}}),/FINGERPRINT/)
})

test('new source references cannot adopt files from the managed import tree, including directory aliases',async()=>{
 const {root,store}=await setup(),inside=join(store.root,'cache.wav');await writeFile(inside,'owned PCM');await assert.rejects(store.create(inside),/INSIDE_CACHE/)
 const alias=join(root,'alias');await symlink(store.root,alias,'junction');await assert.rejects(store.create(join(alias,'cache.wav')),/INSIDE_CACHE/);assert.equal(await readFile(inside,'utf8'),'owned PCM')
})
