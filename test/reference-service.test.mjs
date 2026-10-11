import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/m12',{recursive:true});await build({entryPoints:['src/trace/referenceService.ts'],outfile:'artifacts/m12/reference-service.cjs',bundle:true,platform:'node',format:'cjs'})
const {ReferenceService}=(await import(pathToFileURL(resolve('artifacts/m12/reference-service.cjs')))).default
const tick=()=>new Promise(r=>setImmediate(r)),wait=async fn=>{for(let i=0;i<1000;i++){if(fn())return;await tick()}throw Error('reference wait')}
const source=(id,rate=48000)=>({takeId:id,role:'source',label:id,sources:[id+'.wav'],cacheRoot:'test-only',sampleRate:rate,channelCount:2,frames:String(rate*120)})
const view=(s,id='playback')=>({id,takeId:s.takeId,role:s.role,positionFrame:String(s.sampleRate),sampleRate:s.sampleRate,totalFrames:s.frames,channelCount:2,gain:.5,startFrame:'0',endFrame:s.frames,selection:null,loop:false,follow:false,analysisId:'existing-'+id,outputReady:false})
function setup(){
 let next=0,resolveSource=async r=>source(r.takeId);const jobs=new Map(),retained=new Map(),released=[]
 const analyses={start:s=>{const id='job-'+(++next),m=(value,unit)=>({value,unit,status:'ready'});jobs.set(id,{id,label:s.label,phase:'ready',frames:s.frames,totalFrames:s.frames,sampleRate:s.sampleRate,summary:{integratedToCursor:m(s.takeId==='a'?-23:-25,'LUFS'),maxTruePeak:m(-1,'dBTP'),loudnessRange:m(8,'LU')}});return id},retain:id=>retained.set(id,(retained.get(id)||0)+1),release:(id,cancel)=>{retained.set(id,(retained.get(id)||0)-1);released.push({id,cancel})},snapshots:()=>[...jobs.values()],identity:id=>jobs.has(id)?{engineSha256:'same',measurementConfigId:'same'}:undefined}
 const svc=new ReferenceService(analyses,r=>resolveSource(r),()=>{}),bind=async(s,id='p')=>{const v=view(s,id);v.analysisId=analyses.start(s);analyses.retain(v.analysisId);await svc.bindPrimary(s,v);return v}
 return {svc,analyses,jobs,retained,released,bind,setResolver:f=>resolveSource=f}
}
test('A/B own analysis references and ranges; switching B does not relabel it as A',async()=>{
 const t=setup(),a=source('a'),v=await t.bind(a);t.svc.setReference({takeId:'b',role:'source'},'b');await wait(()=>!!t.svc.view().b);assert.equal(t.svc.view().deltas.integrated.value,2);const p=t.svc.activation('b',v);const b=source('b');t.svc.activated('b',{...view(b,'b-play'),positionFrame:p.positionFrame});assert.equal(t.svc.view().active,'b');assert.equal(t.svc.view().a.label,'a');assert.equal(t.svc.view().b.label,'b')
 await t.svc.range('b',{startFrame:'48000',endFrame:'144000'});assert.equal(t.svc.view().b.analysis.frames,'96000');assert.equal(t.svc.view().deltas.lra.status,'unavailable');await t.svc.clearReference();assert.equal(t.svc.view().b,null);assert.equal(t.svc.view().a.label,'a');await t.svc.shutdown();assert.equal(t.retained.get(v.analysisId),1)
})
test('a later B request wins even when the older resolver finishes after it was superseded',async()=>{
 const t=setup();let finish;t.setResolver(r=>r.takeId==='old'?new Promise(resolve=>finish=()=>resolve(source('old'))):Promise.resolve(source(r.takeId)));t.svc.setReference({takeId:'old',role:'source'},'old');await wait(()=>!!finish);t.svc.setReference({takeId:'new',role:'source'},'new');finish();await wait(()=>t.svc.view().b?.label==='new');assert.equal(t.svc.view().pending,null);assert(![...t.jobs.values()].some(j=>j.label==='old'));await t.svc.shutdown()
})
test('recording pauses binding and preserves the latest requested reference',async()=>{
 const t=setup();let finish;t.setResolver(r=>r.takeId==='old'?new Promise(resolve=>finish=()=>resolve(source('old'))):Promise.resolve(source(r.takeId)));t.svc.setReference({takeId:'old',role:'source'},'old');await wait(()=>!!finish);t.svc.setReference({takeId:'new',role:'source'},'new');t.svc.setRecordingBusy(true);finish();await tick();assert.equal(t.svc.view().b,null);t.svc.setRecordingBusy(false);await wait(()=>t.svc.view().b?.label==='new');await t.svc.shutdown()
})
test('forgetting a source waits for query completion and a late bind cannot restore it',async()=>{
 const t=setup();let finish;t.setResolver(()=>new Promise(r=>finish=()=>r(source('b'))));t.svc.setReference({takeId:'b',role:'source'},'b');await wait(()=>!!finish);let done=false;const drop=t.svc.forgetTake('b').then(()=>done=true);await tick();assert(!done);finish();await drop;assert.equal(t.svc.view().b,null);assert.equal(t.svc.view().pending,null);assert(!t.svc.usesTake('b'));await t.svc.shutdown()
})
test('linked activation converts time across rates and rejects unavailable positions without clamping',async()=>{
 const t=setup(),a=source('a',44100),v=await t.bind(a);t.setResolver(async()=>source('b',48000));t.svc.setReference({takeId:'b',role:'source'},'b');await wait(()=>!!t.svc.view().b);t.svc.configure('250000000',true);assert.equal(t.svc.activation('b',v).positionFrame,'60000');t.svc.configure('-2000000000',true);assert.throws(()=>t.svc.activation('b',v),/OUTSIDE_RANGE/);t.svc.configure('-2000000000',false);assert.equal(t.svc.activation('b',v).positionFrame,'0');await t.svc.shutdown()
})

test('original audio remains owned by reference peers and pending resolutions until they are released',async()=>{
 const t=setup();await t.bind(source('a'));assert(t.svc.usesTake('a'));let finish;t.setResolver(()=>new Promise(r=>finish=()=>r(source('b'))));t.svc.setReference({takeId:'b',role:'source'},'b');await wait(()=>!!finish);assert(t.svc.usesTake('b'));finish();await wait(()=>!!t.svc.view().b);assert(t.svc.usesTake('b'));await t.svc.clearReference();assert(!t.svc.usesTake('b'));assert(t.svc.usesTake('a'));await t.svc.shutdown();assert(!t.svc.usesTake('a'))
})

test('audition gain stays separate from measurements and manual volume across matching, switch and range changes',async()=>{
 const t=setup(),v=await t.bind(source('a'));t.svc.setReference({takeId:'b',role:'source'},'b');await wait(()=>!!t.svc.view().b);const before=structuredClone(t.svc.view().a.analysis.summary)
 t.svc.setMatching(true);const match=t.svc.view().match;assert.equal(match.status,'ready');assert(match.aDb<=0&&match.bDb<=0)
 const applied=t.svc.markAudition('a');t.svc.observe({...v,gain:applied});assert.equal(t.svc.peer('a').gain,v.gain);const manual=t.svc.setAuditionVolume('a',.7);t.svc.observe({...v,gain:manual});assert.equal(t.svc.peer('a').gain,.7);assert.deepEqual(t.svc.view().a.analysis.summary,before)
 t.svc.setMatching(false);assert.equal(t.svc.markAudition('a'),.7);await t.svc.shutdown()
})
