import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m5',{recursive:true})
await build({entryPoints:['src/trace/recordSettings.ts'],outfile:'artifacts/m5/settings.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/contracts.ts'],outfile:'artifacts/m5/contracts.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/mediaTasks.ts'],outfile:'artifacts/m5/media-frames.cjs',platform:'node',format:'cjs',bundle:true})
const {validateRecordSettings,recordingEncoding}=(await import(pathToFileURL(resolve('artifacts/m5/settings.cjs')))).default
const {validateRequest}=(await import(pathToFileURL(resolve('artifacts/m5/contracts.cjs')))).default
const {encodedPaddingFrames,aacPrimingFrames}=(await import(pathToFileURL(resolve('artifacts/m5/media-frames.cjs')))).default
test('compressed recording presets keep legal rates/bitrates and native float source',()=>{
 for(const sampleRate of [44100,48000])for(const bitrate of [128,192,256,320]){
  const preset=validateRecordSettings({format:'mp3',sampleRate,bitrate,namePrefix:'Trace'})
  assert.equal(preset.bitrate,bitrate);assert.equal(recordingEncoding(preset,96000),'float32');assert.equal(recordingEncoding(preset,48000),'float32')
 }
 for(const container of ['m4a','adts'])for(const bitrate of [128,192,256])assert.equal(validateRecordSettings({format:'aac',container,bitrate,sampleRate:44100,namePrefix:'Trace'}).container,container)
 for(const value of [{format:'mp3',sampleRate:96000,bitrate:192},{format:'aac',container:'m4a',sampleRate:48000,bitrate:320},{format:'mp3',sampleRate:48000,bitrate:192,encoding:'pcm24'}])assert.throws(()=>validateRecordSettings({...value,namePrefix:'Trace'}))
 assert.deepEqual(validateRecordSettings({encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'}),{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'})
})
test('export commands accept only owned source IDs and legal ranges/presets',()=>{
 const req=(command,payload)=>({protocolVersion:1,requestId:'test',expectedStateRevision:0,command,payload})
 assert.equal(validateRequest(req('export.start',{takeId:'take',role:'source',preset:{format:'mp3',sampleRate:48000,bitrate:192}})).command,'export.start')
 for(const payload of [{takeId:'take',role:'export',preset:{format:'mp3',sampleRate:48000,bitrate:192}},{takeId:'take',role:'source',path:'private.wav',preset:{format:'mp3',sampleRate:48000,bitrate:192}},{takeId:'take',role:'source',range:{startFrame:'1',endFrame:'1'},preset:{format:'wav',encoding:'pcm24',sampleRate:48000}}])assert.throws(()=>validateRequest(req('export.start',payload)))
 assert.equal(validateRequest(req('file.open',{takeId:'take',role:'export',exportId:'owned'})).payload.exportId,'owned')
 assert.throws(()=>validateRequest(req('export.saveCopy',{exportId:'owned',target:'private.wav'})))
})
test('AAC tail blocks require exact container duration and never alter audible frames or MP3 rules',()=>{
 const metadata={time_base:'1/48000',duration_ts:96000},check=(physical,info=metadata)=>encodedPaddingFrames('aac','m4a',48000,96000n,physical,0n,info)
 assert.equal(check(96256n),256n);assert.equal(check(96000n),0n)
 for(const physical of [95999n,97024n,98048n])assert.throws(()=>check(physical),/DECODED_FRAME_MISMATCH/)
 for(const info of [{},{...metadata,time_base:'1/44100'},{...metadata,duration_ts:95999},{...metadata,duration_ts:9007199254740992}])assert.throws(()=>check(96256n,info),/CONTAINER_FRAME_MISMATCH/)
 assert.throws(()=>encodedPaddingFrames('mp3','mp3',48000,96000n,96001n,0n,{}),/DECODED_FRAME_MISMATCH/)
 assert.equal(encodedPaddingFrames('aac','adts',48000,96000n,97280n,1024n,{}),256n)
})
test('ADTS priming comes from the encoded packet and rejects missing or conflicting timing',()=>{
 const packet={pts:-1024,duration:1024,side_data_list:[{side_data_type:'Skip Samples',skip_samples:1024,discard_padding:0}]},value={packets:[packet]}
 assert.equal(aacPrimingFrames(value,0),1024);assert.equal(aacPrimingFrames(value,1024),1024)
 for(const invalid of [null,{},{packets:[]},{packets:{length:1,0:packet}},{packets:[packet,packet]},{packets:[{...packet,pts:0}]},{packets:[{...packet,duration:2048}]},{packets:[{...packet,side_data_list:[]}]},{packets:[{...packet,side_data_list:[{...packet.side_data_list[0],skip_samples:0}]}]}])assert.throws(()=>aacPrimingFrames(invalid,0),/PRIMING_UNAVAILABLE/)
 assert.throws(()=>aacPrimingFrames(value,512),/PRIMING_UNAVAILABLE/)
})
