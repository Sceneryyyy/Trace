const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{createHash}=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','gate-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const report={status:'running',folder,automaticContinuationImplemented:true,realDriverFormatChange:false,originalEbuGatePassed:false,checks:[]}
const electron=require('electron')
const checks=[
 ['types',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']],
 ['js',process.execPath,['--test','test/recording-continuation.test.mjs','test/recording-service.test.mjs','test/recovery-inventory.test.mjs','test/session-timeline.test.mjs','test/trace-contracts.test.mjs']],
 ['snapshot-fault',electron,['tools/m3/snapshot-fault.cjs','--trace-test'],'artifacts/m2-regions/snapshot-fault-latest.json'],
 ...[1,2,3].map(n=>['continuation-'+n,electron,['tools/m3/continuation-wasapi.cjs','--trace-test'],'artifacts/m2-regions/wasapi-latest.json']),
 ['multi-recovery',process.execPath,['tools/m3/region-recovery.cjs'],'artifacts/m2-regions/recovery-latest.json'],
 ['mixed-recovery',process.execPath,['tools/m3/mixed-region-recovery.cjs'],'artifacts/m2-regions/mixed-recovery-latest.json'],
 ['legacy-recovery',process.execPath,['tools/m2/run-recovery.cjs'],'artifacts/m2/recovery-latest.json'],
 ['record-ui',electron,['tools/m2/ui-record-smoke.cjs','--trace-test'],'artifacts/m2/ui-latest.json'],
 ['reopen',electron,['tools/m2/reopen-ui.cjs','--trace-test'],'artifacts/m2/reopen-ui-latest.json'],
 ['analysis-ui',process.execPath,['tools/m3/run.cjs','ui'],'artifacts/m3/ui-latest.json']
]
try{
 for(const [name,command,args,reportFile]of checks){
  const start=Date.now(),r=spawnSync(command,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:180000})
  fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''))
  if(r.error||r.status!==0)throw r.error||Error(name+' exited '+r.status)
  let evidence
  if(reportFile){
   const file=path.join(root,reportFile);evidence=JSON.parse(fs.readFileSync(file,'utf8'))
   if(fs.statSync(file).mtimeMs<start||evidence.status!=='pass')throw Error(name+': '+(evidence.error||'stale or failed report'))
   fs.copyFileSync(file,path.join(folder,name+'.json'))
  }
  report.checks.push({name,status:'pass',milliseconds:Date.now()-start,evidenceFolder:evidence?.folder,count:evidence?.checks?.length})
  console.log('REGION_GATE',name,'PASS')
 }
 report.status='pass'
}catch(error){report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}
finally{
 report.nativeSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'build/trace-engine/Release/trace_engine.node'))).digest('hex')
 report.appMainSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'out-trace/main/index.js'))).digest('hex')
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2))
 fs.writeFileSync(path.join(root,'artifacts/m2-regions/continuation-gate-latest.json'),JSON.stringify(report,null,2))
}
