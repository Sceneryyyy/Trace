import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/iteration',{recursive:true})
const modules={}
for(const name of ['naming','capacityModel','exportPreferences']){
 const out='artifacts/iteration/'+name+'.cjs';await build({entryPoints:['src/trace/'+name+'.ts'],outfile:out,platform:'node',format:'cjs',bundle:true})
 modules[name]=(await import(pathToFileURL(resolve(out)))).default
}
test('recording names use local wall-clock fields and leave UTC metadata separate',()=>{
 const at=new Date(2026,8,16,18,2,3)
 assert.equal(modules.naming.localRecordingName('Trace',at),'Trace-2026-09-16_18-02-03')
 assert.equal(modules.naming.validateTakeName('  音效 A  '),'音效 A')
 for(const n of ['LPT1.wav','aux','bad/part','bad\\part','two?','end.'])assert.throws(()=>modules.naming.validateTakeName(n))
})
test('first WAV export inherits the source and saved presets remain explicit',()=>{
 const {initialExportPreset}=modules.exportPreferences,source={format:'wav',sampleRate:44100,channelCount:1,encoding:'pcm16'}
 assert.deepEqual(initialExportPreset(undefined,source),{format:'wav',sampleRate:44100,encoding:'pcm16'})
 const saved={format:'mp3',sampleRate:48000,bitrate:320};assert.deepEqual(initialExportPreset(saved,source),saved)
 assert.notEqual(initialExportPreset(saved,source),saved)
 assert.throws(()=>initialExportPreset({format:'mp3',sampleRate:96000,bitrate:320},source))
})
test('capacity includes temporary processing and never reports negative or invented free space',()=>{
 const {recordingCapacity}=modules.capacityModel,free=10n*1024n**3n
 const wav=recordingCapacity(free,{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'},48000,2)
 const mp3=recordingCapacity(free,{format:'mp3',sampleRate:48000,bitrate:192,namePrefix:'Trace'},48000,2)
 assert(mp3.bytesPerSecond>wav.bytesPerSecond);assert(mp3.estimatedSeconds<wav.estimatedSeconds)
 assert.equal(recordingCapacity(1n,{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'},48000,2).estimatedSeconds,0)
 assert.equal(recordingCapacity(null,{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'},48000,2).estimatedSeconds,null)
 assert.equal(wav.freeBytes,free.toString())
})
