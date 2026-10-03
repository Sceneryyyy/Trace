import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m12',{recursive:true})
await build({entryPoints:['src/trace/importMedia.ts'],outfile:'artifacts/m12/import-unit.cjs',bundle:true,platform:'node',format:'cjs'})
const {classifyImport}=(await import(pathToFileURL(resolve('artifacts/m12/import-unit.cjs')))).default
await build({entryPoints:['src/trace/wavInput.ts'],outfile:'artifacts/m12/wav-input-unit.cjs',bundle:true,platform:'node',format:'cjs'})
const {wavInputOptions}=(await import(pathToFileURL(resolve('artifacts/m12/wav-input-unit.cjs')))).default
const probe=(codec,format,extra={})=>({streams:[{codec_type:'audio',codec_name:codec,sample_rate:'48000',channels:2,...extra}],format:{format_name:format,duration:'1.25'}})
test('external formats are derived from actual stream/container metadata and keep only trustworthy WAV frame counts',()=>{
 for(const codec of ['pcm_s16le','pcm_s24le','pcm_f32le'])assert.equal(classifyImport(probe(codec,'wav',{time_base:'1/48000',duration_ts:60000})).exactFrames,'60000')
 assert.equal(classifyImport(probe('mp3','mp3')).format.format,'mp3')
 assert.equal(classifyImport(probe('aac','mov,mp4,m4a,3gp,3g2,mj2',{profile:'LC'})).container,'m4a')
 const adts=classifyImport(probe('aac','aac',{profile:'LC',duration_ts:60000}));assert.equal(adts.container,'adts');assert.equal(adts.exactFrames,undefined)
 const cover=probe('mp3','mp3');cover.streams.push({codec_type:'video',codec_name:'mjpeg',disposition:{attached_pic:1}});assert.equal(classifyImport(cover).format.format,'mp3')
})
test('ambiguous tracks, multichannel, video and unsupported PCM/AAC modes cannot be silently converted',()=>{
 const two=probe('mp3','mp3');two.streams.push(two.streams[0]);assert.throws(()=>classifyImport(two),/STREAMS/)
 for(const p of [probe('pcm_s32le','wav'),probe('toString','wav'),probe('aac','aac',{profile:'HE-AAC'}),probe('mp3','mp3',{channels:6}),probe('pcm_s16le','wav',{sample_rate:'192000'})])assert.throws(()=>classifyImport(p),/UNSUPPORTED/)
 const video=probe('aac','mov',{profile:'LC'});video.streams.push({codec_type:'video',codec_name:'h264'});assert.throws(()=>classifyImport(video),/STREAMS/)
})
test('WAV input selection uses bounded container bytes, never extensions or truncated headers',async()=>{
 const root=await mkdtemp(join(tmpdir(),'trace-wav-hint-'))
 try{
  const disguised=join(root,'audio.mp3'),fake=join(root,'fake.wav'),short=join(root,'short.wav'),rf64=join(root,'large.wav')
  const wave=Buffer.alloc(16);wave.write('RIFF');wave.write('WAVEfmt ',8)
  await writeFile(disguised,wave);await writeFile(fake,Buffer.from('ID3 unrelated audio'));await writeFile(short,wave.subarray(0,12))
  const large=Buffer.from(wave);large.write('RF64');large.write('ds64',12);await writeFile(rf64,large)
  assert.deepEqual(await wavInputOptions(disguised),['-f','wav'])
  assert.deepEqual(await wavInputOptions(fake),[]);assert.deepEqual(await wavInputOptions(short),[])
  assert.deepEqual(await wavInputOptions(rf64),['-f','wav']);large.write('junk',12);await writeFile(rf64,large);assert.deepEqual(await wavInputOptions(rf64),[])
 }finally{await rm(root,{recursive:true,force:true})}
})
