const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),directory=path.join(root,packageOutput+'/win-unpacked'),gatePath=process.env.TRACE_ARCHIVE_GATE||'artifacts/m6/gate-latest.json',gate=JSON.parse(fs.readFileSync(path.join(root,gatePath),'utf8'))
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
assert.equal(gate.status,'pass');assert.equal(gate.asarSha256,sha(path.join(directory,'resources/app.asar')),'Package changed since M6 gate')
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;env.CSC_IDENTITY_AUTO_DISCOVERY='false'
function run(exe,args,cwd=root){const r=spawnSync(exe,args,{cwd,env,encoding:'utf8',windowsHide:true,timeout:300000});if(r.error||r.status!==0)throw r.error||Error(r.stdout+'\n'+r.stderr);return r.stdout}
run(process.execPath,['node_modules/electron-builder/cli.js','--config','electron-builder.trace.cjs','--prepackaged',directory,'--win','zip','--x64','--publish','never'])
const zip=path.join(root,packageOutput+'/Trace-'+packageVersion+'-Windows-x64.zip'),unpack=path.join(root,'artifacts/m6','zip-'+Date.now(),'Trace 预览');fs.mkdirSync(unpack,{recursive:true})
const seven=require('7zip-bin').path7za;run(seven,['t',zip]);run(seven,['x',zip,'-o'+unpack,'-y'])
const audit=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m6/package-audit-latest.json'),'utf8'));assert.equal(audit.status,'pass')
for(const [file,expected]of Object.entries(audit.files)){const dest=path.join(unpack,file);assert.equal(fs.statSync(dest).size,expected.bytes,file);assert.equal(sha(dest),expected.sha256,file)}
const report={status:'pass',zip:path.relative(root,zip).replaceAll('\\','/'),bytes:fs.statSync(zip).size,sha256:sha(zip),extracted:path.relative(root,unpack).replaceAll('\\','/'),fileCount:Object.keys(audit.files).length,asarSha256:sha(path.join(unpack,'resources/app.asar')),exeSha256:sha(path.join(unpack,'Trace.exe')),m6GateFolder:gate.folder,validationGate:gatePath,checks:['ZIP integrity passed','Every extracted file matches the tested package manifest','Ready for relocated package smoke']}
fs.writeFileSync(path.join(root,'artifacts/m6/archive-latest.json'),JSON.stringify(report,null,2));fs.writeFileSync(zip+'.sha256',report.sha256+'  '+path.basename(zip)+'\n');console.log('M6_ARCHIVE_PASS',report.bytes,report.fileCount)
