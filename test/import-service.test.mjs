import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
await fs.mkdir('artifacts/m12',{recursive:true});await build({entryPoints:['src/trace/importService.ts'],outfile:'artifacts/m12/import-service.cjs',platform:'node',format:'cjs',bundle:true})
const {ImportService}=(await import(pathToFileURL(path.resolve('artifacts/m12/import-service.cjs')))).default
const tick=()=>new Promise(r=>setImmediate(r)),sha=b=>createHash('sha256').update(b).digest('hex')
async function wait(fn){for(const start=Date.now();Date.now()-start<5000;){const v=fn();if(v)return v;await tick()}throw Error('test timeout')}
async function setup(){
 const root=await fs.mkdtemp(path.resolve('artifacts/m12/service-')),files=[]
 for(let i=0;i<5;i++){const file=path.join(root,'source-'+i+'.wav');await fs.writeFile(file,'TEST_ONLY '+i);files.push(file)}
 const results=new Map(),releases=[];let decode=async()=>{},read=async()=>{},active=0,peak=0,attempts=0,allowed=true
 const fingerprint=async file=>{const s=await fs.stat(file);return {path:await fs.realpath(file),name:path.basename(file),bytes:String(s.size),mtimeMs:s.mtimeMs,sha256:sha(await fs.readFile(file))}}
 const ops={fingerprint,decode:async(_tools,file,cache,{signal,progress})=>{active++;peak=Math.max(peak,active);attempts++;try{await decode(signal,progress);if(signal.aborted)throw Error('IMPORT_CANCELLED');const source=await fingerprint(file),id=randomUUID(),directory=path.join(cache,id);await fs.mkdir(path.join(directory,'pcm'),{recursive:true});await fs.writeFile(path.join(directory,'pcm/part-000000.wav'),'TEST_ONLY_PCM');const result={version:1,id,source,format:{format:'wav',sampleRate:48000,channelCount:2,encoding:'float32'},codec:'pcm_f32le',frames:'48000',decoderSha256:'a'.repeat(64),mediaIdentity:source.sha256,trim:'decoder-metadata',directory,files:[{file:'pcm/part-000000.wav',frames:'48000',sha256:'b'.repeat(64)}]};results.set(directory,result);return result}finally{active--}},
 read:async(root,id,_sha,signal)=>{await read(signal);if(signal.aborted)throw Error('IMPORT_CANCELLED');const r=results.get(path.join(root,id));if(!r)throw Error('IMPORT_DECODED_CACHE_CHANGED');return r},
 remove:async(root,directory)=>{assert.equal(path.dirname(directory),root);results.delete(directory);await fs.unlink(path.join(directory,'pcm/part-000000.wav'));await fs.rmdir(path.join(directory,'pcm'));await fs.rmdir(directory)}}
 const svc=new ImportService(path.join(root,'imports'),{ffmpegSha256:'a'.repeat(64)},()=>{},async id=>releases.push(id),()=>allowed,ops);await svc.initialize()
 return {root,files,svc,releases,results,ops,setDecode:f=>decode=f,setRead:f=>read=f,setAllowed:v=>allowed=v,get peak(){return peak},get attempts(){return attempts}}
}
test('import preparation is bounded, serial, and paused recording does not write decoded PCM',async()=>{
 const t=await setup();t.svc.setRecordingBusy(true);const ids=await Promise.all(t.files.slice(0,4).map(f=>t.svc.add(f)));await assert.rejects(t.svc.add(t.files[4]),/QUEUE_FULL/);assert.equal(t.attempts,0);assert(t.svc.views().every(v=>v.phase==='queued'));t.svc.setRecordingBusy(false);await wait(()=>t.svc.views().every(v=>v.status==='ready'));assert.equal(t.peak,1);assert.equal(t.attempts,4);assert.deepEqual(new Set(t.releases),new Set(ids));await t.svc.shutdown()
})
test('recording interrupts preparation, preserves the request and resumes it with a fresh attempt',async()=>{
 const t=await setup();let begun;const started=new Promise(r=>begun=r);t.setDecode(signal=>new Promise(resolve=>{begun();signal.addEventListener('abort',resolve,{once:true})}))
 const id=await t.svc.add(t.files[0]);await started;t.svc.setRecordingBusy(true);await wait(()=>t.svc.views()[0].phase==='queued');assert.equal(t.results.size,0);t.setDecode(async()=>{});t.svc.setRecordingBusy(false);await wait(()=>t.svc.views()[0].status==='ready');assert.equal(t.attempts,2);assert.equal(t.svc.views()[0].id,id);await t.svc.shutdown()
})

test('choosing a cancelled file again queues the same asset rather than leaving an inert duplicate',async()=>{
 const t=await setup();t.svc.setRecordingBusy(true);const id=await t.svc.add(t.files[0]);t.svc.cancel(id);assert.equal(t.svc.views()[0].phase,'cancelled');assert.equal(await t.svc.add(t.files[0]),id);assert.equal(t.svc.views().length,1);assert.equal(t.svc.views()[0].phase,'queued');t.svc.setRecordingBusy(false);await wait(()=>t.svc.views()[0].status==='ready');assert.equal(t.attempts,1);await t.svc.shutdown()
})
test('source modification is explicit; metadata-only changes do not invalidate identical content',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');const original=t.svc.session(id).document.source.sha256
 await fs.utimes(t.files[0],new Date(),new Date(Date.now()+5000));await t.svc.refresh();assert.equal(t.svc.views()[0].status,'ready')
 await fs.writeFile(t.files[0],'CHANGED CONTENT');await t.svc.refresh();assert.equal(t.svc.views()[0].status,'changed');assert.equal(t.svc.session(id).document.source.sha256,original);t.svc.prepare(id);await wait(()=>t.svc.views()[0].phase==='failed');assert.equal(t.svc.views()[0].status,'changed')
 t.svc.prepare(id,true);await wait(()=>t.svc.views()[0].status==='ready');assert.equal(t.svc.session(id).document.revision,2);assert.notEqual(t.svc.session(id).document.source.sha256,original);assert.equal(t.results.size,1);await t.svc.shutdown()
})
test('cache removal waits for in-flight reads, invalidates ready state and preserves the external file',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');let begun,finish;const started=new Promise(r=>begun=r)
 t.setRead(()=>new Promise(r=>{begun();finish=r}));const read=t.svc.analysisSource(id);const rejected=assert.rejects(read,/CANCELLED/);await started;let done=false;const clearing=t.svc.clearCache(id).then(()=>done=true);await tick();assert(!done);assert.equal(t.results.size,1);finish();await Promise.all([clearing,rejected]);assert.equal(t.results.size,0);assert.equal(t.svc.views()[0].status,'unprepared');assert.equal(await fs.readFile(t.files[0],'utf8'),'TEST_ONLY 0');await t.svc.shutdown()
})
test('removing a reference archives owned metadata and preserves original and generated exports across restart',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');const owner=t.svc.session(id);await fs.mkdir(path.join(owner.directory,'exports'));await fs.writeFile(path.join(owner.directory,'exports/retain.wav'),'generated-user-audio');await t.svc.remove(id);assert.equal(t.svc.views().length,0);assert(!t.svc.has(id));await t.svc.initialize();assert.equal(t.svc.views().length,0);assert.equal(await fs.readFile(t.files[0],'utf8'),'TEST_ONLY 0');assert.equal(await fs.readFile(path.join(owner.directory,'exports/retain.wav'),'utf8'),'generated-user-audio');await t.svc.shutdown()
})
test('relocation requires the original content and cannot bind a managed cache as an external source',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');await assert.rejects(t.svc.relocate(id,t.files[1]),/CONTENT_CHANGED/)
 const copy=path.join(t.root,'relocated.wav');await fs.copyFile(t.files[0],copy);await fs.unlink(t.files[0]);await t.svc.refresh();assert.equal(t.svc.views()[0].status,'missing');await t.svc.relocate(id,copy);assert.equal(t.svc.views()[0].status,'ready');assert.equal(t.svc.session(id).document.sourcePath,copy)
 const inside=path.join(t.svc.store.root,'illegal.wav');await fs.copyFile(copy,inside);await assert.rejects(t.svc.relocate(id,inside),/INSIDE_CACHE/);await t.svc.shutdown()
})

test('generated-export removal verifies its owner, recycles only that directory and preserves the external source',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');const a=t.svc.session(id),exportId=randomUUID(),record={version:1,id:exportId,createdAt:new Date().toISOString(),source:{takeId:id,role:'source'},preset:{format:'mp3',sampleRate:48000,bitrate:192},automatic:false,phase:'failed',fraction:0,error:'TEST_ONLY'};a.document.exports.push(record);await a.save()
 const dir=path.join(a.directory,'exports',exportId),retained=path.join(t.root,'test-recycle-'+exportId);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'export.json'),JSON.stringify(record));await fs.writeFile(path.join(dir,'media-0.mp3'),'generated')
 await t.svc.removeExport(id,exportId,async target=>{assert.equal(target,dir);assert(path.resolve(retained).startsWith(t.root+path.sep));await fs.rename(target,retained)});assert.equal(a.document.exports.length,0);assert.equal(await fs.readFile(path.join(retained,'media-0.mp3'),'utf8'),'generated');assert.equal(await fs.readFile(t.files[0],'utf8'),'TEST_ONLY 0');await t.svc.shutdown()
})

test('a generated-export junction cannot redirect removal into an unrelated directory',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');const a=t.svc.session(id),exportId=randomUUID(),record={version:1,id:exportId,createdAt:new Date().toISOString(),source:{takeId:id,role:'source'},preset:{format:'mp3',sampleRate:48000,bitrate:192},automatic:false,phase:'failed',fraction:0,error:'TEST_ONLY'};a.document.exports.push(record);await a.save()
 const outside=path.join(t.root,'unrelated');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.wav'),'retain');await fs.mkdir(path.join(a.directory,'exports'));await fs.symlink(outside,path.join(a.directory,'exports',exportId),'junction');let recycled=false
 await assert.rejects(t.svc.removeExport(id,exportId,async()=>{recycled=true}),/INVALID_EXPORT_DIRECTORY/);assert(!recycled);assert.equal(await fs.readFile(path.join(outside,'keep.wav'),'utf8'),'retain');assert.equal(a.document.exports.length,1);await t.svc.shutdown()
})

test('re-preparation cancels and drains an old source resolver before replacing decoded files',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');let begun,finish;const started=new Promise(r=>begun=r);t.setRead(()=>new Promise(r=>{begun();finish=r}))
 const reading=t.svc.analysisSource(id),cancelled=assert.rejects(reading,/CANCELLED/);await started;t.svc.prepare(id);await tick();assert.equal(t.attempts,1);finish();await cancelled;await wait(()=>t.svc.views()[0].status==='ready');assert.equal(t.attempts,2);assert.equal(t.results.size,1);await t.svc.shutdown()
})

test('a delayed refresh cannot restore ready status after cache cleanup or reference removal',async()=>{
 const t=await setup(),id=await t.svc.add(t.files[0]);await wait(()=>t.svc.views()[0].status==='ready');const fingerprint=t.ops.fingerprint;let begun,finish;const started=new Promise(r=>begun=r)
 t.ops.fingerprint=async file=>{begun();await new Promise(r=>finish=r);return fingerprint(file)};await fs.utimes(t.files[0],new Date(),new Date(Date.now()+5000));const refreshing=t.svc.refresh();await started;await t.svc.clearCache(id);finish();await refreshing;assert.equal(t.svc.views()[0].status,'unprepared');assert.equal(t.svc.session(id).document.cache,undefined);assert.equal(await fs.readFile(t.files[0],'utf8'),'TEST_ONLY 0');await t.svc.shutdown()
})
