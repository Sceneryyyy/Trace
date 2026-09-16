
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/scrub',{recursive:true})
await build({entryPoints:['src/trace/renderer/historyPresentation.ts'],outfile:'artifacts/scrub/history-presentation.cjs',platform:'node',format:'cjs',bundle:true})
const {HistoryPresentation}=(await import(pathToFileURL(resolve('artifacts/scrub/history-presentation.cjs')))).default
const file=(generation='1',id='a')=>({id,generation,startFrame:'0',endFrame:'480000',error:null,analysisPhase:'ready'})
const state=(playback=file())=>({revision:10,deviceId:'device',playback})
const frame=(generation='1',sequence=1,id='a')=>({sourceKind:'file',sourceId:id,eventSequence:sequence,stateRevision:1,positionFrame:String(Number(generation)*48000),playback:{generation},fileView:{startFrame:'0',endFrame:'480000'},momentary:{status:'ready',value:-23,unit:'LUFS'}})
test('unrelated state revisions do not blank an otherwise current history frame',()=>{
 const gate=new HistoryPresentation(),value=frame()
 assert(gate.accept(value,state()));assert.equal(gate.snapshot,value)
 gate.reconcile(state(file('2')));assert.equal(gate.snapshot,value)
 assert.equal(gate.accept(frame('1',2),state(file('2'))),false);assert.equal(gate.snapshot,value)
})
test('a cursor request waits for its complete frame and rejects late generations',async()=>{
 const gate=new HistoryPresentation();gate.accept(frame(),state())
 let resolved=false;const pending=gate.waitFor(file('2')).then(()=>resolved=true)
 await Promise.resolve();assert.equal(resolved,false)
 assert.equal(gate.accept(frame('1',2),state(file('2'))),false)
 await Promise.resolve();assert.equal(resolved,false)
 const next=frame('2',3);assert(gate.accept(next,state(file('2'))));await pending
 assert.equal(gate.snapshot.positionFrame,next.positionFrame);assert.equal(gate.snapshot.momentary,next.momentary)
})
test('a newer viewport is not painted with an older window response',async()=>{
 const gate=new HistoryPresentation(),view={...file(),startFrame:'48000'}
 let resolved=false;const pending=gate.waitFor(view).then(()=>resolved=true)
 assert.equal(gate.accept(frame(),state(view)),false);await Promise.resolve();assert.equal(resolved,false)
 const next=frame('1',2);next.fileView.startFrame='48000';assert(gate.accept(next,state(view)));await pending
})
test('source changes and real data failures release the pending interaction',async()=>{
 const gate=new HistoryPresentation();let done=false
 const wait=gate.waitFor(file()).then(()=>done=true);gate.reconcile(state(file('1','b')));await wait;assert(done)
 assert.equal(gate.accept(frame('1',1,'a'),state(file('1','b'))),false)
 const pending=gate.waitFor(file('1','b'));gate.reconcile(state({...file('1','b'),error:'FILE_SNAPSHOT_FAILED: injected'}));await pending
 assert.equal(gate.accept(frame('1',2,'b'),state({...file('1','b'),error:'FILE_SNAPSHOT_FAILED: injected'})),false)
})
test('unavailable and silent measurements are accepted as actual data, never replaced with held numbers',()=>{
 const gate=new HistoryPresentation();gate.accept(frame(),state())
 const missing=frame('2',2);missing.momentary={status:'gap',value:null,unit:'LUFS'}
 assert(gate.accept(missing,state(file('2'))));assert.equal(gate.snapshot.momentary.status,'gap')
 const silence=frame('3',3);silence.momentary={status:'silence',value:null,unit:'LUFS'}
 assert(gate.accept(silence,state(file('3'))));assert.equal(gate.snapshot.momentary.status,'silence')
})
test('real-time source and sequence guards remain in force',()=>{
 const gate=new HistoryPresentation(),live={...frame(),sourceKind:'live',sourceId:'device',stateRevision:10}
 assert.equal(gate.accept(live,state()),false);assert(gate.accept(live,state(null)))
 assert.equal(gate.accept({...live,stateRevision:9,eventSequence:2},state(null)),false)
 assert.equal(gate.accept({...live,eventSequence:3,sourceId:'old-device'},state(null)),false)
 assert.equal(gate.accept({...live,eventSequence:1},state(null)),false)
})
test('cancellation and an already presented cursor resolve without waiting',async()=>{
 const gate=new HistoryPresentation();gate.accept(frame(),state());await gate.waitFor(file())
 const pending=gate.waitFor(file('2'));gate.cancel();await pending
})
