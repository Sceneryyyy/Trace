const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),os=require('os')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m4','native-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
const modulePath=path.join(root,'build/trace-engine/Release/trace_engine.node'),native=require(modulePath)
const report={status:'running',folder,kind:'real-WASAPI-output-with-synthetic-low-level-wave-files',windows:os.release(),nativeSha256:crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),checks:[],cases:[]}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(fn,label,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){const s=native.playbackSnapshot();if(s.error)throw Error(s.error);const result=fn(s);if(result)return result;await delay(3)}throw Error('Timeout '+label)}
function writeWave(file,rate,channels,start,frames){
 const data=Buffer.alloc(58+frames*channels*4);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(18,16)
 data.writeUInt16LE(3,20);data.writeUInt16LE(channels,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*channels*4,28);data.writeUInt16LE(channels*4,32);data.writeUInt16LE(32,34)
 data.write('fact',38);data.writeUInt32LE(4,42);data.writeUInt32LE(frames,46);data.write('data',50);data.writeUInt32LE(frames*channels*4,54)
 for(let f=0;f<frames;f++)for(let c=0;c<channels;c++)data.writeFloatLE(.03*Math.sin(2*Math.PI*(c?1499:997)*(start+f)/rate),58+(f*channels+c)*4)
 fs.writeFileSync(file,data)
}
const check=(value,label)=>{assert(value,label);report.checks.push(label)}
async function main(){
 const devices=native.devices(),device=devices.find(d=>d.supported&&/Realtek/i.test(d.label))||devices.find(d=>d.supported&&d.isDefault)
 assert(device,'No supported output device');report.device=device
 native.playbackVolume(.25)
 for(const rate of [44100,48000,96000])for(const channels of [1,2]){
  const first=path.join(folder,rate+'-'+channels+'-1.wav'),second=path.join(folder,rate+'-'+channels+'-2.wav'),total=rate*2
  writeWave(first,rate,channels,0,Math.floor(rate*.7));writeWave(second,rate,channels,Math.floor(rate*.7),total-Math.floor(rate*.7))
  const opened=await native.playbackOpen(rate+'-'+channels,[first,second],device.id)
  assert.equal(opened.totalFrames,String(total));assert.equal(opened.format.sampleRate,rate);assert.equal(opened.format.channelCount,channels)
  const paused=await wait(s=>s.phase==='paused'&&s.generation!=='0'?s:null,'paused open')
  assert.equal(paused.positionFrame,'0');assert(paused.outputRate>0&&BigInt(paused.clockFrequency)>0n)
  native.playbackPlay();await wait(s=>s.playing&&BigInt(s.positionFrame)>0n,'actual device clock')
  const samples=[];const begin=Date.now()
  while(Date.now()-begin<120){
   const s=native.playbackSnapshot();if(s.error)throw Error(s.error)
   const presented=BigInt(s.clockPosition)*BigInt(rate)/BigInt(s.clockFrequency)
   assert.equal(BigInt(s.positionFrame),presented)
   assert(presented<=BigInt(s.submittedFrames));assert(s.queueDepth<=64)
   samples.push(s);await delay(5)
  }
  native.playbackPause();const frozen=await wait(s=>s.phase==='paused'?s:null,'pause')
  await delay(80);assert.equal(native.playbackSnapshot().positionFrame,frozen.positionFrame)
  let generation,position
  for(let i=0;i<50;i++){position=(i*7919)%total;generation=native.playbackSeek(String(position),false,false,'0','0')}
  const sought=await wait(s=>s.generation===generation&&s.positionFrame===String(position)&&s.phase==='paused'?s:null,'latest seek')
  assert.equal(sought.presentedStreamFrames,'0')
  const a=Math.floor(rate/10),b=a+Math.floor(rate/100)
  generation=native.playbackSeek(String(a),true,true,String(a),String(b))
  const loop=await wait(s=>s.generation===generation&&BigInt(s.loops)>=10n?s:null,'ten exact selection loops')
  assert(BigInt(loop.positionFrame)>=BigInt(a)&&BigInt(loop.positionFrame)<BigInt(b))
  const expected=BigInt(a)+BigInt(loop.presentedStreamFrames)%BigInt(b-a);assert.equal(BigInt(loop.positionFrame),expected)
  native.playbackVolume(0);await delay(25);assert(native.playbackSnapshot().playing);native.playbackVolume(.25)
  generation=native.playbackSeek(String(total-Math.floor(rate/20)),true,false,'0','0')
  const ended=await wait(s=>s.generation===generation&&s.phase==='ended'?s:null,'EOF heard')
  assert.equal(ended.positionFrame,String(total));assert.equal(ended.submittedFrames,String(Math.floor(rate/20)))
  assert(!ended.playing)
  report.cases.push({rate,channels,outputRate:paused.outputRate,rawModeApplied:paused.rawModeApplied,clockFrequency:paused.clockFrequency,bufferFrames:paused.bufferFrames,pauseFrame:frozen.positionFrame,seekGeneration:generation,loopCount:loop.loops,samples})
  check(true,rate+' Hz '+channels+'ch: clock, pause, 50 seeks, 10 loops, gain and EOF')
  await native.playbackClose();assert.equal(native.playbackSnapshot().phase,'idle')
 }
 assert.throws(()=>native.playbackSeek('-1',false,false,'0','0'));assert.throws(()=>native.playbackVolume(NaN))
 check(true,'Invalid frames and monitor gain are rejected')
 const cancellationFile=path.join(folder,'48000-2-1.wav')
 for(let i=0;i<8;i++){
  const opening=native.playbackOpen('cancel-'+i,[cancellationFile],device.id).catch(error=>{assert.match(String(error),/PLAYBACK_OPEN_CANCELLED/);return null})
  await native.playbackClose();await opening;assert.equal(native.playbackSnapshot().phase,'idle')
 }
 check(true,'Close invalidates pending asynchronous open operations')
 await native.playbackOpen('shared-mode-control',[cancellationFile],device.id,false)
 const shared=await wait(s=>s.phase==='paused'?s:null,'standard shared open');assert.equal(shared.rawModeApplied,false)
 native.playbackPlay();await wait(s=>s.playing&&BigInt(s.positionFrame)>0n,'standard shared play');await native.playbackClose()
 check(true,'Standard shared output remains available when raw mode is not requested')
 const fault=require('child_process').spawnSync(path.join(root,'build/trace-engine/Release/trace-playback-fault-tests.exe'),[device.id,cancellationFile],{cwd:folder,encoding:'utf8',windowsHide:true,timeout:15000})
 fs.writeFileSync(path.join(folder,'output-faults.log'),(fault.stdout||'')+(fault.stderr||''));if(fault.error||fault.status!==0)throw fault.error||Error(fault.stderr)
 const faultReport=JSON.parse(fs.readFileSync(path.join(folder,'output-fault-result.json'),'utf8'))
 check(faultReport.status==='pass'&&faultReport.checks===2,'Slow decoder and nonfinite source data fail explicitly on the real output path')

 report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;report.last=native.playbackSnapshot();console.error(error);process.exitCode=1}).finally(async()=>{
 await native.playbackClose().catch(()=>{})
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m4/native-latest.json'),JSON.stringify(report,null,2))
 console.log('M4_NATIVE_OUTPUT',report.status,report.checks.length)
})
