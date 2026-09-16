const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','core-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const api=path.join(folder,'media-api.cjs');require('esbuild').buildSync({entryPoints:[path.join(root,'src/trace/mediaTasks.ts')],outfile:api,platform:'node',format:'cjs',bundle:true})
require('esbuild').buildSync({entryPoints:[path.join(root,'src/trace/file-worker.ts')],outfile:path.join(folder,'file-worker.js'),platform:'node',format:'cjs',bundle:true})
require('esbuild').buildSync({entryPoints:[path.join(root,'src/trace/media-runner.ts')],outfile:path.join(folder,'media-runner.js'),platform:'node',format:'cjs',bundle:true})
const {encodeMedia}=require(api),lock=require(path.join(root,'ffmpeg.lock.json'))
const tools={ffmpeg:path.join(root,'.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe:path.join(root,'.tools/ffmpeg/bin/ffprobe.exe'),nativePath:path.join(root,'build/trace-engine/Release/trace_engine.node'),ffmpegSha256:lock.ffmpegSha256,ffprobeSha256:lock.ffprobeSha256}
function wave(file,channels,first,count){
 const rate=96000,out=Buffer.alloc(58+count*channels*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(18,16);out.writeUInt16LE(3,20);out.writeUInt16LE(channels,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*channels*4,28);out.writeUInt16LE(channels*4,32);out.writeUInt16LE(32,34);out.write('fact',38);out.writeUInt32LE(4,42);out.writeUInt32LE(count,46);out.write('data',50);out.writeUInt32LE(count*channels*4,54)
 for(let f=0;f<count;f++)for(let c=0;c<channels;c++){const t=(first+f)/rate;out.writeFloatLE(.1*Math.sin(2*Math.PI*((300+c*97)*t+(1700+c*271)*t*t)),58+(f*channels+c)*4)}fs.writeFileSync(file,out)
}
const report={status:'running',folder,checks:[],results:[]}
async function main(){
 for(const channels of [1,2]){
  const first=path.join(folder,'source-'+channels+'-1.wav'),second=path.join(folder,'source-'+channels+'-2.wav'),frames=96137
  wave(first,channels,0,1337);wave(second,channels,1337,frames-1337)
  const input={sources:[first,second],sampleRate:96000,channelCount:channels,frames:String(frames),range:{startFrame:'1234',endFrame:'95613'}}
  for(const sampleRate of [44100,48000])for(const [variant,bitrate] of [['pcm16',0],['pcm24',0],['float32',0],...[128,192,256,320].map(b=>['mp3',b]),...[128,192,256].flatMap(b=>[['m4a',b],['adts',b]])]){
   const preset=['pcm16','pcm24','float32'].includes(variant)?{format:'wav',sampleRate,encoding:variant}:variant==='mp3'?{format:'mp3',sampleRate,bitrate}:{format:'aac',sampleRate,bitrate,container:variant}
   const output=path.join(folder,'output-'+channels+'-'+sampleRate+'-'+variant+'-'+bitrate),events=[]
   const result=await encodeMedia(tools,input,preset,output,{progress:p=>events.push(p),segmentBytes:variant==='float32'?65536:undefined})
   assert.equal(result.sampleRate,sampleRate);assert.equal(result.channelCount,channels)
   const expected=(95613n-1234n)*BigInt(sampleRate)/96000n
   assert(BigInt(result.frames)>=expected&&BigInt(result.frames)<=expected+1n)
   assert.equal(BigInt(result.decodeRecipe.frames),BigInt(result.frames))
   assert.equal(result.decodeRecipe.containerTrimmed,variant!=='adts')
   assert.equal(BigInt(result.decodeRecipe.physicalFrames),result.decoded.reduce((n,f)=>n+BigInt(f.frames),0n))
   if(variant==='adts'){assert.equal(result.decodeRecipe.encoderDelayFrames,'1024');assert(BigInt(result.decodeRecipe.endPaddingFrames)<1024n)}
   else assert.equal(result.decodeRecipe.physicalFrames,result.frames)
   assert(events.some(e=>e.phase==='normalizing')&&events.some(e=>e.phase==='verifying'))
   assert(result.files.every(f=>fs.existsSync(f.path)&&f.sha256.length===64))
   report.results.push({channels,sampleRate,variant,bitrate,frames:result.frames,files:result.files.length,decodedFiles:result.decoded.length,recipe:result.decodeRecipe,actualBitrate:result.actualBitrate})
   report.checks.push(channels+'ch '+sampleRate+' '+variant+' '+bitrate);console.log('M5_CODEC_CASE',channels,sampleRate,variant,'PASS')
  }
  const controller=new AbortController()
  await assert.rejects(encodeMedia(tools,input,{format:'mp3',sampleRate:48000,bitrate:192},path.join(folder,'cancel-'+channels),{signal:controller.signal,progress:p=>{if(p.phase==='encoding')controller.abort()}}),/CANCELLED/)
  const before=crypto.createHash('sha256').update(fs.readFileSync(first)).digest('hex')
  await assert.rejects(encodeMedia({...tools,ffmpegSha256:'0'.repeat(64)},input,{format:'mp3',sampleRate:48000,bitrate:192},path.join(folder,'wrong-encoder-'+channels)),/ENCODER_BUILD_CHANGED/)
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(first)).digest('hex'),before)
 }
 report.checks.push('Cancellation prevents decoder/publication','Changed encoder build is rejected without touching source');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);process.exitCode=1}).finally(()=>{
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m5/core-latest.json'),JSON.stringify(report,null,2));console.log('M5_CORE',report.status,report.checks.length)
})
