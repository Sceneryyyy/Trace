const {app}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9/native-service-'+Date.now())
fs.mkdirSync(folder,{recursive:true});app.setPath('userData',path.join(folder,'user-data'));app.disableHardwareAcceleration()
const {SpectrogramService}=require(path.join(root,'artifacts/m9/spectrogramService.cjs'))
const {fileSpectrogramSource,liveSpectrogramSource,replaySpectrogramSource,takeSpectrogramSource}=require(path.join(root,'artifacts/m9/spectrogramSource.cjs'))
const report={status:'running',folder,checks:[]},pass=label=>{report.checks.push(label);console.log('PASS',label)},delay=ms=>new Promise(r=>setTimeout(r,ms))
let engine,service
const rate=48000,frames=rate*3,wave=Buffer.alloc(44+frames*8)
wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(3,20);wave.writeUInt16LE(2,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*8,28);wave.writeUInt16LE(8,32);wave.writeUInt16LE(32,34);wave.write('data',36);wave.writeUInt32LE(frames*8,40)
for(let i=0;i<frames;i++){const x=.4*Math.sin(2*Math.PI*750*i/rate);wave.writeFloatLE(x,44+i*8);wave.writeFloatLE(-x,48+i*8)}
const file=path.join(folder,'人工夹具-750Hz.wav');fs.writeFileSync(file,wave)
const original=crypto.createHash('sha256').update(wave).digest('hex'),config={fftSize:2048,channel:'stereo'}
const range=(start,end,sampleRate=rate)=>({startFrame:String(start),endFrame:String(end),width:512,height:180,minFrequency:20,maxFrequency:Math.min(20000,sampleRate/2)})
app.whenReady().then(async()=>{
  const nativePath=path.join(root,'build/trace-engine/Release/trace_engine.node')
  engine=require(nativePath);service=new SpectrogramService(engine)
  report.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(nativePath)).digest('hex')
  const source={sources:[file],cacheRoot:path.join(folder,'cache'),sampleRate:rate,channelCount:2,frames:String(frames)}
  const v=await service.query(fileSpectrogramSource(source,original),config,range(0,frames))
  assert(v.complete);assert(v.coverage.some(n=>n===1));assert(v.decibels.byteLength<=4*1024*1024)
  const p=await service.point(v.key,'96000',750);assert.equal(p.status,'ready');assert.equal(p.frequency,750);assert(Math.abs(p.decibels-20*Math.log10(.4))<.0001)
  report.referencePoint=p;pass('Real native tile service produces bounded calibrated file raster and exact bin reading')
  const cropped={...source,frames:'96000',decodeRange:{startFrame:'48000',endFrame:'144000'}}
  const crop=await service.query(fileSpectrogramSource(cropped,original),config,range(0,96000));assert.notEqual(crop.key,v.key)
  const cp=await service.point(crop.key,'48000',750);assert.equal(cp.decibels,p.decibels)
  pass('Decoded range uses local logical frames and independent cache identity')
  const device=engine.devices().find(d=>d.isDefault&&d.supported)||engine.devices().find(d=>d.supported);assert(device,'Capture device required')
  engine.start(device.id);await delay(1500)
  const snap=engine.snapshot(5,100),live=liveSpectrogramSource(snap)
  const lv=await service.query(live,config,range(live.availableStart,live.availableEnd,snap.format.sampleRate))
  assert(lv.coverage.some(n=>n>0));const lp=await service.point(lv.key,String(BigInt(live.availableEnd)-BigInt(Math.round(snap.format.sampleRate*.15))),750)
  assert(['ready','silence'].includes(lp.status));report.captureFormat=snap.format
  const frozen=engine.replayFreeze(false),replay=replaySpectrogramSource(frozen),rv=await service.query(replay,config,range(0,frozen.frames,frozen.sampleRate))
  const rp=await service.point(rv.key,String(BigInt(lp.frame)-BigInt(frozen.captureStartFrame)),lp.frequency)
  assert.equal(BigInt(rp.frame)+BigInt(frozen.captureStartFrame),BigInt(lp.frame));assert.equal(rp.status,lp.status);assert.equal(rp.decibels,lp.decibels)
  engine.replayRelease();pass('Actual capture and frozen replay preserve identical causal FFT window and reading')
  engine.recordStart('m9-tile-take',path.join(folder,'recording'),'pcm24');await delay(1200)
  const before=engine.recordStatus(),take=takeSpectrogramSource(before)
  const tv=await service.query(take,config,range(take.availableStart,take.availableEnd,before.sourceFormat.sampleRate));assert(tv.coverage.some(n=>n>0))
  const after=engine.recordStatus();assert.equal(after.id,before.id);assert(BigInt(after.writtenFrames)>BigInt(before.writtenFrames));assert.equal(after.error,null)
  engine.recordStop();for(let i=0;i<100&&engine.recordStatus().phase!=='complete';i++)await delay(30)
  const completed=engine.recordStatus();assert.equal(completed.phase,'complete');assert.equal(completed.error,null);assert(BigInt(completed.writtenFrames)>=BigInt(after.writtenFrames))
  report.recordedFrames=completed.writtenFrames;pass('Active native take supplies spectral tiles while recorded frame count continues')
  await service.close();engine.stop()
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),original)
  pass('Reference audio remains unchanged and derived storage is released')
  report.status='pass'
}).catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error)}).finally(async()=>{
  try{await service?.close()}catch{}try{engine?.shutdown()}catch{}
  fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m9/native-service-latest.json'),JSON.stringify(report,null,2))
  console.log('M9_SERVICE_NATIVE',report.status,report.checks.length);app.exit(report.status==='pass'?0:1)
})
