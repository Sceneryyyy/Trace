// Filesystem boundary regressions use generated metadata, never personal audio.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
await fs.mkdir('artifacts/review-20261015',{recursive:true})
const root=await fs.mkdtemp(path.resolve('artifacts/review-20261015/storage-'))
const outfile=path.join(root,'checks.cjs')
await build({stdin:{contents:['supportJournal','sessionStore','analysisCache','markerStore','reportBuilder','spectralDiskBudget','spectrogramOverview'].map(n=>`export * from './src/trace/${n}'`).join('\n'),resolveDir:path.resolve('.')},outfile,bundle:true,platform:'node',format:'cjs'})
const m=createRequire(import.meta.url)(outfile)
const identity={sourceSha256:['a'.repeat(64)],frames:'10000',sampleRate:8000,channelCount:1}
const marker={id:'12345678-1234-1234-1234-123456789abc',startFrame:'0',endFrame:null,label:'Review',comment:'',createdAt:'2026-10-15T00:00:00.000Z'}
test('marker metadata rejects oversized timestamps and keys are independent of property insertion order',()=>{
 assert.throws(()=>m.validateMarker({...marker,createdAt:' '.repeat(2*1024*1024)+marker.createdAt},identity.frames),/INVALID_REVIEW_MARKER/)
 assert.equal(m.markerKey(identity),m.markerKey({channelCount:1,sampleRate:8000,frames:'10000',sourceSha256:identity.sourceSha256}))
})
test('session atomic save preserves preexisting temporary file and symbolic-link targets',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'session-')),foreign=path.join(root,'foreign.txt');await fs.writeFile(foreign,'untouched')
 // A regular old temporary file is portable; a POSIX link also proves no follow.
 if(process.platform!=='win32')await fs.symlink(foreign,path.join(directory,'session.json.tmp'))
 else await fs.writeFile(path.join(directory,'session.json.tmp'),'untouched')
 const doc={regions:[],assets:[],segments:[],takes:[],events:[],eventSequence:0}
 await new m.StoredSession(directory,doc).save()
 assert.equal(await fs.readFile(foreign,'utf8'),'untouched');assert.equal(await fs.readFile(path.join(directory,'session.json.tmp'),'utf8'),'untouched')
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'session.json'),'utf8')).regions,[])
})
test('oversized and linked metadata is rejected before parsing',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'metadata-'))
 await fs.writeFile(path.join(directory,'manifest.json'),' '.repeat(4*1024*1024+1))
 await assert.rejects(m.AnalysisCache.open(directory),/manifest (size|file)/)
 await fs.writeFile(path.join(directory,'session.json'),' '.repeat(16*1024*1024+1))
 await assert.rejects(m.readSession(directory),/INVALID_SESSION_FILE/)
 if(process.platform!=='win32'){
  await fs.unlink(path.join(directory,'manifest.json'));await fs.symlink(path.join(directory,'session.json'),path.join(directory,'manifest.json'))
  await assert.rejects(m.AnalysisCache.open(directory),/manifest (size|file)/)
 }
})
test('CSV text neutralizes formulas hidden behind whitespace and control characters',()=>{
 for(const text of ['=1+1',' +1','\n=HYPERLINK("test")','\t@SUM(1)','\r-1'])assert(m.csvText(text).startsWith('"\''),JSON.stringify(text))
 assert.equal(m.csvText('ordinary text'),'"ordinary text"')
})
const tile=()=>({firstFrame:'512',columns:64,fftSize:512,hop:128,bins:257,sampleRate:8000,channels:1,decibels:new Float32Array(64*257).fill(-100),status:new Uint8Array(64).fill(1)})
test('cache quota never follows a replaced key directory',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'quota-')),key='c'.repeat(64),sub=path.join(directory,key),name='overview-v1-1-512.bin'
 await fs.mkdir(sub);const data=m.encodeOverview(m.overviewFromTile(tile(),key));await fs.writeFile(path.join(sub,name),data)
 const quarantine=path.join(sub,'999.bin.corrupt-12345678-1234-1234-1234-123456789abc');await fs.writeFile(quarantine,'foreign sentinel')
 await m.enforceSpectralBudget(directory,{assetBytes:1000000,totalBytes:1000000})
 {
  const foreign=await fs.mkdtemp(path.join(root,'foreign-cache-'));await fs.writeFile(path.join(foreign,name),'foreign derived-name sentinel')
  await fs.rename(sub,sub+'-old');await fs.symlink(foreign,sub,process.platform==='win32'?'junction':'dir')
  await m.enforceSpectralBudget(directory,{assetBytes:0,totalBytes:0})
  assert.equal(await fs.readFile(path.join(foreign,name),'utf8'),'foreign derived-name sentinel')
  assert.equal(await fs.readFile(quarantine.replace(sub,sub+'-old'),'utf8'),'foreign sentinel')
 }
})
test('session event append rejects nonregular journals and preserves other files',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'events-')),foreign=path.join(root,'foreign-events');await fs.writeFile(foreign,'untouched');if(process.platform==='win32')await fs.mkdir(path.join(directory,'events.jsonl'));else await fs.symlink(foreign,path.join(directory,'events.jsonl'))
 const stored=new m.StoredSession(directory,{events:[],eventSequence:0});await assert.rejects(stored.event('test'),/INVALID_EVENT_FILE/);assert.equal(await fs.readFile(foreign,'utf8'),'untouched')
})

test('fatal diagnostics replace their record without following an existing file link',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'fatal-')),journal=await m.SupportJournal.open(directory),foreign=path.join(root,'foreign-fatal');await fs.writeFile(foreign,'untouched')
 if(process.platform!=='win32')await fs.symlink(foreign,path.join(directory,'fatal.json'));else await fs.writeFile(path.join(directory,'fatal.json'),'old diagnostic')
 journal.fatal('main-uncaught');assert.equal(await fs.readFile(foreign,'utf8'),'untouched');assert.equal(JSON.parse(await fs.readFile(path.join(directory,'fatal.json'),'utf8')).kind,'main-uncaught');await journal.finish()
})
test('diagnostic logging refuses a linked support directory without creating external files',async()=>{
 const foreign=await fs.mkdtemp(path.join(root,'foreign-support-')),linked=path.join(root,'linked-support');await fs.symlink(foreign,linked,process.platform==='win32'?'junction':'dir')
 const journal=await m.SupportJournal.open(linked);assert.equal(journal.status.loggingAvailable,false);journal.fatal('main-uncaught');await journal.finish();assert.deepEqual(await fs.readdir(foreign),[])
})

test('cache eviction preserves unverified quarantines and changed formerly validated files',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'changed-cache-')),key='d'.repeat(64),sub=path.join(directory,key),file=path.join(sub,'overview-v1-1-512.bin')
 await fs.mkdir(sub);const bytes=m.encodeOverview(m.overviewFromTile(tile(),key));await fs.writeFile(file,bytes)
 const quarantine=path.join(sub,'999.bin.corrupt-12345678-1234-1234-1234-123456789abc');await fs.writeFile(quarantine,'foreign sentinel')
 await m.enforceSpectralBudget(directory,{assetBytes:1000000,totalBytes:1000000});const changed=Buffer.alloc(bytes.length,88);await fs.writeFile(file,changed)
 await m.enforceSpectralBudget(directory,{assetBytes:0,totalBytes:0});assert.equal(await fs.readFile(quarantine,'utf8'),'foreign sentinel');assert.deepEqual(await fs.readFile(file),changed)
})
