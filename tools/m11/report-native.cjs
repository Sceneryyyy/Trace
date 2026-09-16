const {app}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m11/native-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true});app.setPath('userData',path.join(folder,'user-data'));app.disableHardwareAcceleration()
const fixture=require('../m4/fixture.cjs')(takes),sources=fixture.document.assets.map(a=>path.join(fixture.folder,a.relativePath)),nativePath=path.join(root,'build/trace-engine/Release/trace_engine.node')
const {analyzeAsset,AnalysisCache,buildReport,defaultTargetSettings}=require(path.join(root,'artifacts/m11/report-native.cjs'))
const report={folder,status:'running',checks:[]},pass=s=>{report.checks.push(s);console.log('PASS',s)}
function csv(line){const values=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){values.push(value);value=''}else value+=c}values.push(value);return values}
app.whenReady().then(async()=>{
 const analysis=await analyzeAsset({kind:'analyze',id:crypto.randomUUID(),nativePath,sources,cacheRoot:path.join(folder,'cache')},()=>{})
 const source={label:'=Unsafe <script>alert(1)</script>, "name"',takeId:fixture.document.sessionId,role:'source',format:'WAV · float32',sourceFrames:'384000',scope:{kind:'whole',startFrame:'0',endFrame:'384000'},integrity:{state:'complete',notes:[]}}
 const targets={...defaultTargetSettings,enabled:true,integrated:{target:-25,tolerance:1},truePeakMax:-23},request={version:1,source,cacheDirectory:analysis.directory,cacheKey:analysis.manifest.cacheKey,sourceFiles:sources,targets,outputDirectory:path.join(folder,'whole')}
 const result=await buildReport(request);assert.equal(result.rows,800);assert.deepEqual(result.summary,analysis.manifest.summary);assert(result.events>0);assert.equal(result.evaluation.state,'fail')
 const lines=fs.readFileSync(path.join(request.outputDirectory,'history.csv'),'utf8').trim().split('\r\n');assert.equal(lines.length,1601);const cache=await AnalysisCache.open(analysis.directory)
 for(const index of [0,9,99,299,399,799]){
  const fields=csv(lines[1+index*2]),point=await cache.metrics(String((index+1)*480));assert.equal(fields[1],point.levelIndexFrame);assert.equal(fields[2],point.loudnessIndexFrame)
  assert.equal(fields[3],point.momentary.value===null?'':String(point.momentary.value));assert.equal(fields[7],point.integratedToCursor.value===null?'':String(point.integratedToCursor.value));assert.equal(fields[14],point.channels[0].truePeak.value===null?'':String(point.channels[0].truePeak.value))
 }
 pass('Full-scope report rows match the actual native cache at their documented sample positions')
 const html=fs.readFileSync(path.join(request.outputDirectory,'report.html'),'utf8'),summary=fs.readFileSync(path.join(request.outputDirectory,'summary.csv'),'utf8');assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes(sources[0]));assert(csv(summary.split('\r\n')[1])[0].startsWith("'="));assert(!html.includes('data:audio'))
 pass('HTML and CSV escape untrusted labels and contain no audio or private source paths')
 const range={startFrame:'48000',endFrame:'240000'},selected=await analyzeAsset({kind:'analyze',id:crypto.randomUUID(),nativePath,sources,cacheRoot:path.join(folder,'cache'),range},()=>{})
 const selection=await buildReport({...request,source:{...source,scope:{kind:'selection',...range},physicalRange:range},cacheDirectory:selected.directory,cacheKey:selected.manifest.cacheKey,outputDirectory:path.join(folder,'selection')})
 assert.deepEqual(selection.summary,selected.manifest.summary);assert.notEqual(selection.summary.integratedToCursor.value,result.summary.integratedToCursor.value)
 const selectedRows=fs.readFileSync(path.join(folder,'selection/history.csv'),'utf8').trim().split('\r\n');assert.equal(csv(selectedRows[1])[0],'48000');assert.equal(csv(selectedRows.at(-1))[1],'240000')
 pass('Selection reports restart accumulation and preserve absolute source-frame mapping')
 const unknown=await buildReport({...request,targets:{...targets,integrated:null,truePeakMax:0},source:{...source,integrity:{state:'unknown',notes:['Recovered source completeness is unknown']}},outputDirectory:path.join(folder,'unknown')});assert.equal(unknown.evaluation.state,'unavailable')
 pass('Unknown recording completeness cannot be reported as a complete target pass')
 const cancelled=path.join(folder,'cancelled');let checks=0;await assert.rejects(buildReport({...request,outputDirectory:cancelled},()=>{},()=>fs.existsSync(cancelled)&&++checks>25),/REPORT_CANCELLED/);assert.deepEqual(fs.readdirSync(cancelled),[])
 const old=fs.readFileSync(path.join(request.outputDirectory,'report.html'));await assert.rejects(buildReport(request),/EEXIST/);assert.deepEqual(fs.readFileSync(path.join(request.outputDirectory,'report.html')),old)
 pass('Cancellation removes only this draft and existing reports are never overwritten')
 const original=fs.readFileSync(sources[0]),changed=Buffer.from(original);changed[100]^=1;fs.writeFileSync(sources[0],changed)
 await assert.rejects(buildReport({...request,outputDirectory:path.join(folder,'changed')}),/REPORT_SOURCE_CHANGED/);fs.writeFileSync(sources[0],original)
 const page=path.join(analysis.directory,'levels.bin'),saved=fs.readFileSync(page),bad=Buffer.from(saved);bad[100]^=1;fs.writeFileSync(page,bad)
 await assert.rejects(buildReport({...request,outputDirectory:path.join(folder,'bad-cache')}),/CORRUPT_CACHE/);fs.writeFileSync(page,saved)
 for(const a of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,a.relativePath))).digest('hex'),a.hash)
 pass('Changed source hashes and corrupt cache pages fail explicitly while original fixtures remain intact')
 report.summary={rows:result.rows,events:result.events,coverage:result.coverage,wholeI:result.summary.integratedToCursor,selectionI:selection.summary.integratedToCursor};report.status='pass'
}).catch(error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error)}).finally(()=>{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m11/native-latest.json'),JSON.stringify(report,null,2));console.log('M11_REPORT_NATIVE',report.status,report.checks.length);app.exit(report.status==='pass'?0:1)})
