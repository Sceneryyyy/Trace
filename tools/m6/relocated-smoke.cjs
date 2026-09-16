const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),record=path.join(root,'artifacts/m6/archive-latest.json'),archive=JSON.parse(fs.readFileSync(record,'utf8'));assert.equal(archive.status,'pass')
const executable=path.join(root,archive.extracted,'Trace.exe'),env={...process.env,TRACE_PACKAGE_EXE:executable};delete env.ELECTRON_RUN_AS_NODE
const r=spawnSync(process.execPath,['tools/m6/package-smoke.cjs'],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:120000});fs.writeFileSync(path.join(root,archive.extracted,'..','smoke.log'),(r.stdout||'')+(r.stderr||''))
if(r.error||r.status!==0)throw r.error||Error(r.stderr)
const result=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m6/package-latest.json'),'utf8'));assert.equal(result.status,'pass');assert.equal(result.exeSha256,archive.exeSha256);assert.equal(result.info.resourcesPath,path.dirname(executable)+path.sep+'resources')
archive.relocatedSmokeFolder=path.relative(root,result.folder).replaceAll('\\','/');archive.checks[2]='Relocated package in a Chinese path passed all eight offline workflow checks';fs.writeFileSync(record,JSON.stringify(archive,null,2));console.log('M6_RELOCATED_PASS',result.checks.length)
