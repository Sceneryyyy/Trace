import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m6',{recursive:true})
for(const name of ['displaySettings','windowGeometry','recordSettings'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m6/'+name+'.cjs',platform:'node',format:'cjs',bundle:true})
const load=async name=>(await import(pathToFileURL(resolve('artifacts/m6/'+name+'.cjs')))).default
const {validateDisplaySettings}=await load('displaySettings'),{restoreWindowBounds}=await load('windowGeometry'),{validateRecordSettings}=await load('recordSettings')
test('display settings validate target line and bounded waveform gain',()=>{
 assert.deepEqual(validateDisplaySettings({targetEnabled:true,targetLufs:-23,waveGain:4}),{targetEnabled:true,targetLufs:-23,waveGain:4})
 for(const value of [-61,1,Infinity])assert.throws(()=>validateDisplaySettings({targetEnabled:true,targetLufs:value,waveGain:4}))
 assert.throws(()=>validateDisplaySettings({targetEnabled:true,targetLufs:-23,waveGain:99}))
})
test('saved windows restore on negative-coordinate displays and clamp to usable bounds',()=>{
 const areas=[{x:0,y:0,width:1920,height:1080},{x:-1600,y:0,width:1600,height:900}]
 assert.deepEqual(restoreWindowBounds({x:-1500,y:20,width:1280,height:800},areas),{x:-1500,y:20,width:1280,height:800})
 assert.equal(restoreWindowBounds({x:10000,y:0,width:1280,height:800},areas),undefined)
 const edge=restoreWindowBounds({x:-1700,y:100,width:1700,height:1000},areas)
 assert.deepEqual(edge,{x:-1600,y:0,width:1600,height:900})
})
test('source retention is explicit and old WAV settings preserve default behavior',()=>{
 const old={encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'}
 assert.deepEqual(validateRecordSettings(old),old)
 assert.equal(validateRecordSettings({...old,keepOriginal:false}).keepOriginal,false)
 assert.equal(validateRecordSettings({format:'mp3',sampleRate:48000,bitrate:192,namePrefix:'Trace',keepOriginal:false}).keepOriginal,false)
 assert.throws(()=>validateRecordSettings({...old,keepOriginal:'no'}))
})
