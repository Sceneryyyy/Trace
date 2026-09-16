const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m4','loopback-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const modulePath=path.join(root,'build/trace-engine/Release/trace_engine.node'),native=require(modulePath)
const report={status:'running',folder,kind:'real-digital-loopback-of-owned-synthetic-file-output',checks:[]},delay=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(fn,label){const begin=Date.now();while(Date.now()-begin<10000){const value=fn();if(value)return value;await delay(5)}throw Error('Timeout '+label)}
function marker(file){
 const rate=48000,frames=rate*2,data=Buffer.alloc(58+frames*8),values=[new Float32Array(frames),new Float32Array(frames)]
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(18,16);data.writeUInt16LE(3,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*8,28);data.writeUInt16LE(8,32);data.writeUInt16LE(32,34);data.write('fact',38);data.writeUInt32LE(4,42);data.writeUInt32LE(frames,46);data.write('data',50);data.writeUInt32LE(frames*8,54)
 let seeds=[0x12345678,0x65432101]
 for(let f=0;f<frames;f++)for(let c=0;c<2;c++){let n=seeds[c];n^=n<<13;n^=n>>>17;n^=n<<5;seeds[c]=n>>>0;const v=(n&1)?.02:-.02;data.writeFloatLE(v,58+f*8+c*4);values[c][f]=data.readFloatLE(58+f*8+c*4)}
 fs.writeFileSync(file,data);return values
}
function samples(file,channel){
 const data=fs.readFileSync(file);let at=12,offset=0,length=0
 while(at+8<=data.length){const size=data.readUInt32LE(at+4);if(data.toString('ascii',at,at+4)==='data'){offset=at+8;length=size;break}at+=8+size+size%2}
 assert(offset&&length%8===0);const out=new Float32Array(length/8)
 for(let i=0;i<out.length;i++)out[i]=data.readFloatLE(offset+i*8+channel*4)
 return out
}
function match(captured,reference,start){
 const length=2048,step=4,count=length/step;let sumT=0,sumTT=0
 for(let i=0;i<length;i+=step){const t=reference[start+i];sumT+=t;sumTT+=t*t}
 const energyT=sumTT-sumT*sumT/count
 let best={frame:0,correlation:-1}
 for(let offset=0;offset+length<=captured.length;offset++){
  let sumX=0,sumXX=0,sumXT=0
  for(let i=0;i<length;i+=step){const x=captured[offset+i],t=reference[start+i];sumX+=x;sumXX+=x*x;sumXT+=x*t}
  const energyX=sumXX-sumX*sumX/count,correlation=energyX>0?(sumXT-sumX*sumT/count)/Math.sqrt(energyX*energyT):0
  if(correlation>best.correlation)best={frame:offset,correlation,gain:(sumXT-sumX*sumT/count)/energyT}
 }
 return best
}
async function main(){
 const device=native.devices().find(d=>d.supported&&/Realtek/i.test(d.label))
 assert(device&&device.format.sampleRate===48000&&device.format.channelCount===2,'Digital loopback fixture requires the current stereo 48 kHz endpoint')
 report.device=device
 const file=path.join(folder,'owned-marker.wav'),reference=marker(file)
 native.start(device.id);await native.playbackOpen('owned-marker',[file],device.id,process.env.TRACE_TEST_RAW_MODE!=='0');native.playbackVolume(.15);native.playbackPlay()
 await wait(()=>BigInt(native.playbackSnapshot().presentedStreamFrames)>4800n,'warm capture')
 const generation=native.playbackSeek('24000',true,false,'0','0')
 await wait(()=>{const s=native.playbackSnapshot();return s.generation===generation&&s.playing&&BigInt(s.presentedStreamFrames)>2400n},'seek playback')
 native.recordStart('digital-loopback',path.join(folder,'captured'),'float32')
 await wait(()=>native.recordStatus().phase==='recording','recording boundary')
 const stamp=await wait(()=>{const s=native.playbackSnapshot();if(s.error)throw Error(s.error);return s.clockAccurate&&BigInt(s.presentedStreamFrames)>16000n?s:null},'correlated output clock')
 await wait(()=>native.playbackSnapshot().phase==='ended','source EOF')
 native.recordStop();const recorded=await wait(()=>{const s=native.recordStatus();if(s.phase==='failed')throw Error(s.error);return s.phase==='complete'?s:null},'capture finalize')
 native.stop();await native.playbackClose()
 assert(recorded.startQpc100ns);assert.equal(recorded.segments.length,1)
 const captureFile=path.join(folder,recorded.segments[0].file),matches=[]
 for(let channel=0;channel<2;channel++)matches.push(match(samples(captureFile,channel),reference[channel],36000))
 report.matches=matches;report.stamp=stamp;report.recording={frames:recorded.writtenFrames,startQpc100ns:recorded.startQpc100ns,startQpcEstimated:recorded.startQpcEstimated}
 assert(matches.every(m=>m.correlation>.95),'Captured output does not match its file samples')
 assert(matches.every(m=>Math.abs(m.gain-.15)<.00001),'Digital output does not apply the requested monitor gain')
 assert(Math.abs(matches[0].frame-matches[1].frame)<=1,'Left/right marker positions differ')
 const predicted=BigInt(stamp.clockQpc100ns)+(12000n-BigInt(stamp.presentedStreamFrames))*10000000n/48000n
 const measured=BigInt(recorded.startQpc100ns)+BigInt(matches[0].frame)*10000000n/48000n
 const offsetMs=Number(measured-predicted)/10000
 assert(Math.abs(offsetMs)<=50,'File marker and device clock differ by more than 50 ms')
 report.checks.push('Real digital output preserves both independent channel markers','Digital output applies the requested 0.15 monitor gain','A seek outputs the requested file content','Captured marker and presentation clock agree within 50 ms')
 report.matches=matches;report.markerClockOffsetMs=offsetMs;report.recording={frames:recorded.writtenFrames,startQpcEstimated:recorded.startQpcEstimated,startQpc100ns:recorded.startQpc100ns}
 report.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;report.capture=native.recordStatus();report.playback=native.playbackSnapshot();console.error(error);process.exitCode=1}).finally(async()=>{
 try{native.shutdown()}catch{};await native.playbackClose().catch(()=>{})
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m4/loopback-latest.json'),JSON.stringify(report,null,2));console.log('M4_DIGITAL_LOOPBACK',report.status,report.matches,report.markerClockOffsetMs)
})
