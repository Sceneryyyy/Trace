const { app }=require('electron')
const fs=require('node:fs')
const path=require('node:path')
const root=path.resolve(__dirname,'../..')
const folder=path.join(root,'artifacts/m2','native-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
app.setPath('userData',path.join(folder,'user-data'));app.disableHardwareAcceleration()
const report={kind:'actual-wasapi-recording',started:new Date().toISOString(),takes:[]}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let engine
const timeout=setTimeout(()=>{try{engine?.shutdown()}catch{}app.exit(3)},45000)
app.whenReady().then(async()=>{
 try{
  engine=require(path.join(root,'build/trace-engine/Release/trace_engine.node'))
  const device=engine.devices().find(d=>d.isDefault&&d.supported)
  if(!device)throw Error('No supported default device')
  const format=engine.start(device.id)
  const epoch=engine.snapshot(10,1).epochId
  await delay(1000)
  if(fs.readdirSync(folder).some(x=>x.endsWith('.wav')))throw Error('Audio file exists before REC')
  for(const encoding of ['pcm16','pcm24','float32']){
    const target=path.join(folder,encoding);fs.mkdirSync(target)
    const liveBefore=engine.snapshot(10,1)
    engine.recordStart(encoding,path.join(target,'record'),encoding,48000)
    let rejected=false;try{engine.reset()}catch{rejected=true}if(!rejected)throw Error('Reset allowed during REC')
    rejected=false;try{engine.stop()}catch{rejected=true}if(!rejected)throw Error('LIVE stop allowed during REC')
    await delay(1250)
    engine.recordStop()
    let record
    for(let i=0;i<200;i++){
      record=engine.recordStatus()
      if(['complete','failed'].includes(record.phase))break
      await delay(20)
    }
    if(record.phase!=='complete'||record.error)throw Error(JSON.stringify(record))
    const liveAfter=engine.snapshot(10,1)
    if(liveAfter.epochId!==epoch||!liveAfter.active||BigInt(liveAfter.positionFrame)<=BigInt(liveBefore.positionFrame))throw Error('REC interrupted LIVE')
    if(record.acceptedFrames!==record.writtenFrames)throw Error('Written frame mismatch')
    if(BigInt(record.endFrameExclusive)-BigInt(record.startFrame)!==BigInt(record.writtenFrames))throw Error('Boundary mismatch')
    if(record.startQpc100ns===null||record.endQpc100ns===null||BigInt(record.endQpc100ns)<=BigInt(record.startQpc100ns))throw Error('Missing saved-prefix native clock')
    if(typeof record.startQpcEstimated!=='boolean'||typeof record.endQpcEstimated!=='boolean')throw Error('Missing clock quality')
    if(record.meters.levelIndexFrame!==record.writtenFrames||record.meters.loudnessIndexFrame!==record.writtenFrames)throw Error('Meter tail missing')
    const total=record.segments.reduce((n,s)=>n+BigInt(s.frames),0n)
    if(total!==BigInt(record.writtenFrames))throw Error('Segment total mismatch')
    const {waveform,loudnessHistory,...summary}=record
    report.takes.push({...summary,folder:target,waveformPoints:waveform.length,loudnessPoints:loudnessHistory.length})
    engine.recordStop()
  }
  report.format=format;report.status='pass';engine.shutdown()
 }catch(error){report.status='fail';report.error=String(error);try{engine?.shutdown()}catch{}}
 finally{clearTimeout(timeout);fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m2/native-latest.json'),JSON.stringify(report,null,2));console.log('NATIVE_RECORD_SMOKE',report.status,report.error||'');app.exit(report.status==='pass'?0:1)}
})
