const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m7/final-'+Date.now()),config=require('../../electron-builder.trace.cjs'),dir=path.join(root,config.directories.output,'win-unpacked');
fs.mkdirSync(folder,{recursive:true});const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report={status:'running',folder,version:config.extraMetadata.version,asarSha256:sha(path.join(dir,'resources/app.asar')),stages:[]};
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
function run(name,script,extra={},args=[]){console.log('START',name);const r=cp.spawnSync(process.execPath,[script,...args],{cwd:root,env:{...env,...extra},encoding:'utf8',windowsHide:true,timeout:180000});fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.error||r.status!==0)throw r.error||Error(name+' failed: '+(r.stdout||'').slice(-900)+(r.stderr||'').slice(-900));report.stages.push(name);console.log('PASS',name)}
function copy(source,name){const d=JSON.parse(fs.readFileSync(path.join(root,source)));assert.equal(d.status,'pass');fs.writeFileSync(path.join(folder,name+'.json'),JSON.stringify(d,null,2));return d}
try{
 run('workspace-unit','node_modules/typescript/bin/tsc',{},['--noEmit']);
 run('workspace-tests','test/workspace-layout.test.mjs');
 run('package-audit','tools/m6/package-audit.cjs');const audit=copy('artifacts/m6/package-audit-latest.json','package-audit');
 for(const scale of [1,1.5,2]){run('workspace-ui-'+scale,'tools/m7/workspace-ui.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe'),TRACE_UI_SCALE:String(scale)});const result=copy('artifacts/m7/ui-latest.json','workspace-ui-'+scale);assert(!result.screenshotErrors?.length,'Missing visual capture');}
 run('navigation-regression','tools/m6/iteration-one.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')});copy('artifacts/iteration/one-latest.json','navigation');
 run('package-smoke','tools/m6/package-smoke.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')});copy('artifacts/m6/package-latest.json','package-smoke');
 const zip=path.join(root,config.directories.output,'Trace-'+config.extraMetadata.version+'-Windows-x64.zip'),unpack=path.join(folder,'Trace 预览'),seven=require('7zip-bin').path7za;
 for(const args of [['t',zip],['x',zip,'-o'+unpack,'-y']]){const r=cp.spawnSync(seven,args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout+r.stderr)}
 for(const [f,expected]of Object.entries(audit.files)){const p=path.join(unpack,f);assert.equal(fs.statSync(p).size,expected.bytes);assert.equal(sha(p),expected.sha256,f)}
 report.stages.push('zip-integrity-and-all-files');report.zip={path:path.relative(root,zip),bytes:fs.statSync(zip).size,sha256:sha(zip),fileCount:Object.keys(audit.files).length};console.log('PASS ZIP');
 run('relocated-smoke','tools/m6/package-smoke.cjs',{TRACE_PACKAGE_EXE:path.join(unpack,'Trace.exe')});copy('artifacts/m6/package-latest.json','relocated-smoke');
 assert.equal(sha(path.join(dir,'resources/app.asar')),report.asarSha256);
 report.nativeSha256=sha(path.join(dir,'resources/native/trace_engine.node'));report.executableSha256=sha(path.join(dir,'Trace.exe'));report.status='pass';
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m7/final-latest.json'),JSON.stringify(report,null,2));console.log('M7_FINAL',report.status,report.stages.length);
