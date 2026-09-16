const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m4','gate-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const report={status:'running',folder,originalEbuGatePassed:false,checks:[]}
try{
 for(const [name,args,file]of [
  ['types',['node_modules/typescript/bin/tsc','--noEmit']],
  ['playback-js',['--test','test/playback-service.test.mjs','test/analysis-retention.test.mjs']],
  ['native-output',['tools/m4/native-smoke.cjs'],'artifacts/m4/native-latest.json'],
  ['digital-loopback',['tools/m4/loopback-output.cjs'],'artifacts/m4/loopback-latest.json'],
  ['file-ui',['tools/m4/run.cjs'],'artifacts/m4/ui-latest.json'],
  ['file-integration',['tools/m3/run.cjs','integration'],'artifacts/m3/integration-latest.json'],
  ['query-boundaries',['tools/m3/query-boundaries.mjs']],
  ['recording-regression',['tools/m3/precision-gate.cjs'],'artifacts/m2-regions/precision-gate-latest.json']
 ]){
  const began=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:240000})
  fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''))
  if(r.error||r.status!==0)throw r.error||Error(name+' failed: '+((r.stderr||'').slice(-1500)))
  let evidence
  if(file){
   const target=path.join(root,file);evidence=JSON.parse(fs.readFileSync(target,'utf8'))
   if(evidence.status!=='pass'||fs.statSync(target).mtimeMs<began)throw Error(name+': '+(evidence.error||'stale result'))
   fs.copyFileSync(target,path.join(folder,name+'.json'))
  }
  report.checks.push({name,status:'pass',milliseconds:Date.now()-began,evidenceFolder:evidence?.folder,count:evidence?.checks?.length})
  console.log('M4_GATE',name,'PASS')
 }
 report.status='pass'
}catch(error){report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}
finally{
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
 report.nativeSha256=sha('build/trace-engine/Release/trace_engine.node');report.mainSha256=sha('out-trace/main/index.js')
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m4/gate-latest.json'),JSON.stringify(report,null,2))
}
