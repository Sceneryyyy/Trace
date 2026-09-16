const {app}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m8/native-'+Date.now());fs.mkdirSync(folder,{recursive:true})
app.setPath('userData',path.join(folder,'user-data'));app.disableHardwareAcceleration()
const report={folder,status:'running',checks:[]};let engine
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pass=s=>{report.checks.push(s);console.log('PASS',s)}
const rate=48000,frames=rate*3,wave=Buffer.alloc(44+frames*8);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(3,20);wave.writeUInt16LE(2,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*8,28);wave.writeUInt16LE(8,32);wave.writeUInt16LE(32,34);wave.write('data',36);wave.writeUInt32LE(frames*8,40)
for(let n=0;n<frames;n++){const v=.4*Math.sin(2*Math.PI*750*n/rate);wave.writeFloatLE(v,44+n*8);wave.writeFloatLE(-v,48+n*8)}
const source=path.join(folder,'反相参考.wav');fs.writeFileSync(source,wave);const original=crypto.createHash('sha256').update(wave).digest('hex')
const config={fftSize:2048,averageMs:300,holdMs:1000,fieldMs:300,channel:'stereo'}
app.whenReady().then(async()=>{
 engine=require(path.join(root,'build/trace-engine/Release/trace_engine.node'))
 const request={kind:'file',sampleRate:rate,positionFrame:'96000',sources:[source],config}
 const result=await engine.instrumentAnalyze(request);assert(result.current instanceof Float64Array);assert(result.field.points instanceof Float32Array)
 assert.equal(result.positionFrame,'96000');assert(Math.abs(result.current[32]-.16)<1e-5);assert(Math.abs(result.field.correlation.value+1)<1e-9)
 assert.equal(result.field.polarRms.length,181);assert(result.field.polarRms[0]>0&&result.field.polarRms[180]>0)
 pass('Native async file window exposes calibrated spectrum, phase and Polar arrays')

 const firstTile=48000,columns=4,hop=config.fftSize/4
 const tile=await engine.spectrogramTile({...request,firstFrame:String(firstTile),columns,positionFrame:String(firstTile+(columns-1)*hop)})
 assert(tile.decibels instanceof Float32Array);assert(tile.status instanceof Uint8Array);assert.equal(tile.columns,columns);assert(tile.status.every(v=>v===1))
 for(let col=0;col<columns;col++)assert(Math.abs(tile.decibels[col*tile.bins+32]-20*Math.log10(.4))<.0001)
 const invalidTile={...request,firstFrame:'48000',columns:65,positionFrame:'96000'};assert.throws(()=>engine.spectrogramTile(invalidTile))
 pass('Native tile IPC preserves full frequency bins, logarithmic amplitudes and bounded dimensions')

 const repeat=await engine.instrumentAnalyze(request);assert.deepEqual(repeat.average,result.average)
 const cropped=await engine.instrumentAnalyze({...request,startFrame:'48000',endFrame:'144000',positionFrame:'48000'});assert.deepEqual(cropped.current,result.current)
 pass('Repeat and decoded-range coordinates use the same immutable file samples')
 const maximum={...request,config:{...config,fftSize:16384,averageMs:2000,holdMs:2000}}
 const a=engine.instrumentAnalyze(maximum),b=engine.instrumentAnalyze(maximum);assert.throws(()=>engine.instrumentAnalyze(maximum),/QUEUE_FULL/);await Promise.all([a,b]);pass('Native worker concurrency is bounded at two')
 assert.throws(()=>engine.instrumentAnalyze({...request,config:{...config,fftSize:513}}));await assert.rejects(engine.instrumentAnalyze({...request,positionFrame:String(frames+1)}));pass('Invalid FFT and file ranges reject without modifying source')
 const devices=engine.devices(),device=devices.find(d=>d.isDefault&&d.supported)||devices.find(d=>d.supported);assert(device,'Capture device required')
 engine.start(device.id);await delay(1400);const snapshot=engine.snapshot(5,100)
 const live={kind:'live',sourceId:snapshot.sourceId,epochId:snapshot.epochId,measurementEpoch:snapshot.measurementEpoch,positionFrame:snapshot.positionFrame,sampleRate:snapshot.format.sampleRate,config}
 const value=await engine.instrumentAnalyze(live);assert.equal(value.positionFrame,snapshot.positionFrame);assert(value.current.length===1025)
 assert.throws(()=>engine.instrumentAnalyze({...live,epochId:String(BigInt(live.epochId)+1n)}),/STALE/);pass('Actual capture supplies bounded ROI and rejects the wrong epoch')
 const frozen=engine.replayFreeze(false),replay={kind:'replay',...frozen,positionFrame:frozen.frames,config}
 const memoryJob=engine.instrumentAnalyze(replay);engine.replayRelease();const memory=await memoryJob;assert(memory.current.length===1025)
 assert.throws(()=>engine.instrumentAnalyze(replay),/REPLAY_NOT_READY/);pass('Frozen replay has exact local coordinates and survives worker ownership safely')
 engine.stop();
 const currentHash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');assert.equal(currentHash,original);pass('Reference audio is unchanged')
 report.status='pass'
}).catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e)}).finally(()=>{
 try{engine?.shutdown()}catch{}fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m8/native-latest.json'),JSON.stringify(report,null,2));console.log('M8_NATIVE',report.status,report.checks.length);app.exit(report.status==='pass'?0:1)
})
