import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m11',{recursive:true})
for(const name of ['reportService','targetSettings'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m11/'+name+'-service.cjs',platform:'node',format:'cjs',bundle:true})
const mod=async name=>(await import(pathToFileURL(resolve('artifacts/m11/'+name+'-service.cjs')))).default
const {ReportService}=await mod('reportService'),{defaultTargetSettings:s}=await mod('targetSettings')
const tick=()=>new Promise(r=>setImmediate(r))
const input=(id,retain)=>({playbackId:id,retain,request:{version:1,source:{label:id,takeId:id,role:'source',sourceFrames:'10',scope:{kind:'whole',startFrame:'0',endFrame:'10'},integrity:{state:'complete',notes:[]}},cacheDirectory:'unused',cacheKey:'a'.repeat(64),sourceFiles:['unused']}})
test('concurrent report requests keep one worker/two jobs and release only their own leases',async()=>{
 const root=await mkdtemp(resolve('artifacts/m11/service-'));let held=0,running=0,peak=0;const resolvers=[]
 const svc=new ReportService(root,()=>{},async(req,signal)=>{running++;peak=Math.max(peak,running);await new Promise(resolve=>resolvers.push(resolve));running--;if(signal.aborted)throw Error('cancelled');return {events:0,evaluation:{state:'pass'},files:{html:'report.html'}}})
 const retain=()=>{held++;return()=>held--},a=svc.start(input('a',retain),s),b=svc.start(input('b',retain),s)
 await assert.rejects(svc.start(input('c',retain),s),/QUEUE_FULL/);const [aid,bid]=await Promise.all([a,b]);assert.equal(held,2);svc.cancel(bid);assert.equal(held,1);resolvers[0]();while(svc.views().find(v=>v.id===aid).phase!=='ready')await tick();assert.equal(held,0);assert.equal(peak,1);await svc.shutdown()
})
test('cache/source removal waits for cancellation before releasing the lease and private outputs',async()=>{
 const root=await mkdtemp(resolve('artifacts/m11/removal-'));let entered,finish,released=false;const started=new Promise(r=>entered=r)
 const svc=new ReportService(root,()=>{},async(req,signal)=>{await mkdir(req.outputDirectory);await writeFile(join(req.outputDirectory,'history.csv'),'partial');entered();await new Promise(r=>finish=r);if(signal.aborted)throw Error('cancelled');return {}})
 await svc.start(input('take',()=>()=>released=true),s);await started;let done=false;const removal=svc.forgetTake('take').then(()=>done=true);await tick();assert(!done&&!released);assert(svc.usesTake('take'),'source remains owned while a cancelled worker is still reading');finish();await removal;assert(released);assert(!svc.usesTake('take'));assert.deepEqual(svc.views(),[]);assert.deepEqual(await readdir(root),[])
})
test('export creates a new bundle and copies only the four report files',async()=>{
 const root=await mkdtemp(resolve('artifacts/m11/export-')),destination=await mkdtemp(resolve('artifacts/m11/destination-'))
 const svc=new ReportService(root,()=>{},async req=>{await mkdir(req.outputDirectory);for(const n of ['report.html','summary.csv','history.csv','events.csv'])await writeFile(join(req.outputDirectory,n),n);await writeFile(join(req.outputDirectory,'not-report.wav'),'private');return {events:0,evaluation:{state:'pass'}}})
 const id=await svc.start(input('take',()=>()=>{}),s);while(svc.views()[0].phase!=='ready')await tick();const out=await svc.export(id,destination);assert.deepEqual((await readdir(out)).sort(),['events.csv','history.csv','report.html','summary.csv']);assert.equal(await readFile(join(out,'report.html'),'utf8'),'report.html');await svc.shutdown()
})
test('startup cleanup requires an owned marker and preserves unrelated files',async()=>{
 const root=await mkdtemp(resolve('artifacts/m11/startup-')),foreign=join(root,'unrelated');await mkdir(foreign);await writeFile(join(foreign,'keep.wav'),'audio')
 const id='11111111-1111-4111-8111-111111111111',owned=join(root,id);await mkdir(join(owned,'data'),{recursive:true});await writeFile(join(owned,'owner.json'),JSON.stringify({product:'TraceReportDraft',version:1,id}));await writeFile(join(owned,'data','history.csv'),'old')
 const svc=new ReportService(root,()=>{});await svc.initialize();assert.deepEqual(await readdir(root),['unrelated']);assert.equal(await readFile(join(foreign,'keep.wav'),'utf8'),'audio')
})

test('recording suspends report generation and resumes the same frozen scope without losing its lease',async()=>{
 const root=await mkdtemp(resolve('artifacts/m11/suspend-'));let held=0,attempts=0;const sources=[]
 const svc=new ReportService(root,()=>{},async(req,signal)=>{sources.push(req.source);attempts++;if(attempts===1)await new Promise(r=>signal.addEventListener('abort',r,{once:true}));if(signal.aborted)throw Error('cancelled');return {events:0,evaluation:{state:'pass'}}})
 await svc.start(input('take',()=>{held++;return()=>held--}),s);assert.equal(held,1);svc.setRecordingBusy(true)
 while(svc.views()[0].phase!=='queued')await tick();assert.equal(held,1);await tick();assert.equal(attempts,1)
 svc.setRecordingBusy(false);while(svc.views()[0].phase!=='ready')await tick();assert.equal(held,0);assert.deepEqual(sources[0],sources[1]);await svc.shutdown()
})

test('recording interrupts a copying export and preserves the ready preview',async()=>{
 const root=await mkdtemp(resolve('artifacts/m11/export-cancel-')),destination=await mkdtemp(resolve('artifacts/m11/cancel-destination-'))
 const svc=new ReportService(root,()=>{},async req=>{await mkdir(req.outputDirectory);for(const n of ['report.html','summary.csv','history.csv','events.csv'])await writeFile(join(req.outputDirectory,n),n);return {events:0,evaluation:{state:'pass'}}})
 const id=await svc.start(input('take',()=>()=>{}),s);while(svc.views()[0].phase!=='ready')await tick()
 const copying=svc.export(id,destination);svc.setRecordingBusy(true);await assert.rejects(copying,/CANCELLED/);assert.equal(svc.views()[0].phase,'ready');assert.equal(svc.views()[0].exportState.phase,'cancelled');assert.deepEqual(await readdir(destination),[]);assert.equal(await readFile(svc.file(id),'utf8'),'report.html');svc.setRecordingBusy(false);await svc.export(id,destination);await svc.shutdown()
})
