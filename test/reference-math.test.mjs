import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m12',{recursive:true});await build({entryPoints:['src/trace/referenceMath.ts'],outfile:'artifacts/m12/reference-math.cjs',platform:'node',format:'cjs',bundle:true})
const {referenceRange,referenceOffset,referencePosition,referenceDelta}=(await import(pathToFileURL(resolve('artifacts/m12/reference-math.cjs')))).default
test('comparison frames use common time across sample rates, signed offsets and source bounds',()=>{
 const range={startFrame:'0',endFrame:'960000'};assert.equal(referencePosition('44100',44100,48000,'0',range),'48000');assert.equal(referencePosition('44100',44100,48000,'250000000',range),'60000');assert.equal(referencePosition('44100',44100,48000,'-250000000',range),'36000')
 assert.equal(referencePosition('0',44100,48000,'-1000000000',range),null);assert.equal(referencePosition('882000',44100,48000,'1',range),'960000');assert.equal(referencePosition('882001',44100,48000,'0',range),null)
 const large='9007199254740993';assert.equal(referencePosition(large,48000,48000,'0',{startFrame:'0',endFrame:'18446744073709551615'}),large)
})
test('ranges and offsets refuse malformed or empty comparisons instead of fixing them silently',()=>{
 assert.deepEqual(referenceRange(undefined,'100'),{startFrame:'0',endFrame:'100'});for(const r of [{startFrame:'5',endFrame:'5'},{startFrame:'0',endFrame:'101'},{startFrame:'-1',endFrame:'10'}])assert.throws(()=>referenceRange(r,'100'))
 for(const o of ['NaN','-0','0.1','86400000000001','-86400000000001'])assert.throws(()=>referenceOffset(o));assert.equal(referenceOffset('-86400000000000'),-86400000000000n)
})
test('A-minus-B differences retain raw precision, proper units and unavailable/silence semantics',()=>{
 const metric=(value,unit='LUFS',status='ready')=>({value,unit,status}),duration={a:120,b:120};const a=-23.041234,b=-24.0001;assert.equal(referenceDelta('integrated',metric(a),metric(b),duration).value,a-b)
 assert.equal(referenceDelta('truePeak',metric(-1,'dBTP'),metric(-3,'dBTP'),duration).unit,'dB');assert.equal(referenceDelta('lra',metric(8,'LU'),metric(5,'LU'),{a:30,b:60}).status,'unavailable')
 for(const status of ['silence','gap','error','insufficient'])assert.equal(referenceDelta('integrated',metric(null,'LUFS',status),metric(-23),duration).status,'unavailable');assert.equal(referenceDelta('integrated',metric(-23,'dBFS'),metric(-24),duration).status,'unavailable')
})
