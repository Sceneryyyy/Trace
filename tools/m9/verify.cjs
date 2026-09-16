const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9/final-'+Date.now()),cfg=require('../../electron-builder.trace.cjs'),dir=path.join(root,cfg.directories.output,'win-unpacked'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
fs.mkdirSync(folder,{recursive:true});const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const report={status:'running',folder,version:cfg.extraMetadata.version,asarSha256:sha(path.join(dir,'resources/app.asar')),nativeSha256:sha(path.join(dir,'resources/native/trace_engine.node')),checks:[]}
function run(name,script,extra={},args=[]){console.log('START',name);const r=cp.spawnSync(process.execPath,[script,...args],{cwd:root,env:{...env,...extra},encoding:'utf8',windowsHide:true,timeout:240000});fs.writeFileSync(path.join(folder,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.error||r.status!==0)throw r.error||Error(name+': '+(r.stdout||'').slice(-900)+(r.stderr||'').slice(-900));report.checks.push(name);console.log('PASS',name)}
function copy(source,name){const data=JSON.parse(fs.readFileSync(path.join(root,source)));assert.equal(data.status,'pass');fs.writeFileSync(path.join(folder,name+'.json'),JSON.stringify(data,null,2));return data}
try{
 run('typecheck','node_modules/typescript/bin/tsc',{},['--noEmit'])
 const cases=[...JSON.parse(fs.readFileSync(path.join(root,'artifacts/iteration/final-js.json'))).files,'test/workspace-layout.test.mjs','test/instrument-service.test.mjs','test/snapshot-transport.test.mjs','test/canvas-surface.test.mjs','test/spectrogram-codec.test.mjs','test/spectrogram-store.test.mjs','test/spectrogram-service.test.mjs','test/spectrogram-presenter.test.mjs']
 const js=cp.spawnSync(process.execPath,['--test',...cases],{cwd:root,env,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(folder,'javascript.log'),(js.stdout||'')+(js.stderr||''));assert.equal(js.status,0,(js.stdout||'').slice(-1800));report.checks.push('javascript')
 run('native-bridge','tools/m8/run-native.cjs');copy('artifacts/m8/native-latest.json','native-bridge')
 run('spectral-native','tools/m9/run-native.cjs');copy('artifacts/m9/native-service-latest.json','spectral-native')
 run('spectral-ui','tools/m9/workspace-ui.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')});copy('artifacts/m9/ui-latest.json','spectral-ui')
 run('package-audit','tools/m6/package-audit.cjs');const audit=copy('artifacts/m6/package-audit-latest.json','package-audit')
 for(const scale of [1,1.5,2]){run('ui-'+scale,'tools/m8/workspace-ui.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe'),TRACE_UI_SCALE:String(scale)});const ui=copy('artifacts/m8/ui-latest.json','ui-'+scale);assert(ui.seekP95<=100,'seek p95 exceeds 100ms');assert.equal(ui.seekMs.length,100)}
 run('window-visibility','tools/m8/visibility-check.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')});copy('artifacts/m8/visibility-latest.json','window-visibility')
 run('old-navigation','tools/m6/iteration-one.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')});copy('artifacts/iteration/one-latest.json','old-navigation')
 run('package-smoke','tools/m6/package-smoke.cjs',{TRACE_PACKAGE_EXE:path.join(dir,'Trace.exe')});copy('artifacts/m6/package-latest.json','package-smoke')
 const zip=path.join(root,cfg.directories.output,'Trace-'+cfg.extraMetadata.version+'-Windows-x64.zip'),unpack=path.join(folder,'Trace 声迹'),seven=require('7zip-bin').path7za
 for(const args of [['t',zip],['x',zip,'-o'+unpack,'-y']]){const r=cp.spawnSync(seven,args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr)}
 for(const [file,expected]of Object.entries(audit.files)){const target=path.join(unpack,file);assert.equal(fs.statSync(target).size,expected.bytes);assert.equal(sha(target),expected.sha256)}
 report.zip={path:path.relative(root,zip),bytes:fs.statSync(zip).size,sha256:sha(zip),fileCount:Object.keys(audit.files).length};report.checks.push('zip-manifest')
 run('relocated-smoke','tools/m6/package-smoke.cjs',{TRACE_PACKAGE_EXE:path.join(unpack,'Trace.exe')});copy('artifacts/m6/package-latest.json','relocated-smoke')
 assert.equal(sha(path.join(dir,'resources/app.asar')),report.asarSha256);report.status='pass'
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m9/final-latest.json'),JSON.stringify(report,null,2));console.log('M9_FINAL',report.status,report.checks.length)
