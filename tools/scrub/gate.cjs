
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/scrub','gate-'+Date.now());fs.mkdirSync(folder,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const report={status:'running',folder,checks:[]};
try{
 for(const [name,args,file]of [
  ['presentation-contracts',['--test','test/history-presentation.test.mjs','test/playback-service.test.mjs']],
  ['scrub-frames',['tools/scrub/run-ui.cjs'],'artifacts/scrub/ui-latest.json'],
  ['workbench',['tools/workbench/run-ui.cjs'],'artifacts/workbench/ui-latest.json'],
  ['file-transport',['tools/m4/run.cjs'],'artifacts/m4/ui-latest.json'],
  ['interaction',['tools/feedback3/run-ui.cjs'],'artifacts/feedback3/ui-latest.json'],
  ['recording-boundaries',['tools/m3/precision-gate.cjs'],'artifacts/m2-regions/precision-gate-latest.json'],
  ['package-audit',['tools/m6/package-audit.cjs'],'artifacts/m6/package-audit-latest.json'],
  ['packaged-workflow',['tools/m6/package-smoke.cjs'],'artifacts/m6/package-latest.json']
 ]){
  const started=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:600000});fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''));
  if(r.error||r.status!==0)throw r.error||Error(name+' failed');
  let result;if(file){const p=path.join(root,file);result=JSON.parse(fs.readFileSync(p,'utf8'));if(result.status!=='pass'||fs.statSync(p).mtimeMs<started)throw Error(name+' stale/failed');fs.copyFileSync(p,path.join(folder,name+'.json'))}
  report.checks.push({name,status:'pass',count:result?.checks.length,milliseconds:Date.now()-started});console.log('SCRUB_GATE',name,'PASS');
 }report.status='pass';
}catch(error){report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}
finally{const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');report.nativeSha256=sha('build/trace-engine/Release/trace_engine.node');report.mainSha256=sha('out-trace/main/index.js');fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/scrub/gate-latest.json'),JSON.stringify(report,null,2))}
