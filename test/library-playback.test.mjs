import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/library',{recursive:true})
await build({entryPoints:['src/trace/renderer/libraryPlayback.ts'],outfile:'artifacts/library/playback.cjs',bundle:true,platform:'node',format:'cjs'})
await build({entryPoints:['src/trace/renderer/libraryModel.ts'],outfile:'artifacts/library/model.cjs',bundle:true,platform:'node',format:'cjs'})
const {LibraryPlayback}=(await import(pathToFileURL(resolve('artifacts/library/playback.cjs')))).default
const {recordingRow,importedRow,filterLibrary,preferredSource,rowWarning,libraryPageSize,libraryDuration}=(await import(pathToFileURL(resolve('artifacts/library/model.cjs')))).default
const source=id=>({takeId:id,role:'source'})
const file=(id,patch={})=>({...source(id),id:'playback-'+id,phase:'paused',outputReady:false,positionFrame:'24000',selection:{startFrame:'12000',endFrame:'36000'},...patch})
const gate=()=>{let release;return {promise:new Promise(r=>release=r),release:()=>release()}}
function harness(initial={}){
 let state={revision:1,...initial};const calls=[],errors=[],pending=[];let before=async()=>{}
 const controller=new LibraryPlayback(()=>state,async(name,payload,valid)=>{
  await before(name,payload)
  if(!valid())return
  calls.push([name,payload])
  if(name==='file.open')state={...state,playback:file(payload.takeId,{...payload})}
  else if(name==='playback.play'||name==='playback.pause')state={...state,playback:{...state.playback,outputReady:name==='playback.play',phase:name==='playback.play'?'playing':'paused'}}
 },v=>pending.push(v),e=>errors.push(e))
 return {controller,calls,errors,pending,get state(){return state},setState:s=>state=s,before:fn=>before=fn}
}
test('the current source pauses and resumes without reopening or discarding selection/cursor',async()=>{
 const h=harness({playback:file('a',{phase:'playing',outputReady:true})});await h.controller.activate(source('a'),true);await h.controller.activate(source('a'),true)
 assert.deepEqual(h.calls.map(c=>c[0]),['playback.pause','playback.play']);assert.equal(h.state.playback.positionFrame,'24000');assert.deepEqual(h.state.playback.selection,{startFrame:'12000',endFrame:'36000'})
})
test('inspection opens a paused context and never sends a play command',async()=>{
 const h=harness();await h.controller.activate(source('a'),false);assert.deepEqual(h.calls.map(c=>c[0]),['file.open']);assert.equal(h.state.playback.outputReady,false)
})
test('A to B while A opens suppresses stale autoplay and plays only B',async()=>{
 const h=harness(),g=gate();let entered=false
 h.before(async name=>{if(name==='file.open'&&!entered){entered=true;await g.promise}})
 const task=h.controller.activate(source('a'),true);await Promise.resolve();h.controller.activate(source('b'),true);g.release();await task
 assert.deepEqual(h.calls.map(([name,p])=>[name,p.takeId||p.playbackId]),[['file.open','b'],['playback.play','playback-b']]);assert.equal(h.state.playback.takeId,'b')
})
test('a click arriving after an open completed still prevents its queued play command',async()=>{
 const h=harness(),g=gate();let entered=false
 h.before(async name=>{if(name==='playback.play'&&!entered){entered=true;await g.promise}})
 const task=h.controller.activate(source('a'),true)
 while(!entered)await new Promise(r=>setImmediate(r))
 h.controller.activate(source('b'),true);g.release();await task
 assert.deepEqual(h.calls.filter(([name])=>name==='playback.play').map(([,p])=>p.playbackId),['playback-b'])
})
test('toolbar cancellation and REC invalidate a pending library click inside the queue',async()=>{
 for(const recording of [false,true]){
  const h=harness(),g=gate();h.before(()=>g.promise);const task=h.controller.activate(source('a'),true)
  if(recording)h.setState({...h.state,currentRecord:{id:'rec'}});else h.controller.cancel()
  g.release();await task;assert.equal(h.calls.length,0)
 }
})
test('file versions and regions are part of identity, and ended output restarts instead of pausing',async()=>{
 const h=harness({playback:file('a',{role:'export',exportId:'old'})});await h.controller.activate({...source('a'),regionId:'r2'},false)
 assert.deepEqual(h.calls[0],['file.open',{...source('a'),regionId:'r2'}])
 h.setState({playback:file('a',{phase:'ended',outputReady:true})});await h.controller.activate(source('a'),true);assert.equal(h.calls.at(-1)[0],'playback.play')
})
test('failed opening produces an error without issuing play or keeping pending state',async()=>{
 const h=harness();h.before(async()=>{throw Error('MISSING_SOURCE')});await h.controller.activate(source('a'),true)
 assert.equal(h.calls.length,0);assert.match(String(h.errors[0]),/MISSING_SOURCE/);assert.equal(h.pending.at(-1),false)
})
test('an inspection finishing synchronously cannot strand a subsequent intent',async()=>{
 const h=harness({playback:file('a')});const a=h.controller.activate(source('a'),false);h.controller.activate(source('b'),true);await a
 assert.equal(h.state.playback.takeId,'b');assert.equal(h.state.playback.outputReady,true)
})
const take=(id,patch={})=>({id,name:id,createdAt:'2026-10-15T12:00:00Z',status:'ready',frames:'48000',sampleRate:48000,encoding:'pcm24',roles:['source'],...patch})
test('ready preferred exports are selected; unavailable exports fall back to the actual available region',()=>{
 const t=take('a',{preferredExportId:'x',regionCount:2,analysisRegions:[{role:'source',id:'r1'}],exports:[{id:'x',phase:'encoding'}]})
 assert.deepEqual(preferredSource(t),{...source('a'),regionId:'r1'});t.exports[0].phase='ready';assert.deepEqual(preferredSource(t),{takeId:'a',role:'export',exportId:'x'})
 t.exports[0].availability='missing';assert.deepEqual(preferredSource(t),{...source('a'),regionId:'r1'})
})
test('capture warnings, failed-but-playable takes and unavailable imports retain distinct meanings',()=>{
 for(const [quality,label]of [['estimated-silence','包含估计静音'],['unknown','采集完整性未知'],['gaps','音频有中断']])assert.match(rowWarning(recordingRow(take('a',{continuity:quality}))),new RegExp(label))
 const t=recordingRow(take('a',{status:'failed'}));assert.equal(t.ready,true);assert.equal(t.attention,true)
 const a=importedRow({id:'i',name:'外部',sourceName:'original.wav',createdAt:'2026-10-15T12:00:00Z',status:'changed',phase:'cancelled'});assert.equal(a.ready,false);assert.equal(a.attention,true)
})
test('filtering/sorting never mutates source order or converts long durations to imprecise numbers',()=>{
 const rows=[recordingRow(take('b',{durationNs:'9007199254740993'})),recordingRow(take('a',{durationNs:'9007199254740992'}))];const f={query:'',status:'all',from:'',to:'',sort:'duration'}
 assert.deepEqual(filterLibrary(rows,f).map(r=>r.id),['b','a']);assert.deepEqual(filterLibrary(rows,{...f,sort:'name'}).map(r=>r.id),['a','b']);assert.deepEqual(rows.map(r=>r.id),['b','a'])
 assert.equal(filterLibrary(rows,{...f,query:' b '}).length,1);assert.equal(filterLibrary(rows,{...f,to:'2000-01-01'}).length,0)
})
test('5000 stable identifiers remain reachable with a bounded 50-row page',()=>{
 const rows=Array.from({length:5000},(_,i)=>recordingRow(take('r'+i)));const filtered=filterLibrary(rows,{query:'',status:'all',from:'',to:'',sort:'name'})
 const found=new Set();for(let p=0;p<filtered.length;p+=libraryPageSize){const page=filtered.slice(p,p+libraryPageSize);assert(page.length<=50);for(const row of page)found.add(row.id)}assert.equal(found.size,5000)
})

test('list durations stay compact while preserving hour boundaries without rounding up',()=>{
 assert.equal(libraryDuration(0n),'—');assert.equal(libraryDuration(999999999n),'0:00');assert.equal(libraryDuration(59999999999n),'0:59');assert.equal(libraryDuration(3600000000000n),'1:00:00')
})

test('unknown dates stay last and never match date ranges; capture quality warnings remain in attention filter',()=>{
 const rows=[recordingRow(take('broken',{status:'unreadable',createdAt:'',roles:[]})),recordingRow(take('quality',{continuity:'estimated-silence'})),recordingRow(take('normal'))],f={query:'',status:'all',from:'',to:'',sort:'newest'}
 for(const sort of ['newest','oldest'])assert.equal(filterLibrary(rows,{...f,sort}).at(-1).id,'broken')
 assert(!filterLibrary(rows,{...f,from:'2020-01-01'}).some(r=>r.id==='broken'))
 assert.deepEqual(filterLibrary(rows,{...f,status:'attention'}).map(r=>r.id),['quality','broken'])
})
