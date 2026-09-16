// Run after node tools/build-engine.cjs and node tools/trace.cjs AppBuild.
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{createHash}=require('crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','precision-gate-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const report={status:'running',folder,kind:'WAV precision and continuation engineering gate',checks:[]}
try{
 for(const [name,command,args,file]of [
  ['continuation',process.execPath,['tools/m3/continuation-gate.cjs'],'artifacts/m2-regions/continuation-gate-latest.json'],
  ['precision-ui',require('electron'),['tools/m3/precision-ui.cjs','--trace-test'],'artifacts/m2-regions/precision-ui-latest.json']
 ]){
  const started=Date.now(),result=spawnSync(command,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:180000})
  fs.writeFileSync(path.join(folder,name+'.log'),(result.stdout||'')+(result.stderr||''))
  if(result.error||result.status!==0)throw result.error||Error(name+' failed')
  const full=path.join(root,file),data=JSON.parse(fs.readFileSync(full,'utf8'))
  if(data.status!=='pass'||fs.statSync(full).mtimeMs<started)throw Error(name+': '+(data.error||'stale report'))
  fs.copyFileSync(full,path.join(folder,name+'.json'))
  report.checks.push({name,status:'pass',evidenceFolder:data.folder,count:data.checks.length})
  console.log('PRECISION_GATE',name,'PASS')
 }
 report.status='pass'
}catch(error){report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}
finally{
 report.nativeSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'build/trace-engine/Release/trace_engine.node'))).digest('hex')
 report.appMainSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'out-trace/main/index.js'))).digest('hex')
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2))
 fs.writeFileSync(path.join(root,'artifacts/m2-regions/precision-gate-latest.json'),JSON.stringify(report,null,2))
}
