import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
await mkdir('artifacts/audit',{recursive:true})
// fileJobs and unlink are stubbed so the deletion policy can be exercised
// without the native engine and with a controllable disk failure. The policy
// itself is the product code under test.
await build({
 entryPoints:['src/trace/sourceRetention.ts'],outfile:'artifacts/audit/source-retention.cjs',
 platform:'node',format:'cjs',bundle:true,
 plugins:[{name:'stubs',setup(b){
  b.onResolve({filter:/\.\/fileJobs$/},()=>({path:'jobs',namespace:'stub'}))
  // Must not intercept the stub's own require of the real module.
  b.onResolve({filter:/^node:fs\/promises$/},args=>args.namespace==='stub'?{external:true}:{path:'fsp',namespace:'stub'})
  b.onLoad({filter:/^jobs$/,namespace:'stub'},()=>({contents:`
   exports.analyzeFiles=async()=>globalThis.__traceAnalyze()
   exports.hashFiles=async files=>globalThis.__traceHash(files)
  `,loader:'js'}))
  // A Proxy keeps every real export intact (several are defined as getters and
  // would be lost by a spread) while making unlink controllable.
  b.onLoad({filter:/^fsp$/,namespace:'stub'},()=>({contents:`
   const real=require('node:fs/promises')
   module.exports=new Proxy(real,{get:(target,key)=>key==='unlink'
    ?(async p=>globalThis.__traceUnlink?globalThis.__traceUnlink(p,target.unlink):target.unlink(p))
    :key==='lstat'?(async p=>globalThis.__traceLstat?globalThis.__traceLstat(p,target.lstat):target.lstat(p))
    :target[key]})
  `,loader:'js'}))
 }}],
})
const {SourceRetention}=(await import(pathToFileURL(resolve('artifacts/audit/source-retention.cjs')))).default
await build({entryPoints:['src/trace/retentionState.ts'],outfile:'artifacts/audit/retention-state.cjs',platform:'node',format:'cjs',bundle:true})
const {restoreInterruptedRetention}=(await import(pathToFileURL(resolve('artifacts/audit/retention-state.cjs')))).default

const sha=text=>createHash('sha256').update(text).digest('hex')
const terminal=new Set(['removed','error','kept','pending'])
async function settle(document){
 for(let i=0;i<400;i++){
  if(terminal.has(document.retention?.phase))return document.retention.phase
  await new Promise(r=>setTimeout(r,5))
 }
 throw Error('Retention did not reach a terminal phase; last='+document.retention?.phase)
}

async function setup(){
 const dir=await mkdtemp(resolve('artifacts/audit/retention-')),audio=join(dir,'audio')
 await mkdir(audio)
 const names=['a.wav','b.wav']
 for(const name of names)await writeFile(join(audio,name),'PCM '+name)
 const assets=names.map((name,i)=>({assetId:'asset-'+i,role:'source',relativePath:'audio/'+name,
  sampleRate:48000,channelCount:2,encoding:'pcm24',frameCount:'48000',hash:sha('PCM '+name)}))
 assets.push({assetId:'out',role:'deliverable',relativePath:'audio/out.wav',sampleRate:48000,
  channelCount:2,encoding:'pcm24',frameCount:'96000',hash:sha('out'),state:'ready'})
 await writeFile(join(audio,'out.wav'),'out')
 const document={sessionId:'take',name:'Take',status:'ready',assets,regions:[],segments:[],
  preset:{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace',keepOriginal:false},exports:[]}
 const take={document,directory:dir,save:async()=>{},event:async()=>{}}

 globalThis.__traceUnlink=undefined
 globalThis.__traceLstat=undefined
 globalThis.__traceAnalyze=async()=>({manifest:{frames:'96000',cacheKey:'key'}})
 globalThis.__traceHash=async files=>files.map(f=>sha('PCM '+f.split(/[\\/]/).pop()))

 const recordings={sessions:()=>[take],session:()=>take,
  analysisSource:async()=>({sources:[join(audio,'out.wav')],cacheRoot:join(dir,'cache'),frames:'96000'})}
 const exporter={usesSource:()=>false,resolve:async()=>({})}
 const service=new SourceRetention(recordings,exporter,{view:()=>null},{cancelSources:async()=>{}},'unused',()=>{})
 return {dir,audio,document,take,service}
}

test('a successful retention pass removes the verified sources',async()=>{
 const t=await setup()
 t.service.schedule()
 assert.equal(await settle(t.document),'removed',t.document.retention?.error||'')
 assert.deepEqual(t.document.assets.filter(a=>a.role==='source').map(a=>a.state),['removed','removed'])
 assert.deepEqual((await readdir(t.audio)).sort(),['out.wav'])
 await t.service.shutdown()
})

// The policy commits 'removing' for the whole batch before deleting so a crash
// leaves a recoverable marker. The hazard is a delete that fails midway: every
// asset is already marked, and 'removing' is filtered out of the library,
// analysis and recovery, so a file that survived would be invisible forever.
test('a delete that fails midway leaves surviving sources visible',async()=>{
 const t=await setup()
 globalThis.__traceUnlink=async(path,real)=>{
  if(String(path).endsWith('b.wav'))throw Object.assign(Error('EBUSY'),{code:'EBUSY'})
  return real(path)
 }
 t.service.schedule()
 assert.equal(await settle(t.document),'error','the failure must be recorded')

 const sources=t.document.assets.filter(a=>a.role==='source')
 const survivor=sources.find(a=>a.relativePath.endsWith('b.wav'))
 assert.equal(await readFile(join(t.audio,'b.wav'),'utf8'),'PCM b.wav','the file survived the failure')
 assert.notEqual(survivor.state,'removing','a surviving file must not stay hidden behind removing')
 assert.notEqual(survivor.state,'removed','a surviving file must not be recorded as deleted')
 assert.equal(sources.find(a=>a.relativePath.endsWith('a.wav')).state,'removed','the deleted one keeps its honest state')
 await t.service.shutdown()
})

test('a previously persisted removing state is made visible before retrying a busy file',async()=>{
 const t=await setup()
 t.document.retention={phase:'removing',error:null}
 for(const asset of t.document.assets.filter(a=>a.role==='source'))asset.state='removing'
 assert.equal(restoreInterruptedRetention(t.document),true)
 assert.equal(t.document.retention.phase,'error')
 assert(t.document.assets.filter(a=>a.role==='source').every(a=>a.state===undefined))
 globalThis.__traceUnlink=async(p,real)=>{
  if(String(p).endsWith('b.wav'))throw Object.assign(Error('EBUSY'),{code:'EBUSY'})
  return real(p)
 }
 await t.service.retry('take')
 assert.equal(await settle(t.document),'error')
 assert.equal(await readFile(join(t.audio,'b.wav'),'utf8'),'PCM b.wav')
 assert.notEqual(t.document.assets.find(a=>a.relativePath==='audio/b.wav').state,'removing')
 await t.service.shutdown()
})

test('permission uncertainty does not label a surviving source as removed',async()=>{
 const t=await setup();let deleting=false
 globalThis.__traceUnlink=async(p,real)=>{
  if(String(p).endsWith('b.wav')){deleting=true;throw Object.assign(Error('EBUSY'),{code:'EBUSY'})}
  return real(p)
 }
 globalThis.__traceLstat=async(p,real)=>{
  if(deleting&&String(p).endsWith('b.wav'))throw Object.assign(Error('EACCES'),{code:'EACCES'})
  return real(p)
 }
 t.service.schedule();assert.equal(await settle(t.document),'error')
 assert.equal(await readFile(join(t.audio,'b.wav'),'utf8'),'PCM b.wav')
 const survivor=t.document.assets.find(a=>a.relativePath==='audio/b.wav')
 assert.notEqual(survivor.state,'removed')
 assert.notEqual(survivor.state,'removing')
 await t.service.shutdown()
})

test('a failed rollback save leaves an explicit recoverable intent on next load',async()=>{
 const t=await setup();let saved,attempts=0
 t.take.save=async()=>{if(++attempts===1){saved=structuredClone(t.document);return}throw Object.assign(Error('EACCES'),{code:'EACCES'})}
 globalThis.__traceUnlink=async(p,real)=>{
  if(String(p).endsWith('b.wav'))throw Object.assign(Error('EBUSY'),{code:'EBUSY'})
  return real(p)
 }
 t.service.schedule();assert.equal(await settle(t.document),'error')
 assert.equal(saved.assets.find(a=>a.relativePath==='audio/b.wav').state,'removing')
 assert.equal(restoreInterruptedRetention(saved),true)
 assert.equal(saved.assets.find(a=>a.relativePath==='audio/b.wav').state,undefined)
 assert.equal(saved.retention.phase,'error')
 assert.equal(await readFile(join(t.audio,'b.wav'),'utf8'),'PCM b.wav')
 await t.service.shutdown()
})
