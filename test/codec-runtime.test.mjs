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
const candidate=process.env.TRACE_CODEC_CANDIDATE==='1',folder=candidate?'.tools/trace-ffmpeg':'.tools/ffmpeg'
const report=candidate?JSON.parse(readFileSync(resolve(folder,'build-report.json'),'utf8')):undefined
const lock=candidate?{version:report.sources[0].release,ffmpegSha256:report.outputs.ffmpeg.sha256,ffprobeSha256:report.outputs.ffprobe.sha256,configuration:report.configuration,requiredEncoders:['aac','libmp3lame','pcm_s16le','pcm_s24le','pcm_f32le']}:JSON.parse(readFileSync(new URL('../ffmpeg.lock.json',import.meta.url),'utf8'))
const ffmpeg=resolve(folder,'bin/ffmpeg.exe'),ffprobe=resolve(folder,'bin/ffprobe.exe')
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
test('Trace source codec exposes only local file/pipe protocols and the pinned external encoder',options,()=>{
 if(!candidate&&lock.build!=='Trace source build')return
 const protocols=run(ffmpeg,['-v','error','-protocols']).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!['Supported file protocols:','Input:','Output:'].includes(s))
 assert.deepEqual([...new Set(protocols)].sort(),['file','pipe'])
 const external=readFileSync(resolve(folder,'config.h'),'utf8').split(/\r?\n/).filter(s=>/^#define CONFIG_LIB[A-Z0-9_]+ 1$/.test(s))
 assert.deepEqual(external,['#define CONFIG_LIBMP3LAME 1'])
})
function fixture(file,rate=48000,channels=2,frames=96000){
 const bytes=Buffer.alloc(44+frames*channels*2)
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
test('production WAV import retains precision, channels and exact odd frame counts at 44.1/48/96 kHz',options,async()=>{
 const dir=mkdtempSync(join(tmpdir(),'trace-codec-matrix-'))
 const tools={ffmpeg,ffprobe,nativePath:'unused',ffmpegSha256:await hash(ffmpeg),ffprobeSha256:await hash(ffprobe)}
 for(const rate of [44100,48000,96000])for(const channels of [1,2])for(const codec of ['pcm_s16le','pcm_s24le','pcm_f32le']){
  const frames=rate/10+137,source=join(dir,`${rate}-${channels}-${codec}.wav`),input=source+'.input.wav';fixture(input,rate,channels,frames)
  run(ffmpeg,['-v','error','-f','wav','-i',input,'-c:a',codec,source])
  const metadata=await probeImport(tools,source);assert.equal(metadata.exactFrames,String(frames));assert.equal(metadata.format.sampleRate,rate);assert.equal(metadata.format.channelCount,channels)
  const imported=await decodeImport(tools,source,source+'.cache',{capacity:async()=>10000000000n,segmentBytes:8192})
  assert.equal(imported.frames,String(frames));assert.equal(imported.files.reduce((n,f)=>n+BigInt(f.frames),0n),BigInt(frames))
 }
})

// Synthetic 2x2 covers: create APIC bytes directly, so the codec does not need
// image demuxers or image encoders just to retain existing audio import scope.
const covers={"PNG": "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGPUmNbEwMDAxMDAwMDAAAAO0AFEN8nKWAAAAABJRU5ErkJggg==", "JPEG": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwClRRRXQfIH/9k="}
function synchsafe(n){return Buffer.from([(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127])}
function attachCover(mp3,mime,image){
 const original=readFileSync(mp3),old=original.toString('ascii',0,3)==='ID3'?10+((original[6]<<21)|(original[7]<<14)|(original[8]<<7)|original[9]):0
 const body=Buffer.concat([Buffer.from([0]),Buffer.from(mime+'\0'),Buffer.from([3,0]),image]),header=Buffer.alloc(10);header.write('APIC');header.writeUInt32BE(body.length,4)
 const frames=Buffer.concat([header,body]);writeFileSync(mp3,Buffer.concat([Buffer.from([73,68,51,3,0,0]),synchsafe(frames.length),frames,original.subarray(old)]))
}
function box(type,data){const header=Buffer.alloc(8);header.writeUInt32BE(8+data.length);header.write(type,4);return Buffer.concat([header,data])}
function attachM4aCover(file,kind,image){
 const original=readFileSync(file),type=Buffer.alloc(8);type.writeUInt32BE(kind==='PNG'?14:13)
 const cover=box('covr',box('data',Buffer.concat([type,image])))
 function append(bytes,path){
  const items=[];let found=false
  for(let o=0;o<bytes.length;){const size=bytes.readUInt32BE(o),tag=bytes.toString('ascii',o+4,o+8);assert(size>=8&&o+size<=bytes.length)
   if(tag===path[0]){found=true;const payload=bytes.subarray(o+8,o+size),skip=tag==='meta'?4:0;items.push(box(tag,path.length===1?Buffer.concat([payload,cover]):Buffer.concat([payload.subarray(0,skip),append(payload.subarray(skip),path.slice(1))])))}else items.push(bytes.subarray(o,o+size));o+=size
  }
  assert(found,'M4A fixture metadata path missing');return Buffer.concat(items)
 }
 // Default MP4 writes moov last, so extending metadata cannot move mdat or
 // invalidate audio chunk offsets. Assert this instead of rewriting offsets.
 let last;for(let o=0;o<original.length;){last=original.toString('ascii',o+4,o+8);o+=original.readUInt32BE(o)}assert.equal(last,'moov')
 writeFileSync(file,append(original,['moov','udta','meta','ilst']))
}
test('production MP3 and M4A imports accept JPEG/PNG attached covers while retaining exact decoded audio',{...options,timeout:180000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'trace-codec-covers-')),input=join(dir,'source.wav'),frames=fixture(input)
 const tools={ffmpeg,ffprobe,nativePath:'unused',ffmpegSha256:await hash(ffmpeg),ffprobeSha256:await hash(ffprobe)}
 for(const [kind,base64]of Object.entries(covers)){
  const mp3=join(dir,kind+'.mp3'),m4a=join(dir,kind+'.m4a')
  run(ffmpeg,['-v','error','-f','wav','-i',input,'-c:a','libmp3lame','-b:a','192k',mp3]);attachCover(mp3,'image/'+(kind==='JPEG'?'jpeg':'png'),Buffer.from(base64,'base64'))
  run(ffmpeg,['-v','error','-f','wav','-i',input,'-c:a','aac','-b:a','192k',m4a]);attachM4aCover(m4a,kind,Buffer.from(base64,'base64'))
  for(const file of [mp3,m4a]){
   const raw=JSON.parse(run(ffprobe,['-v','error','-show_streams','-of','json',file]));assert.equal(raw.streams.filter(s=>s.disposition.attached_pic===1).length,1)
   const metadata=await probeImport(tools,file);assert.equal(metadata.format.channelCount,2)
   const imported=await decodeImport(tools,file,file+'.cache',{capacity:async()=>10000000000n,segmentBytes:8192})
   const actual=BigInt(imported.frames);if(file===mp3)assert.equal(actual,BigInt(frames));else assert(actual>=BigInt(frames)&&actual<BigInt(frames+1024))
  }
 }
})
test('one-minute 96 kHz stereo conversion preserves resampled frames and completes faster than playback',options,()=>{
 const dir=mkdtempSync(join(tmpdir(),'trace-codec-minute-')),input=join(dir,'minute.wav');fixture(input,96000,2,96000*60)
 const timings=[]
 for(const rate of [44100,48000])for(const [extension,encoder]of [['mp3','libmp3lame'],['m4a','aac']]){
  const output=join(dir,`${rate}.${extension}`),decoded=output+'.wav',start=performance.now()
  run(ffmpeg,['-v','error','-f','wav','-i',input,'-ar',String(rate),'-threads','1','-c:a',encoder,'-b:a','192k',output])
  run(ffmpeg,['-v','error','-i',output,'-map','0:a:0','-c:a','pcm_f32le',decoded])
  const elapsedMs=performance.now()-start,information=JSON.parse(run(ffprobe,['-v','error','-f','wav','-show_streams','-of','json',decoded])).streams[0]
  assert.equal(Number(information.sample_rate),rate);assert.equal(information.channels,2)
  const physical=BigInt(information.duration_ts),frames=BigInt(rate*60)
  if(extension==='mp3')assert.equal(physical,frames);else assert(physical>=frames&&physical<frames+1024n)
  assert(elapsedMs<60000,'offline conversion slower than source playback: '+elapsedMs+' ms')
  timings.push({rate,extension,elapsedMs:Math.round(elapsedMs),physicalFrames:String(physical),audibleFrames:String(frames)})
 }
 console.log('TRACE_CODEC_MINUTE',JSON.stringify({ffmpegSha256:lock.ffmpegSha256,sourceRate:96000,sourceFrames:5760000,channels:2,timings,scope:'Offline generated signal; not WASAPI or physical-device real-time acceptance'}))
})
