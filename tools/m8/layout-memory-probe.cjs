const fs=require('fs'),path=require('path')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m8/layout-memory-'+Date.now()),report={folder,kind:'Diagnostic only: visibility and repeated layout changes',cases:[]}
fs.mkdirSync(folder,{recursive:true})
async function run(visible){
 const dir=path.join(folder,visible?'visible':'hidden'),userData=path.join(dir,'user-data');fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:true}))
 const session=await launch(path.join(root,'dist-trace/preview.13/win-unpacked/Trace.exe'),dir,{userData,visible,args:visible?['--trace-test-visible']:[],bounds:{x:20,y:20,width:1280,height:800}}),c=session.cdp,item={visible,samples:[]};report.cases.push(item)
 async function sample(at){const info=(await c.request('app.info')).data,heap=await c.send('Runtime.getHeapUsage'),dom=await c.send('Memory.getDOMCounters');item.samples.push({at,metrics:info.processMetrics,heap,dom});console.log(visible?'VISIBLE':'HIDDEN',at,Math.round(info.processMetrics.reduce((s,p)=>s+p.memory.workingSetSize,0)/1024)+' MiB',dom.nodes+' nodes')}
 try{
 const s=await c.state(),base={...s.workspace,layout:{...s.workspace.layout,hidden:[]}};await c.request('workspace.configure',{workspace:base});await c.request('instrument.configure',{settings:{...s.instrumentSettings,fftSize:16384,averageMs:2000,holdMs:2000,fieldMs:1000}})
 await delay(3000);await sample('before')
 for(let i=0;i<40;i++){await c.request('workspace.configure',{workspace:{...base,layout:{...base.layout,hidden:['spectrum','soundfield']}}});await delay(60);await c.request('workspace.configure',{workspace:base});await delay(60);if(i%10===9)await sample('toggle-'+(i+1))}
 await c.send('HeapProfiler.collectGarbage');await delay(300);await sample('after-diagnostic-gc')
 }finally{await session.close()}
}
(async()=>{try{await run(false);await run(true);report.status='complete'}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m8/layout-memory-latest.json'),JSON.stringify(report,null,2))}})()
