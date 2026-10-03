// Run the locked Windows executables, independently of simulated media ops.
import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,mkdtempSync,writeFileSync,readFileSync,createReadStream} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const compiled=resolve('artifacts/release-security/codec-production')
await build({entryPoints:['src/trace/wavInput.ts','src/trace/importMedia.ts','src/trace/mediaTasks.ts','src/trace/file-worker.ts','src/trace/media-runner.ts'],outdir:compiled,bundle:true,platform:'node',format:'cjs'})
const {wavInputOptions}=(await import(pathToFileURL(join(compiled,'wavInput.js')))).default
const {probeImport,decodeImport}=(await import(pathToFileURL(join(compiled,'importMedia.js')))).default
const {encodeMedia}=(await import(pathToFileURL(join(compiled,'mediaTasks.js')))).default
const lock=JSON.parse(readFileSync(new URL('../ffmpeg.lock.json',import.meta.url),'utf8'))
const ffmpeg=resolve('.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe=resolve('.tools/ffmpeg/bin/ffprobe.exe')
const ready=process.platform==='win32'&&existsSync(ffmpeg)&&existsSync(ffprobe)
if(!ready&&process.env.TRACE_REQUIRE_NATIVE==='1')throw Error('LOCKED_CODEC_REQUIRED')
const options={skip:!ready,timeout:60000}
function run(program,args){const r=spawnSync(program,args,{encoding:'utf8',maxBuffer:4*1024*1024,timeout:30000,windowsHide:true});assert.equal(r.status,0,r.error?.message||r.stderr);return r.stdout}
async function hash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
test('locked FFmpeg and ffprobe hashes, versions, configuration and required encoders actually load',options,async()=>{
 assert.equal(await hash(ffmpeg),lock.ffmpegSha256);assert.equal(await hash(ffprobe),lock.ffprobeSha256)
 for(const program of [ffmpeg,ffprobe]){const version=run(program,['-version']);assert(version.includes('version '+lock.version));assert(version.includes(lock.configuration))}
 const encoders=run(ffmpeg,['-hide_banner','-encoders'])
 for(const encoder of lock.requiredEncoders)assert(new RegExp('\\b'+encoder+'\\b').test(encoders),encoder)
})
function fixture(file){
 const frames=96000,channels=2,rate=48000,bytes=Buffer.alloc(44+frames*channels*2)
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(channels,22)
 bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*channels*2,28);bytes.writeUInt16LE(channels*2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*channels*2,40)
 for(let n=0;n<frames;n++)for(let c=0;c<channels;c++)bytes.writeInt16LE(Math.round(8191*Math.sin(2*Math.PI*(c?500:1000)*n/rate)),44+(n*channels+c)*2)
 writeFileSync(file,bytes);return frames
}
function decodedWave(file){
 const b=readFileSync(file);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE')
 let data,format
 for(let o=12;o+8<=b.length;){const n=b.readUInt32LE(o+4),tag=b.toString('ascii',o,o+4);assert(o+8+n<=b.length);if(tag==='fmt ')format=b.subarray(o+8,o+8+n);if(tag==='data')data=b.subarray(o+8,o+8+n);o+=8+n+(n&1)}
 assert(format&&data);assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(2),2);assert.equal(format.readUInt32LE(4),48000);assert.equal(format.readUInt16LE(14),16)
 const frames=data.length/4;assert(Number.isInteger(frames));let power=0
 for(let o=0;o<data.length;o+=2)power+=(data.readInt16LE(o)/32768)**2
 const rms=Math.sqrt(power/(data.length/2));assert(rms>.16&&rms<.19,'decoded signal level '+rms)
 return frames
}
for(const [format,encoder,codec,extension]of [['WAV','pcm_s24le','pcm_s24le','wav'],['MP3','libmp3lame','mp3','mp3'],['AAC','aac','aac','m4a']]){
 test('locked '+format+' encoder/probe/decode roundtrip preserves stereo rate, duration and signal',options,async()=>{
  const dir=mkdtempSync(join(tmpdir(),'trace-codec-')),input=join(dir,'输入 signal.wav'),output=join(dir,'output.'+extension),decoded=join(dir,'decoded.wav'),frames=fixture(input)
  run(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-n',...await wavInputOptions(input),'-i',input,'-map','0:a:0','-vn','-threads','1','-c:a',encoder,...(format==='WAV'?[]:['-b:a','192k']),output])
  const probe=JSON.parse(run(ffprobe,['-v','error',...await wavInputOptions(output),'-show_streams','-show_format','-of','json',output])),audio=probe.streams.filter(s=>s.codec_type==='audio')
  assert.equal(audio.length,1);assert.equal(audio[0].codec_name,codec);assert.equal(Number(audio[0].sample_rate),48000);assert.equal(audio[0].channels,2)
  assert(Math.abs(Number(probe.format.duration)-2)<.1)
  run(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-n',...await wavInputOptions(output),'-i',output,'-map','0:a:0','-c:a','pcm_s16le',decoded])
  const actual=decodedWave(decoded)
  if(format==='AAC')assert(actual>=frames&&actual<=frames+2048,'AAC physical padding exceeds two codec blocks')
  else assert.equal(actual,frames)
 })
}
test('production import and three-format export preserve the unchanged periodic WAV across decoded segments',options,async()=>{
 const dir=mkdtempSync(join(tmpdir(),'trace-codec-production-')),input=join(dir,"输入 ' signal.wav"),frames=fixture(input)
 const tools={ffmpeg,ffprobe,nativePath:resolve('build/trace-engine/Release/trace_engine.node'),ffmpegSha256:await hash(ffmpeg),ffprobeSha256:await hash(ffprobe)}
 const metadata=await probeImport(tools,input)
 assert.equal(metadata.container,'wav');assert.equal(metadata.exactFrames,String(frames));assert.equal(metadata.format.sampleRate,48000);assert.equal(metadata.format.channelCount,2)
 const imported=await decodeImport(tools,input,join(dir,'cache'),{capacity:async()=>10000000000n,segmentBytes:8192})
 assert.equal(imported.frames,String(frames));assert(imported.files.length>1)
 const sources=imported.files.map(file=>join(imported.directory,file.file))
 for(const preset of [{format:'wav',encoding:'float32',sampleRate:48000},{format:'mp3',bitrate:192,sampleRate:48000},{format:'aac',container:'m4a',bitrate:192,sampleRate:48000},{format:'aac',container:'adts',bitrate:192,sampleRate:48000}]){
  const result=await encodeMedia(tools,{sources,sampleRate:48000,channelCount:2,frames:String(frames)},preset,join(dir,preset.format+(preset.container?'-'+preset.container:'')))
  assert.equal(result.frames,String(frames));assert.equal(result.sampleRate,48000);assert.equal(result.channelCount,2)
  assert.equal(result.decoded.reduce((n,file)=>n+BigInt(file.frames),0n),BigInt(result.decodeRecipe.physicalFrames))
  assert.equal(BigInt(result.decodeRecipe.physicalFrames)-BigInt(result.decodeRecipe.startFrame)-BigInt(result.decodeRecipe.endPaddingFrames),BigInt(frames))
 }
})
