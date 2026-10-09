// The default/strict tier uses only the pinned Windows codec. Explicit Linux
// fixture checks are auxiliary and never satisfy TRACE_REQUIRE_NATIVE.
import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,createReadStream,writeFileSync,readFileSync} from 'node:fs'
import {mkdir,mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const compiled=resolve('artifacts/file-faults/codec')
await build({entryPoints:['src/trace/importMedia.ts','src/trace/file-worker.ts','src/trace/media-runner.ts'],outdir:compiled,bundle:true,platform:'node',format:'cjs'})
const {decodeImport,readImportedPCM,removeImportedPCM}=(await import(pathToFileURL(join(compiled,'importMedia.js')))).default
const system=process.env.TRACE_TEST_SYSTEM_CODEC==='1'&&process.platform!=='win32'
if(system&&process.env.TRACE_REQUIRE_NATIVE==='1')throw Error('SYSTEM_CODEC_IS_NOT_LOCKED_WINDOWS_EVIDENCE')
const ffmpeg=system?'/usr/bin/ffmpeg':resolve('.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe=system?'/usr/bin/ffprobe':resolve('.tools/ffmpeg/bin/ffprobe.exe')
const ready=(system||process.platform==='win32')&&existsSync(ffmpeg)&&existsSync(ffprobe)
if(!ready&&process.env.TRACE_REQUIRE_NATIVE==='1')throw Error('LOCKED_CODEC_REQUIRED')
async function hash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
const tools=ready?{ffmpeg,ffprobe,nativePath:'unused',ffmpegSha256:await hash(ffmpeg),ffprobeSha256:await hash(ffprobe)}:undefined
if(ready&&!system){const lock=JSON.parse(readFileSync('ffmpeg.lock.json','utf8'));assert.equal(tools.ffmpegSha256,lock.ffmpegSha256);assert.equal(tools.ffprobeSha256,lock.ffprobeSha256)}
const options={skip:!ready,timeout:120000},capacity=async()=>10000000000n
function run(args){const p=spawnSync(ffmpeg,['-v','error',...args],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(p.status,0,p.error?.message||p.stderr)}
function wave(file,frames=12000,rate=48000,channels=2){
 const b=Buffer.alloc(44+frames*channels*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*channels*2,40)
 for(let n=0;n<frames;n++)for(let c=0;c<channels;c++)b.writeInt16LE(Math.round(8000*Math.sin(n/(c?13:8))),44+(n*channels+c)*2)
 writeFileSync(file,b)
}
async function setup(t){const root=await mkdtemp(join(tmpdir(),"Trace 故障 ' -")),source=join(root,'source.wav'),cache=join(root,'cache');t.after(()=>rm(root,{recursive:true,force:true}));wave(source);return {root,source,cache}}
async function intact(source,before,cache){assert.deepEqual(await readFile(source),before);assert.deepEqual(await readdir(cache),[])}
test('real imports reject broken containers, truncated PCM and corrupt AAC/MP3 without publishing PCM',options,async t=>{
 const {root,source,cache}=await setup(t),fixtures=[['bad.wav',Buffer.from('RIFF incomplete')],['truncated.wav',readFileSync(source).subarray(0,24044)],['empty.wav',Buffer.alloc(44)]]
 for(const [ext,codec]of [['mp3','libmp3lame'],['aac','aac'],['m4a','aac']]){
  const file=join(root,'good.'+ext);run(['-f','wav','-i',source,'-c:a',codec,file]);const bytes=readFileSync(file);let offset=Math.floor(bytes.length/3)
  fixtures.push(['truncated.'+ext,bytes.subarray(0,Math.floor(bytes.length/2))])
  if(ext==='mp3'){
   const p=spawnSync(ffprobe,['-v','error','-select_streams','a:0','-read_intervals','%+#3','-show_packets','-show_entries','packet=pos','-of','json',file],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(p.status,0,p.stderr);offset=Number(JSON.parse(p.stdout).packets[1].pos)
  }
  if(ext!=='m4a')fixtures.push(['corrupt.'+ext,Buffer.concat([bytes.subarray(0,offset),Buffer.alloc(ext==='mp3'?4:100,255),bytes.subarray(offset+(ext==='mp3'?4:100))])])
 }
 for(const [name,bytes]of fixtures){const file=join(root,name);await writeFile(file,bytes);await assert.rejects(decodeImport(tools,file,cache,{capacity}),undefined,name);await intact(file,bytes,cache)}
 const imported=await decodeImport(tools,source,cache,{capacity});assert.equal(imported.frames,'12000');await removeImportedPCM(cache,imported.directory);assert.deepEqual(await readdir(cache),[])
})
test('MP3 declared packet counts reject lost audio even when trailing metadata restores file size',options,async t=>{
 const {root,source,cache}=await setup(t),mp3=join(root,'tagged.mp3');run(['-f','wav','-i',source,'-c:a','libmp3lame',mp3])
 const b=readFileSync(mp3);await writeFile(mp3,Buffer.concat([b.subarray(0,Math.floor(b.length/2)),Buffer.alloc(b.length-Math.floor(b.length/2))]))
 const before=await readFile(mp3);await assert.rejects(decodeImport(tools,mp3,cache,{capacity}),/IMPORT_MP3_FRAME_MISMATCH/);await intact(mp3,before,cache)
})
test('MP3 without Xing remains supported with decoded-content bounds, not invented exact duration',options,async t=>{
 const {root,source,cache}=await setup(t),mp3=join(root,'no-xing.mp3');run(['-f','wav','-i',source,'-c:a','libmp3lame','-write_xing','0',mp3])
 const before=await readFile(mp3),imported=await decodeImport(tools,mp3,cache,{capacity});assert(BigInt(imported.frames)>0n);assert.deepEqual(await readFile(mp3),before);await removeImportedPCM(cache,imported.directory)
})
test('capacity rejection and invalid segmentation leave no owned cache and allow a healthy retry',options,async t=>{
 const {source,cache}=await setup(t),before=await readFile(source)
 await assert.rejects(decodeImport(tools,source,cache,{capacity:async()=>0n}),/IMPORT_INSUFFICIENT_SPACE/);await intact(source,before,cache)
 await assert.rejects(decodeImport(tools,source,cache,{capacity,segmentBytes:1}),/INVALID_MEDIA_SEGMENT_LIMIT/);await intact(source,before,cache)
 const imported=await decodeImport(tools,source,cache,{capacity});assert.equal(imported.frames,'12000');await removeImportedPCM(cache,imported.directory)
})
test('cancellation after real decoding removes all partial segments before rejecting',options,async t=>{
 const {source,cache}=await setup(t),before=await readFile(source),controller=new AbortController();let verified=false
 await assert.rejects(decodeImport(tools,source,cache,{capacity,segmentBytes:8192,signal:controller.signal,progress:p=>{if(p.phase==='verifying'){verified=true;controller.abort()}}}),/CANCELLED/)
 assert(verified);await intact(source,before,cache)
 const imported=await decodeImport(tools,source,cache,{capacity});assert.equal(imported.frames,'12000');await removeImportedPCM(cache,imported.directory)
})
test('source replacement during verification fails and preserves the caller changed original',options,async t=>{
 const {source,cache}=await setup(t),changed=readFileSync(source);changed[44]^=1
 await assert.rejects(decodeImport(tools,source,cache,{capacity,progress:p=>{if(p.phase==='verifying')writeFileSync(source,changed)}}),/IMPORT_SOURCE_CHANGED/)
 await intact(source,changed,cache)
})
test('persisted real PCM rejects changed bytes, missing segments and forged frame totals',options,async t=>{
 const {source,cache}=await setup(t),imported=await decodeImport(tools,source,cache,{capacity,segmentBytes:8192})
 assert(imported.files.length>1);assert.equal((await readImportedPCM(cache,imported.id,imported.source.sha256)).frames,imported.frames)
 const part=join(imported.directory,imported.files[0].file),original=await readFile(part),modified=Buffer.from(original);modified[modified.length-1]^=1;await writeFile(part,modified)
 await assert.rejects(readImportedPCM(cache,imported.id,imported.source.sha256),/IMPORT_DECODED_CACHE_CHANGED/);await writeFile(part,original)
 await rm(part);await assert.rejects(readImportedPCM(cache,imported.id,imported.source.sha256),/ENOENT/);await writeFile(part,original)
 const metadata=join(imported.directory,'decoded.json'),document=JSON.parse(await readFile(metadata,'utf8'));document.files[0].frames=String(BigInt(document.files[0].frames)+1n);await writeFile(metadata,JSON.stringify(document))
 await assert.rejects(readImportedPCM(cache,imported.id,imported.source.sha256),/IMPORT_CACHE_FRAME_MISMATCH/);await removeImportedPCM(cache,imported.directory)
})
test('cleanup preserves unknown files and refuses changed owner identity',options,async t=>{
 const {source,cache}=await setup(t),imported=await decodeImport(tools,source,cache,{capacity}),keep=join(imported.directory,'personal.txt');await writeFile(keep,'caller owned')
 await assert.rejects(removeImportedPCM(cache,imported.directory),/IMPORT_CACHE_HAS_UNKNOWN_FILES/);assert.equal(await readFile(keep,'utf8'),'caller owned');await rm(keep)
 const marker=join(imported.directory,'owner.json'),owner=await readFile(marker);await writeFile(marker,JSON.stringify({product:'Other',version:1,id:imported.id}))
 await assert.rejects(removeImportedPCM(cache,imported.directory),/INVALID_IMPORT_CACHE_OWNER/);assert(existsSync(join(imported.directory,imported.files[0].file)));await writeFile(marker,owner);await removeImportedPCM(cache,imported.directory)
})

test('real CBR/VBR MP3 imports retain decoder-declared frames at MPEG-1/2/2.5 rates and both channel modes',options,async t=>{
 const {root,cache}=await setup(t),matrix=[]
 for(const rate of [8000,16000,44100,48000])for(const channels of [1,2])for(const mode of ['cbr','vbr']){
  const frames=rate/5+137,input=join(root,`${rate}-${channels}-${mode}.wav`),file=input+'.mp3';wave(input,frames,rate,channels)
  run(['-f','wav','-i',input,'-c:a','libmp3lame',...(mode==='vbr'?['-q:a','2']:['-b:a',rate<32000?'32k':'192k']),file])
  const p=spawnSync(ffprobe,['-v','error','-select_streams','a:0','-show_packets','-show_streams','-show_entries','packet=duration:packet_side_data=skip_samples,discard_padding:stream=time_base','-of','json',file],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(p.status,0,p.stderr)
  const metadata=JSON.parse(p.stdout),[numerator,denominator]=metadata.streams[0].time_base.split('/').map(BigInt)
  let declared=0n;for(const packet of metadata.packets){const samples=BigInt(packet.duration)*numerator*BigInt(rate);assert.equal(samples%denominator,0n);declared+=samples/denominator;for(const side of packet.side_data_list||[])declared-=BigInt(side.skip_samples||0)+BigInt(side.discard_padding||0)}
  const before=await readFile(file),imported=await decodeImport(tools,file,cache,{capacity});assert.equal(imported.frames,String(declared));assert.equal(imported.format.sampleRate,rate);assert.equal(imported.format.channelCount,channels);assert.deepEqual(await readFile(file),before);await removeImportedPCM(cache,imported.directory)
  matrix.push({rate,channels,mode,inputFrames:frames,declaredDecodedFrames:String(declared),importedFrames:imported.frames})
 }
 assert.deepEqual(await readdir(cache),[]);console.log('TRACE_MP3_IMPORT_MATRIX',JSON.stringify({ffmpegSha256:tools.ffmpegSha256,matrix,scope:'Generated external files; decoder metadata governs frames, not a claim of bit-exact encoder roundtrip'}))
})
