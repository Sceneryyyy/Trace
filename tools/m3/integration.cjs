const {app}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m3','integration-'+Date.now())
fs.mkdirSync(folder,{recursive:true});app.setPath('userData',path.join(folder,'user-data'));app.disableHardwareAcceleration()
const {analyzeFiles,AnalysisCache,crc32}=require(path.join(root,'out-trace/main/analysis-test-api.cjs'))
const nativePath=path.join(root,'build/trace-engine/Release/trace_engine.node')
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const report={status:'running',started:new Date().toISOString(),folder,checks:[]}
const check=(value,label)=>{assert(value,label);report.checks.push(label)}
function cropWave(source,target,frames){
 const input=fs.readFileSync(source);let offset=12,blockAlign=0,fact=0,data=0
 while(offset+8<=input.length){
  const id=input.toString('ascii',offset,offset+4),size=input.readUInt32LE(offset+4)
  if(id==='fmt ')blockAlign=input.readUInt16LE(offset+8+12)
  if(id==='fact')fact=offset+8
  if(id==='data'){data=offset+8;break}
  offset+=8+size+(size%2)
 }
 assert(data&&blockAlign)
 const bytes=frames*blockAlign,output=Buffer.from(input.subarray(0,data+bytes))
 output.writeUInt32LE(output.length-8,4);output.writeUInt32LE(bytes,data-4);if(fact)output.writeUInt32LE(frames,fact)
 fs.writeFileSync(target,output)
}
app.whenReady().then(async()=>{
 try{
  const builds=path.join(root,'build/trace-engine')
  const candidates=fs.readdirSync(builds).filter(n=>n.startsWith('analysis-tests-')).map(n=>path.join(builds,n)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)
  const fixture=candidates.find(p=>fs.existsSync(path.join(p,'tone-1.wav')))
  assert(fixture,'Run Trace.ps1 Engine first')
  const source=path.join(fixture,'tone-1.wav'),originalHash=hash(source),cacheRoot=path.join(folder,'cache')
  const progress=[]
  const result=await analyzeFiles(nativePath,[source],cacheRoot,{readFrames:127,progress:p=>progress.push(p)})
  check(!result.cacheHit&&result.manifest.frames==='576137','Native file worker produced exact-frame cache')
  check(progress.some(p=>p.phase==='analyzing')&&progress.some(p=>p.phase==='ready'),'Worker reports native scan progress')
  const cache=await AnalysisCache.open(result.directory,result.manifest.cacheKey)
  assert.equal(crc32(Buffer.from('123456789')),0xcbf43926)
  const atZero=await cache.metrics('0')
  check(atZero.channels[0].samplePeak.status==='insufficient'&&atZero.integratedToCursor.status==='insufficient','Cursor before first index is not a false reading')
  const last=await cache.metrics(result.manifest.frames)
  check(last.levelIndexFrame==='576137'&&last.loudnessIndexFrame==='576137','Both histories include actual EOF')
  assert.deepEqual(last.integratedToCursor,result.manifest.summary.integratedToCursor)
  const positions=['479','480','4799','4800','491520','576136','576137']
  let seed=7;for(let i=0;i<100;i++){seed=(seed*1664525+1013904223)>>>0;positions.push(String(seed%576138))}
  const expected=new Map()
  for(const position of positions){const metrics=await cache.metrics(position);assert(BigInt(metrics.levelIndexFrame)<=BigInt(position));assert(BigInt(metrics.loudnessIndexFrame)<=BigInt(position));expected.set(position,metrics)}
  const reopened=await AnalysisCache.open(result.directory)
  for(const position of [...positions].reverse())assert.deepEqual(await reopened.metrics(position),expected.get(position))
  check(true,'107 shuffled positions repeat exact cached values after reopen')
  const detail=await cache.waveform('0','576137',1200),overview=await cache.waveform('0','576137',8)
  check(detail.length<=1200&&overview.length<=8,'Timeline queries cap returned geometry')
  const low=Math.min(...detail.map(p=>p.min[0])),high=Math.max(...detail.map(p=>p.max[0]))
  check(low===Math.min(...overview.map(p=>p.min[0]))&&high===Math.max(...overview.map(p=>p.max[0])),'Coarse waveform preserves full-range extrema')
  const history=await cache.loudness('0','576137',12);check(history.length<=12,'Loudness overview returns actual bounded indices')
  const prefix=path.join(folder,'prefix.wav');cropWave(source,prefix,177600)
  const prefixAnalysis=await analyzeFiles(nativePath,[prefix],cacheRoot)
  assert.deepEqual((await cache.metrics('177600')).integratedToCursor,prefixAnalysis.manifest.summary.integratedToCursor)
  check(true,'Historical I matches an independently finalized file prefix')
  await assert.rejects(cache.metrics('-1'),/INVALID_FILE_POSITION/)
  await assert.rejects(cache.metrics('576138'),/FILE_POSITION_OUT_OF_RANGE/)
  await assert.rejects(cache.waveform('0','576137',2401),/INVALID_TIMELINE_RANGE/)
  check(true,'Invalid frame ranges and unbounded geometry requests are rejected')
  const beforeIo=cache.io.pagesRead;await cache.metrics('4800');const afterIo=cache.io.pagesRead;await cache.metrics('4800')
  check(cache.io.pagesRead===afterIo&&afterIo-beforeIo<=2,'Repeated cursor query uses bounded cached pages')
  const hit=await analyzeFiles(nativePath,[source],cacheRoot)
  check(hit.cacheHit&&hit.manifest.cacheKey===result.manifest.cacheKey,'Unchanged source reuses its content-bound cache')
  const levelsPath=path.join(result.directory,'levels.bin'),damaged=fs.readFileSync(levelsPath);damaged[64+17]^=1;fs.writeFileSync(levelsPath,damaged)
  const broken=await AnalysisCache.open(result.directory)
  await assert.rejects(broken.metrics('480'),/CORRUPT_CACHE: page checksum/)
  const rebuilt=await analyzeFiles(nativePath,[source],cacheRoot)
  check(!rebuilt.cacheHit&&fs.readdirSync(cacheRoot).some(n=>n.includes('.corrupt-')),'Corrupt cache is isolated and rebuilt')
  assert.deepEqual(await (await AnalysisCache.open(rebuilt.directory)).metrics('177600'),expected.get('177600')||await cache.metrics('177600'))
  const changed=path.join(folder,'changed.wav');const changedBytes=fs.readFileSync(source);changedBytes.writeFloatLE(0.125,58);fs.writeFileSync(changed,changedBytes)
  const changedAnalysis=await analyzeFiles(nativePath,[changed],cacheRoot)
  check(changedAnalysis.manifest.cacheKey!==result.manifest.cacheKey,'Changed PCM receives an independent cache identity')
  const long=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m2/long-latest.json'),'utf8'))
  assert.equal(long.status,'pass')
  const takeRoot=path.join(long.folder,'takes'),takeDirectory=path.join(takeRoot,fs.readdirSync(takeRoot)[0])
  const session=JSON.parse(fs.readFileSync(path.join(takeDirectory,'session.json'),'utf8'))
  const longSource=path.join(takeDirectory,session.assets.find(a=>a.role==='source').relativePath)
  const controller=new AbortController(),cancelRoot=path.join(folder,'cancel-cache')
  await assert.rejects(analyzeFiles(nativePath,[longSource],cancelRoot,{signal:controller.signal,progress:p=>{if(p.phase==='analyzing'&&BigInt(p.frames)>0n)controller.abort()}}),/ANALYSIS_CANCELLED/)
  check(!fs.readdirSync(cancelRoot).some(n=>n.includes('.pending-')),'Cancellation removes only its owned partial cache')
  const longProgress=[],start=Date.now()
  const longResult=await analyzeFiles(nativePath,[longSource],path.join(folder,'long-cache'),{progress:p=>longProgress.push(p)})
  const longCache=await AnalysisCache.open(longResult.directory)
  const queryStart=performance.now(),longMetrics=await longCache.metrics('86300000'),longWave=await longCache.waveform('0',longResult.manifest.frames,900)
  report.long={seconds:long.durationSeconds,analysisMilliseconds:Date.now()-start,queryMilliseconds:performance.now()-queryStart,
    frames:longResult.manifest.frames,queryIo:{...longCache.io},peakWorkerRssBytes:Math.max(...longProgress.map(p=>p.rssBytes||0)),cacheDirectory:longResult.directory,metrics:longMetrics}
  check(longResult.manifest.frames===long.final.writtenFrames&&longWave.length<=900,'30-minute recording is scanned and queried without loading all history')
  check(longCache.io.pagesRead<10,'Late cursor and whole-file overview read fewer than ten pages')
  check(longResult.manifest.sourceSha256[0]===session.assets.find(a=>a.role==='source').hash,'Cancelled and completed analysis preserve the long recording SHA256')
  check(hash(source)===originalHash,'All rebuild/cancel operations preserve source bytes')
  report.status='pass';report.progressCount=progress.length;report.cacheDirectory=result.directory
 }catch(error){report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error)}
 finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m3/integration-latest.json'),JSON.stringify(report,null,2));console.log('M3_FILE_CACHE_INTEGRATION',report.status);app.exit(report.status==='pass'?0:1)}
})
