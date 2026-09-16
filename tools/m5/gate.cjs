const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','gate-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const report={status:'running',folder,originalEbuGatePassed:false,checks:[]}
const stages=[
 ['types',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']],
 ['export-contracts',process.execPath,['--test','test/export-contracts.test.mjs']],
 ['codec-matrix',process.execPath,['tools/m5/core-test.cjs'],'artifacts/m5/core-latest.json'],
 ['service',process.execPath,['tools/m5/service-test.cjs'],'artifacts/m5/service-latest.json'],
 ['manual-ui',process.execPath,['tools/m5/run-ui.cjs'],'artifacts/m5/ui-latest.json'],
 ['record-ui',require('electron'),['tools/m5/ui-record-formats.cjs','--trace-test'],'artifacts/m5/record-ui-latest.json'],
 ['normal-close',process.execPath,['tools/m5/close-test.cjs'],'artifacts/m5/close-latest.json'],
 ['hard-close',process.execPath,['tools/m5/crash-test.cjs'],'artifacts/m5/crash-latest.json'],
 ['m4-regression',process.execPath,['tools/m4/gate.cjs'],'artifacts/m4/gate-latest.json']
]
try{
 for(const [name,command,args,file]of stages){
  const begin=Date.now(),r=spawnSync(command,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:300000})
  fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''))
  if(r.error||r.status!==0)throw r.error||Error(name+' failed: '+(r.stderr||'').slice(-1500))
  let evidence
  if(file){const p=path.join(root,file);evidence=JSON.parse(fs.readFileSync(p,'utf8'));if(evidence.status!=='pass'||fs.statSync(p).mtimeMs<begin)throw Error(name+': '+(evidence.error||'stale/failed report'));fs.copyFileSync(p,path.join(folder,name+'.json'))}
  report.checks.push({name,status:'pass',milliseconds:Date.now()-begin,evidenceFolder:evidence?.folder,count:evidence?.checks?.length});console.log('M5_GATE',name,'PASS')
 }
 report.status='pass'
}catch(error){report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}
finally{
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
 report.nativeSha256=sha('build/trace-engine/Release/trace_engine.node');report.mainSha256=sha('out-trace/main/index.js')
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m5/gate-latest.json'),JSON.stringify(report,null,2))
}
