// Inspect real RME capture continuity through the packaged application.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process')
const {launch,delay}=require('./cdp.cjs'),root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/acceptance','rme-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const userData=path.join(folder,'user-data');fs.mkdirSync(userData)
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false}))
const report={status:'running',folder,samples:[]};let session,fixture
const wait=async(fn,label)=>{for(const begin=Date.now();Date.now()-begin<60000;){const v=await fn();if(v)return v;await delay(50)}throw Error('Timeout '+label)}
async function main(){
 assert(process.env.TRACE_PACKAGE_EXE);session=await launch(process.env.TRACE_PACKAGE_EXE,folder,{userData});const c=session.cdp
 await c.evaluate('window.__quality=null;window.trace.onSnapshot(s=>window.__quality=s);true')
 const devices=(await c.request('devices.list')).data,index=devices.findIndex(d=>d.supported&&d.isDefault&&/RME/.test(d.label));assert(index>=0)
 report.device=devices[index];await c.request('live.start',{deviceId:devices[index].id})
 await c.request('record.configure',{encoding:'pcm24',sampleRate:'source',namePrefix:'RmeQuality'})
 await c.request('record.start');const id=(await c.state()).currentRecord.id
 fixture=spawn(path.join(root,'build/trace-diagnostics/Release/trace-render-fixture.exe'),[String(index),'12'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
 fixture.stdout.on('data',b=>fs.appendFileSync(path.join(folder,'fixture.log'),b));fixture.stderr.on('data',b=>fs.appendFileSync(path.join(folder,'fixture.log'),b));fixture.on('error',e=>{report.fixtureError=String(e)})
 for(let n=0;n<14;n++){await delay(1000);if(report.fixtureError)throw Error(report.fixtureError);const s=await c.evaluate('window.__quality');assert(s.active&&!s.error);report.samples.push({positionFrame:s.positionFrame,continuity:s.continuity,diagnostics:s.diagnostics})}
 assert.equal(fixture.exitCode,0);report.record=(await c.request('record.stop')).data
 assert.equal(report.record.writtenFrames,report.record.acceptedFrames);assert.equal(report.record.phase,'complete')
 report.take=await wait(async()=>{const t=(await c.state()).recordings.find(t=>t.id===id);if(t?.status==='failed')throw Error(t.error);return t?.status==='ready'?t:null},'persisted take')
 const dir=fs.readdirSync(path.join(folder,'takes')).map(n=>path.join(folder,'takes',n)).find(d=>JSON.parse(fs.readFileSync(path.join(d,'session.json'),'utf8')).sessionId===id)
 report.document=JSON.parse(fs.readFileSync(path.join(dir,'session.json'),'utf8'))
 assert.equal(report.document.frames,report.record.writtenFrames)
 const region=report.document.regions[0]
 // Direct REC persists native estimatedFrames and session discontinuity state;
 // captureQuality is the separate memory-cache-save contract.
 assert.equal(region.estimatedFrames,report.record.estimatedFrames)
 if(report.document.hasDiscontinuities)assert.equal(report.take.continuity,'gaps','Gap hidden by library summary')
 else if(BigInt(region.estimatedFrames)>0n)assert.equal(report.take.continuity,'estimated-silence','Estimated data hidden by library summary')
 else assert.equal(report.take.continuity,'complete')
 report.captureQuality={estimatedFrames:region.estimatedFrames,hasDiscontinuities:report.document.hasDiscontinuities,continuity:report.take.continuity};report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;process.exitCode=1;console.error(e)}).finally(async()=>{
 if(fixture&&fixture.exitCode===null)fixture.kill()
 if(session){try{await session.cdp.request('record.stop')}catch{}await session.close().catch(e=>{report.status='fail';report.closeError=String(e);process.exitCode=1})}
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/acceptance/rme-latest.json'),JSON.stringify(report,null,2));console.log('RME_QUALITY',report.status,report.captureQuality)
})
