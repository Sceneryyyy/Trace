const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m6','gate-'+Date.now());fs.mkdirSync(folder,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const report={status:'running',folder,originalEbuGatePassed:false,hardware96kGatePassed:false,checks:[]},sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
const stages=[
 ['types',['node_modules/typescript/bin/tsc','--noEmit']],
 ['settings',['--test','test/m6-settings.test.mjs']],
 ['retention',['tools/m6/retention-test.cjs'],'artifacts/m6/retention-latest.json'],
 ['package-audit',['tools/m6/package-audit.cjs'],'artifacts/m6/package-audit-latest.json'],
 ['packaged-workflow',['tools/m6/package-smoke.cjs'],'artifacts/m6/package-latest.json'],
 ['ui-matrix',['tools/m6/ui-matrix.cjs'],'artifacts/m6/ui-latest.json'],
 ['long-file-resources',['tools/m6/resource-test.cjs'],'artifacts/m6/resources-latest.json']
]
if(process.argv.includes('--regression'))stages.unshift(['m5-regression',['tools/m5/gate.cjs'],'artifacts/m5/gate-latest.json'])
try{
 for(const [name,args,file]of stages){const begin=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:600000});fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.error||r.status!==0)throw r.error||Error(name+' failed: '+(r.stderr||'').slice(-1500))
 let evidence;if(file){const p=path.join(root,file);evidence=JSON.parse(fs.readFileSync(p,'utf8'));if(evidence.status!=='pass'||fs.statSync(p).mtimeMs<begin)throw Error(name+' stale/failed report');fs.copyFileSync(p,path.join(folder,name+'.json'))}
 report.checks.push({name,status:'pass',milliseconds:Date.now()-begin,count:evidence?.checks?.length});console.log('M6_GATE',name,'PASS')}
 const prior=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m5/gate-latest.json'),'utf8'))
 if(prior.status!=='pass'||prior.nativeSha256!==sha('build/trace-engine/Release/trace_engine.node')||prior.mainSha256!==sha('out-trace/main/index.js'))throw Error('Run M6 gate --regression for this native/main build')
 fs.copyFileSync(path.join(root,'artifacts/m5/gate-latest.json'),path.join(folder,'m5-regression.json'));report.reusedM5Evidence=prior.folder;report.status='pass'
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
finally{report.nativeSha256=sha('build/trace-engine/Release/trace_engine.node');report.mainSha256=sha('out-trace/main/index.js');report.asarSha256=sha(packageOutput+'/win-unpacked/resources/app.asar');fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m6/gate-latest.json'),JSON.stringify(report,null,2))}
