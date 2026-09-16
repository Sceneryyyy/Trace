
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/workbench','gate-'+Date.now());fs.mkdirSync(folder,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const report={status:'running',folder,checks:[]};
try{
 for(const [name,args,file]of [
  ['unified-workbench',['tools/workbench/run-ui.cjs'],'artifacts/workbench/ui-latest.json'],
  ['interaction-and-audio-regression',['tools/feedback3/gate.cjs',...(process.argv.includes('--reuse-audio-regression')?['--reuse-audio-regression']:[])],'artifacts/feedback3/gate-latest.json']
 ]){
  const begin=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:1800000});
  fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''));
  if(r.error||r.status!==0)throw r.error||Error(name+': '+(r.stderr||'').slice(-2000));
  const result=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  if(result.status!=='pass'||fs.statSync(path.join(root,file)).mtimeMs<begin)throw Error(name+' failed/stale');
  fs.copyFileSync(path.join(root,file),path.join(folder,name+'.json'));report.checks.push({name,status:'pass',milliseconds:Date.now()-begin,count:result.checks.length});console.log('WORKBENCH_GATE',name,'PASS');
 }
 report.status='pass';
}catch(error){report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}
finally{const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');report.nativeSha256=sha('build/trace-engine/Release/trace_engine.node');report.mainSha256=sha('out-trace/main/index.js');fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/workbench/gate-latest.json'),JSON.stringify(report,null,2))}
