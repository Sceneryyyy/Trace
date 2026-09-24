import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/audit',{recursive:true})
await build({entryPoints:['src/trace/recording.ts'],outfile:'artifacts/audit/recording.cjs',platform:'node',format:'cjs',bundle:true,external:['electron']})
const {sourceContinuity}=(await import(pathToFileURL(resolve('artifacts/audit/recording.cjs')))).default

const region=(patch={})=>({id:'r1',ordinal:1,nativeId:'n1',baseName:'take',journalFile:'journal.jsonl',
 format:{sampleRate:48000,channelCount:2},frames:'48000',startFrame:'0',endFrameExclusive:'48000',
 clock:{domain:'d',startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false},
 encoding:'pcm24',status:'closed',error:null,estimatedFrames:'0',clippedSamples:'0',...patch})
const doc=(patch={})=>({regions:[region()],hasDiscontinuities:false,...patch})

// Playback has no capture clock of its own. If the take-level finding does not
// travel with the source, a gapped or recovered take reads as complete while
// being played back, which is exactly the "silently report complete" failure
// the audio contract forbids.
test('an intact single-region take is the only case that reads as complete',()=>{
 assert.equal(sourceContinuity(doc()),'complete')
})

test('interruption, recovery and stitched regions are reported as gaps',()=>{
 assert.equal(sourceContinuity(doc({regions:[region({status:'interrupted'})]})),'gaps')
 assert.equal(sourceContinuity(doc({regions:[region({error:'RECOVERED_UNKNOWN_TAIL'})]})),'gaps')
 assert.equal(sourceContinuity(doc({regions:[region(),region({id:'r2',ordinal:2})]})),'gaps')
 assert.equal(sourceContinuity(doc({hasDiscontinuities:true})),'gaps')
})

test('device-failure frames that were filled in are not reported as plain silence',()=>{
 assert.equal(sourceContinuity(doc({regions:[region({estimatedFrames:'480'})]})),'estimated-silence')
})

test('a cancelled or empty region neither hides nor invents a discontinuity',()=>{
 // A cancelled region carries no audio, so it must not make an otherwise intact
 // take look stitched.
 assert.equal(sourceContinuity(doc({regions:[region(),region({id:'r2',ordinal:2,status:'cancelled',frames:'0'})]})),'complete')
 assert.equal(sourceContinuity(doc({regions:[region(),region({id:'r2',ordinal:2,frames:'0'})]})),'complete')
})

test('opening one region of a multi-region take judges only that region',()=>{
 const stitched=doc({regions:[region(),region({id:'r2',ordinal:2,status:'interrupted'})]})
 assert.equal(sourceContinuity(stitched,'r1'),'complete')
 assert.equal(sourceContinuity(stitched,'r2'),'gaps')
})
