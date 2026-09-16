const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/feedback','gate-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const report={status:'running',folder,checks:[]},env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const stages=[
 ['library',['--test','test/library-service.test.mjs']],
 ['feedback-ui',['tools/feedback/run-ui.cjs'],'artifacts/feedback/ui-latest.json'],
 ['desktop-regression',['tools/m6/gate.cjs',...(process.argv.includes('--reuse-audio-regression')?[]:['--regression'])],'artifacts/m6/gate-latest.json']
]
try{
 for(const [name,args,file]of stages){
  const start=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:900000})
  fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.error||r.status!==0)throw r.error||Error(name+': '+(r.stderr||'').slice(-1800))
  let result;if(file){const f=path.join(root,file);result=JSON.parse(fs.readFileSync(f,'utf8'));if(result.status!=='pass'||fs.statSync(f).mtimeMs<start)throw Error(name+' report failed or stale');fs.copyFileSync(f,path.join(folder,name+'.json'))}
  report.checks.push({name,status:'pass',milliseconds:Date.now()-start,count:result?.checks?.length});console.log('FEEDBACK_GATE',name,'PASS')
 }
 report.status='pass'
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
finally{const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');report.nativeSha256=sha('build/trace-engine/Release/trace_engine.node');report.mainSha256=sha('out-trace/main/index.js');fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/feedback/gate-latest.json'),JSON.stringify(report,null,2))}
