const fs=require('fs'),path=require('path')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m8/telemetry-probe-'+Date.now()),userData=path.join(folder,'user-data')
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:true}))
const report={folder,status:'running',kind:'Diagnostic observation overhead experiment, not product acceptance',samples:[]};let session
async function main(){
 session=await launch(path.join(root,'dist-trace/preview.13/win-unpacked/Trace.exe'),folder,{userData});const c=session.cdp
 await c.evaluate('window.__mem=null;window.trace.onSnapshot(s=>window.__mem=s);true')
 const state=await c.state();await c.request('workspace.configure',{workspace:{...state.workspace,layout:{...state.workspace.layout,hidden:[]}}})
 await c.request('instrument.configure',{settings:{...state.instrumentSettings,fftSize:16384,averageMs:2000,holdMs:2000,fieldMs:1000}})
 await delay(4000);await c.request('live.stop');await delay(200)
 async function sample(phase,i){const info=(await c.request('app.info')).data,heap=await c.send('Runtime.getHeapUsage'),dom=await c.send('Memory.getDOMCounters');const row={phase,i,processes:info.processMetrics,heap,dom};report.samples.push(row);console.log(phase,i,Math.round(info.processMetrics.reduce((s,p)=>s+p.memory.workingSetSize,0)/1024)+' MiB')}
 await sample('initial',0)
 for(const phase of ['small','full','small-after']){for(let i=0;i<150;i++){
  await c.evaluate(phase==='full'?'({frame:window.__mem,count:1})':'({position:window.__mem?.positionFrame,error:window.__mem?.error})')
  if((i+1)%50===0)await sample(phase,i+1)
 } }
 report.status='complete'
}
main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>report.closeError=String(e));fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m8/telemetry-probe-latest.json'),JSON.stringify(report,null,2));console.log('TELEMETRY_PROBE',report.status)})
