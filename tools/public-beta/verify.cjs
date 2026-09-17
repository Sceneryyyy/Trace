const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),config=require('../../electron-builder.trace.cjs'),dir=path.join(root,config.directories.output,'win-unpacked')
const folder=path.join(root,'artifacts/public-beta/final-'+Date.now()),env={...process.env,TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')};delete env.ELECTRON_RUN_AS_NODE
fs.mkdirSync(folder,{recursive:true});const report={status:'running',folder,version:config.extraMetadata.version,checks:[]}
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
function run(name,script,extra={},args=[]){
 console.log('START',name)
 const r=spawnSync(process.execPath,[script,...args],{cwd:root,env:{...env,...extra},encoding:'utf8',windowsHide:true,timeout:180000})
 fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''))
 if(r.error||r.status!==0)throw r.error||Error(name+': '+(r.stdout||'').slice(-800)+(r.stderr||'').slice(-800))
 report.checks.push(name);console.log('PASS',name)
}
try{
 run('support-contract-preferences','--test',{},['test/support-journal.test.mjs','test/trace-contracts.test.mjs','test/preferences-writer.test.mjs'])
 run('package-audit','tools/m6/package-audit.cjs')
 const audit=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m6/package-audit-latest.json')))
 fs.writeFileSync(path.join(folder,'package-audit.json'),JSON.stringify(audit,null,2))
 const zip=path.join(root,config.directories.output,'Trace-'+config.extraMetadata.version+'-Windows-x64.zip'),relocated=path.join(folder,'Trace 独立副本')
 const r=spawnSync(require('7zip-bin').path7za,['x',zip,'-o'+relocated,'-y'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0)
 for(const [file,entry]of Object.entries(audit.files))assert.equal(sha(path.join(relocated,file)),entry.sha256,file)
 report.checks.push('zip-97-files');report.zip={bytes:fs.statSync(zip).size,sha256:sha(zip)}
 run('single-instance-copies','tools/public-beta/single-instance.cjs',{TRACE_SECOND_EXE:path.join(relocated,'Trace.exe')})
 run('support-faults-ui','tools/public-beta/support-ui.cjs')
 run('react-error-boundary','tools/public-beta/react-boundary.cjs')
 run('layout-regression','tools/feedback-layout/ui.cjs')
 run('navigation-regression','tools/m6/iteration-one.cjs')
 run('record-encode-reopen','tools/m6/package-smoke.cjs',{TRACE_PACKAGE_EXE:path.join(relocated,'Trace.exe')})
 const startup=path.join(folder,'startup-fault'),users=path.join(startup,'users');fs.mkdirSync(users,{recursive:true})
 const failure=spawnSync(path.join(dir,'Trace.exe'),['--trace-test'],{env:{...env,TRACE_TEST_ROOT:startup,TRACE_TEST_USER_DATA:users,TRACE_TEST_STARTUP_FAILURE:'1'},encoding:'utf8',windowsHide:true,timeout:20000})
 assert.equal(failure.status,1);assert.equal(JSON.parse(fs.readFileSync(path.join(users,'support/fatal.json'))).kind,'startup-failed')
 report.checks.push('startup-failure-marker')
 report.asarSha256=sha(path.join(dir,'resources/app.asar'));report.nativeSha256=sha(path.join(dir,'resources/native/trace_engine.node'))
 assert.equal(report.nativeSha256,sha(path.join(root,'dist-trace/preview.26/win-unpacked/resources/native/trace_engine.node')))
 report.status='pass'
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('PUBLIC_BETA_GATES',report.status,folder)
